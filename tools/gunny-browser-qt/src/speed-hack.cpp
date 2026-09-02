#include "speed-hack.h"

#include <windows.h>
#include <atomic>

#include "MinHook.h"
#include "flash-module.h"

namespace {

std::atomic<double> g_mult(1.0);
std::atomic<bool> g_installed(false);

std::atomic<uint64_t> g_callsFlash(0);
std::atomic<uint64_t> g_callsOther(0);

// Con trỏ trampoline do MinHook cấp: gọi qua đây là chạy phần thân gốc đã được
// dời đi chỗ khác, không quay lại bẫy -> không có chuyện đệ quy vô hạn như bản
// vá IAT cũ.
using TickFn = DWORD(WINAPI *)();
using Tick64Fn = ULONGLONG(WINAPI *)();
using QpcFn = BOOL(WINAPI *)(LARGE_INTEGER *);

TickFn g_origGetTickCount = nullptr;
Tick64Fn g_origGetTickCount64 = nullptr;
QpcFn g_origQpc = nullptr;
TickFn g_origTimeGetTime = nullptr;

// Mốc neo. Đổi hệ số thì neo lại để đồng hồ ảo đi tiếp từ chỗ cũ thay vì nhảy.
ULONGLONG g_realBaseMs = 0;
double g_virtualBaseMs = 0.0;
LONGLONG g_realBaseQpc = 0;
double g_virtualBaseQpc = 0.0;

// Địa chỉ trả về có nằm trong Flash không? __builtin_return_address(0) trong hàm
// bẫy cho ra chỗ mà NGƯỜI GỌI hàm gốc sẽ quay về, vì detour chỉ là một lệnh jmp
// đặt ở đầu hàm — khung ngăn xếp vẫn là của lời gọi ban đầu.
inline bool accountAndDecide(void *retAddr)
{
    if (FlashModule::containsAddress(retAddr)) {
        g_callsFlash.fetch_add(1, std::memory_order_relaxed);
        return true;
    }
    g_callsOther.fetch_add(1, std::memory_order_relaxed);
    return false;
}

inline double virtualMs(ULONGLONG real)
{
    return g_virtualBaseMs
           + (double)(real - g_realBaseMs) * g_mult.load(std::memory_order_relaxed);
}

DWORD WINAPI hookedGetTickCount()
{
    const DWORD real = g_origGetTickCount();
    if (!accountAndDecide(__builtin_return_address(0))) {
        return real;
    }
    return (DWORD)virtualMs(real);
}

ULONGLONG WINAPI hookedGetTickCount64()
{
    const ULONGLONG real = g_origGetTickCount64();
    if (!accountAndDecide(__builtin_return_address(0))) {
        return real;
    }
    return (ULONGLONG)virtualMs(real);
}

DWORD WINAPI hookedTimeGetTime()
{
    const DWORD real = g_origTimeGetTime();
    if (!accountAndDecide(__builtin_return_address(0))) {
        return real;
    }
    return (DWORD)virtualMs(real);
}

BOOL WINAPI hookedQueryPerformanceCounter(LARGE_INTEGER *out)
{
    if (!g_origQpc(out)) {
        return FALSE;
    }
    if (!accountAndDecide(__builtin_return_address(0))) {
        return TRUE;
    }
    const double delta = (double)(out->QuadPart - g_realBaseQpc);
    out->QuadPart =
        (LONGLONG)(g_virtualBaseQpc + delta * g_mult.load(std::memory_order_relaxed));
    return TRUE;
}

// Đặt một bẫy. GetProcAddress tự đi theo forwarder, nên với QueryPerformanceCounter
// (kernel32 chỉ chuyển tiếp sang kernelbase) ta nhận đúng địa chỉ phần thân thật
// và vá vào đó — Flash gọi qua kernel32 hay kernelbase đều dính.
template <typename Fn>
bool hookOne(HMODULE mod, const char *name, void *detour, Fn *original)
{
    FARPROC target = mod ? GetProcAddress(mod, name) : nullptr;
    if (!target) {
        return false;
    }
    return MH_CreateHook((LPVOID)target, detour, (LPVOID *)original) == MH_OK;
}

}  // namespace

namespace SpeedHack {

int install()
{
    if (g_installed.load()) {
        return 0;
    }
    if (!FlashModule::ensureHookEngine()) {
        return 0;
    }

    HMODULE k32 = GetModuleHandleW(L"kernel32.dll");
    HMODULE winmm = LoadLibraryW(L"winmm.dll");

    int n = 0;
    n += hookOne(k32, "GetTickCount", (void *)hookedGetTickCount, &g_origGetTickCount);
    n += hookOne(k32, "GetTickCount64", (void *)hookedGetTickCount64, &g_origGetTickCount64);
    n += hookOne(k32, "QueryPerformanceCounter", (void *)hookedQueryPerformanceCounter,
                 &g_origQpc);
    n += hookOne(winmm, "timeGetTime", (void *)hookedTimeGetTime, &g_origTimeGetTime);

    if (n == 0 || MH_EnableHook(MH_ALL_HOOKS) != MH_OK) {
        return 0;
    }

    // Neo mốc ngay khi bẫy bắt đầu chạy, đọc qua trampoline để lấy giờ thật.
    if (g_origGetTickCount) {
        g_realBaseMs = g_origGetTickCount();
        g_virtualBaseMs = (double)g_realBaseMs;
    }
    if (g_origQpc) {
        LARGE_INTEGER qpc;
        g_origQpc(&qpc);
        g_realBaseQpc = qpc.QuadPart;
        g_virtualBaseQpc = (double)g_realBaseQpc;
    }

    g_installed.store(true);
    return n;
}

bool locateFlash() { return FlashModule::locate(); }

void setMultiplier(double m)
{
    if (m < 0.1) m = 0.1;
    if (m > 20.0) m = 20.0;

    // Neo lại tại thời điểm hiện tại để đồng hồ ảo liên tục. Phải đọc giờ THẬT
    // qua trampoline, không gọi ::GetTickCount() vì lời gọi đó đi vào bẫy.
    if (g_origGetTickCount) {
        const ULONGLONG nowMs = g_origGetTickCount();
        g_virtualBaseMs = virtualMs(nowMs);
        g_realBaseMs = nowMs;
    }
    if (g_origQpc) {
        LARGE_INTEGER nowQpc;
        g_origQpc(&nowQpc);
        const double delta = (double)(nowQpc.QuadPart - g_realBaseQpc);
        g_virtualBaseQpc += delta * g_mult.load();
        g_realBaseQpc = nowQpc.QuadPart;
    }

    g_mult.store(m);
}

double multiplier() { return g_mult.load(); }

bool isHooked() { return g_installed.load() && FlashModule::found(); }

Stats stats()
{
    return {g_callsFlash.load(std::memory_order_relaxed),
            g_callsOther.load(std::memory_order_relaxed)};
}

}  // namespace SpeedHack

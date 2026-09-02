#include "speed-hack.h"

#include <windows.h>
#include <tlhelp32.h>

#include <atomic>
#include <cstring>
#include <cwchar>

namespace {

std::atomic<double> g_mult(1.0);
bool g_hooked = false;

// Mốc neo: thời điểm thực và thời gian ảo tương ứng. Đổi hệ số thì neo lại để
// đồng hồ ảo đi tiếp từ chỗ cũ thay vì nhảy.
DWORD g_realBaseMs = 0;
double g_virtualBaseMs = 0.0;
LARGE_INTEGER g_realBaseQpc = {};
double g_virtualBaseQpc = 0.0;

// Con trỏ tới hàm THẬT. Bắt buộc phải gọi qua đây chứ không gọi ::GetTickCount()
// trực tiếp: lời gọi đó đi qua IAT của chính exe này, mà IAT đó cũng bị vá ->
// hàm hook tự gọi lại chính nó và tràn ngăn xếp (0xC00000FD).
using TickFn = DWORD(WINAPI *)();
using QpcFn = BOOL(WINAPI *)(LARGE_INTEGER *);
TickFn g_realGetTickCount = nullptr;
QpcFn g_realQpc = nullptr;

double virtualMs(DWORD real)
{
    return g_virtualBaseMs + (double)(real - g_realBaseMs) * g_mult.load();
}

DWORD realTick()
{
    return g_realGetTickCount ? g_realGetTickCount() : 0;
}

DWORD WINAPI hookedGetTickCount()
{
    return (DWORD)virtualMs(realTick());
}

ULONGLONG WINAPI hookedGetTickCount64()
{
    return (ULONGLONG)virtualMs(realTick());
}

DWORD WINAPI hookedTimeGetTime()
{
    return (DWORD)virtualMs(realTick());
}

BOOL WINAPI hookedQueryPerformanceCounter(LARGE_INTEGER *out)
{
    LARGE_INTEGER real;
    if (!g_realQpc || !g_realQpc(&real)) {
        return FALSE;
    }
    const double delta = (double)(real.QuadPart - g_realBaseQpc.QuadPart);
    out->QuadPart = (LONGLONG)(g_virtualBaseQpc + delta * g_mult.load());
    return TRUE;
}

// Bảng tra: tên hàm -> hàm thay thế.
struct Entry { const char *name; FARPROC replacement; };

const Entry kHooks[] = {
    {"GetTickCount", (FARPROC)hookedGetTickCount},
    {"GetTickCount64", (FARPROC)hookedGetTickCount64},
    {"timeGetTime", (FARPROC)hookedTimeGetTime},
    {"QueryPerformanceCounter", (FARPROC)hookedQueryPerformanceCounter},
};

// NPSWF32.dll chỉ import đúng 22 hàm và không có hàm đo thời gian nào — Flash
// tra chúng lúc chạy qua GetProcAddress. Nên thay vì vá từng ô IAT (không có
// gì để vá), ta vá chính GetProcAddress: khi Flash hỏi xin một hàm thời gian
// thì đưa bản có nhân hệ số.
using GetProcAddressFn = FARPROC(WINAPI *)(HMODULE, LPCSTR);
GetProcAddressFn g_realGetProcAddress = nullptr;

FARPROC WINAPI hookedGetProcAddress(HMODULE mod, LPCSTR name)
{
    // Tra theo ordinal thì con trỏ nằm ở 16 bit thấp, không có tên để so.
    if (name && (ULONG_PTR)name > 0xFFFF) {
        for (const Entry &e : kHooks) {
            if (std::strcmp(name, e.name) == 0) {
                return e.replacement;
            }
        }
    }
    return g_realGetProcAddress(mod, name);
}

// Ghi đè một ô IAT (vùng này thường chỉ-đọc nên phải mở quyền ghi tạm thời).
void writeSlot(void **slot, FARPROC value)
{
    DWORD old = 0;
    if (!VirtualProtect(slot, sizeof(void *), PAGE_READWRITE, &old)) {
        return;
    }
    *slot = (void *)value;
    VirtualProtect(slot, sizeof(void *), old, &old);
}

// Địa chỉ thật của các hàm cần thay, lấy một lần lúc khởi tạo.
struct Target { FARPROC real; FARPROC replacement; };
Target g_targets[5];
int g_targetCount = 0;

void resolveTargets()
{
    if (g_targetCount) {
        return;
    }
    HMODULE k32 = GetModuleHandleW(L"kernel32.dll");
    HMODULE winmm = LoadLibraryW(L"winmm.dll");

    auto add = [](FARPROC real, FARPROC repl) {
        if (real) {
            g_targets[g_targetCount].real = real;
            g_targets[g_targetCount].replacement = repl;
            ++g_targetCount;
        }
    };

    g_realGetProcAddress = (GetProcAddressFn)GetProcAddress(k32, "GetProcAddress");
    g_realGetTickCount = (TickFn)GetProcAddress(k32, "GetTickCount");
    g_realQpc = (QpcFn)GetProcAddress(k32, "QueryPerformanceCounter");

    add((FARPROC)g_realGetProcAddress, (FARPROC)hookedGetProcAddress);
    add(GetProcAddress(k32, "GetTickCount"), (FARPROC)hookedGetTickCount);
    add(GetProcAddress(k32, "GetTickCount64"), (FARPROC)hookedGetTickCount64);
    add(GetProcAddress(k32, "QueryPerformanceCounter"), (FARPROC)hookedQueryPerformanceCounter);
    if (winmm) {
        add(GetProcAddress(winmm, "timeGetTime"), (FARPROC)hookedTimeGetTime);
    }
}

// Vá IAT bằng cách so khớp ĐỊA CHỈ, không so tên.
//
// NPSWF32.dll có OriginalFirstThunk = 0 (bảng tên import bị lược bỏ) nên không
// đọc được tên hàm từ file. Nhưng lúc chạy, mỗi ô trong FirstThunk đã chứa địa
// chỉ thật của hàm — so địa chỉ là đủ và không phụ thuộc bảng tên.
int patchImports(HMODULE mod)
{
    resolveTargets();

    BYTE *base = (BYTE *)mod;
    auto *dos = (IMAGE_DOS_HEADER *)base;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) {
        return 0;
    }
    auto *nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) {
        return 0;
    }
    const auto &dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if (!dir.VirtualAddress) {
        return 0;
    }

    int patched = 0;
    auto *desc = (IMAGE_IMPORT_DESCRIPTOR *)(base + dir.VirtualAddress);
    for (; desc->Name; ++desc) {
        if (!desc->FirstThunk) {
            continue;
        }
        auto *slot = (IMAGE_THUNK_DATA *)(base + desc->FirstThunk);
        for (; slot->u1.Function; ++slot) {
            FARPROC cur = (FARPROC)slot->u1.Function;
            for (int i = 0; i < g_targetCount; ++i) {
                if (cur == g_targets[i].real) {
                    writeSlot((void **)&slot->u1.Function, g_targets[i].replacement);
                    ++patched;
                    break;
                }
            }
        }
    }
    return patched;
}

// Tìm module Flash. GetModuleHandleW cần khớp đúng tên file; nếu WebKit nạp
// plugin dưới tên khác (NPSWF32_xx_x_x_x.dll chẳng hạn) thì quét danh sách
// module và khớp theo tiền tố.
HMODULE findFlashModule(const wchar_t *preferred)
{
    if (HMODULE m = GetModuleHandleW(preferred)) {
        return m;
    }

    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, GetCurrentProcessId());
    if (snap == INVALID_HANDLE_VALUE) {
        return nullptr;
    }

    MODULEENTRY32W me;
    me.dwSize = sizeof(me);
    HMODULE found = nullptr;
    if (Module32FirstW(snap, &me)) {
        do {
            if (_wcsnicmp(me.szModule, L"NPSWF", 5) == 0) {
                found = me.hModule;
                break;
            }
        } while (Module32NextW(snap, &me));
    }
    CloseHandle(snap);
    return found;
}

}  // namespace

namespace SpeedHack {

int applyToAll()
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, GetCurrentProcessId());
    if (snap == INVALID_HANDLE_VALUE) {
        return 0;
    }

    resolveTargets();

    // Neo mốc thời gian trước lần vá đầu tiên để đồng hồ ảo bắt đầu từ hiện tại.
    if (!g_hooked) {
        g_realBaseMs = realTick();
        g_virtualBaseMs = (double)g_realBaseMs;
        g_realQpc(&g_realBaseQpc);
        g_virtualBaseQpc = (double)g_realBaseQpc.QuadPart;
    }

    const HMODULE self = GetModuleHandleW(nullptr);

    // Chỉ vá DLL của ứng dụng (Flash, QtWebKit...). Đụng vào DLL hệ thống
    // trong C:\Windows — ntdll, kernel32, user32 — làm tiến trình sập ngay lúc
    // khởi động vì chính bộ nạp của Windows cũng đi qua các ô đó.
    wchar_t winDir[MAX_PATH] = {};
    const UINT winLen = GetWindowsDirectoryW(winDir, MAX_PATH);

    int total = 0;
    MODULEENTRY32W me;
    me.dwSize = sizeof(me);
    if (Module32FirstW(snap, &me)) {
        do {
            if (winLen && _wcsnicmp(me.szExePath, winDir, winLen) == 0) {
                continue;  // DLL hệ thống
            }
            if (me.hModule == self) {
                continue;  // exe của chính mình: hàm hook gọi qua IAT của nó
            }
            total += patchImports(me.hModule);
        } while (Module32NextW(snap, &me));
    }
    CloseHandle(snap);

    if (total > 0) {
        g_hooked = true;
    }
    return total;
}

bool applyTo(const wchar_t *moduleName)
{
    HMODULE mod = findFlashModule(moduleName);
    if (!mod) {
        return false;  // Flash chưa nạp
    }
    if (g_hooked) {
        return true;
    }

    g_realBaseMs = ::GetTickCount();
    g_virtualBaseMs = (double)g_realBaseMs;
    ::QueryPerformanceCounter(&g_realBaseQpc);
    g_virtualBaseQpc = (double)g_realBaseQpc.QuadPart;

    g_hooked = patchImports(mod) > 0;
    return g_hooked;
}

void setMultiplier(double m)
{
    if (m < 0.1) m = 0.1;
    if (m > 20.0) m = 20.0;

    // Neo lại tại thời điểm hiện tại để đồng hồ ảo liên tục.
    const DWORD nowMs = ::GetTickCount();
    g_virtualBaseMs = virtualMs(nowMs);
    g_realBaseMs = nowMs;

    LARGE_INTEGER nowQpc;
    ::QueryPerformanceCounter(&nowQpc);
    const double delta = (double)(nowQpc.QuadPart - g_realBaseQpc.QuadPart);
    g_virtualBaseQpc += delta * g_mult.load();
    g_realBaseQpc = nowQpc;

    g_mult.store(m);
}

double multiplier() { return g_mult.load(); }

bool isHooked() { return g_hooked; }

}  // namespace SpeedHack

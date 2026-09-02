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

double virtualMs(DWORD real)
{
    return g_virtualBaseMs + (double)(real - g_realBaseMs) * g_mult.load();
}

DWORD WINAPI hookedGetTickCount()
{
    return (DWORD)virtualMs(::GetTickCount());
}

ULONGLONG WINAPI hookedGetTickCount64()
{
    return (ULONGLONG)virtualMs(::GetTickCount());
}

DWORD WINAPI hookedTimeGetTime()
{
    return (DWORD)virtualMs(::GetTickCount());
}

BOOL WINAPI hookedQueryPerformanceCounter(LARGE_INTEGER *out)
{
    LARGE_INTEGER real;
    if (!::QueryPerformanceCounter(&real)) {
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

int patchImports(HMODULE mod)
{
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
        // OriginalFirstThunk giữ tên hàm, FirstThunk là ô địa chỉ cần vá.
        if (!desc->OriginalFirstThunk) {
            continue;
        }
        auto *nameThunk = (IMAGE_THUNK_DATA *)(base + desc->OriginalFirstThunk);
        auto *addrThunk = (IMAGE_THUNK_DATA *)(base + desc->FirstThunk);

        for (; nameThunk->u1.AddressOfData; ++nameThunk, ++addrThunk) {
            // Import theo ordinal thì không có tên để so -> bỏ qua.
            if (IMAGE_SNAP_BY_ORDINAL(nameThunk->u1.Ordinal)) {
                continue;
            }
            auto *imp = (IMAGE_IMPORT_BY_NAME *)(base + nameThunk->u1.AddressOfData);
            for (const Entry &e : kHooks) {
                if (std::strcmp((const char *)imp->Name, e.name) == 0) {
                    writeSlot((void **)&addrThunk->u1.Function, e.replacement);
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

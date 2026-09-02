#include "flash-module.h"

#include <windows.h>
#include <tlhelp32.h>

#include <atomic>
#include <cwchar>

#include "MinHook.h"

namespace {

std::atomic<uintptr_t> g_base(0);
std::atomic<uintptr_t> g_end(0);
std::atomic<bool> g_engineReady(false);

}  // namespace

namespace FlashModule {

bool ensureHookEngine()
{
    if (g_engineReady.load()) {
        return true;
    }
    // MH_ERROR_ALREADY_INITIALIZED cũng coi là thành công: có module khác gọi trước.
    const MH_STATUS st = MH_Initialize();
    if (st != MH_OK && st != MH_ERROR_ALREADY_INITIALIZED) {
        return false;
    }
    g_engineReady.store(true);
    return true;
}

bool locate()
{
    if (g_base.load()) {
        return true;
    }

    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, GetCurrentProcessId());
    if (snap == INVALID_HANDLE_VALUE) {
        return false;
    }

    bool ok = false;
    MODULEENTRY32W me;
    me.dwSize = sizeof(me);
    if (Module32FirstW(snap, &me)) {
        do {
            // WebKit có thể nạp plugin dưới tên NPSWF32_32_0_0_465.dll -> khớp tiền tố.
            if (_wcsnicmp(me.szModule, L"NPSWF", 5) == 0) {
                // Ghi end trước base: hàm bẫy đọc base trước, thấy base != 0 là
                // end đã chắc chắn hợp lệ.
                g_end.store((uintptr_t)me.modBaseAddr + me.modBaseSize);
                g_base.store((uintptr_t)me.modBaseAddr);
                ok = true;
                break;
            }
        } while (Module32NextW(snap, &me));
    }
    CloseHandle(snap);
    return ok;
}

bool found() { return g_base.load() != 0; }

bool containsAddress(const void *addr)
{
    const uintptr_t base = g_base.load(std::memory_order_relaxed);
    if (!base) {
        return false;
    }
    const uintptr_t a = (uintptr_t)addr;
    return a >= base && a < g_end.load(std::memory_order_relaxed);
}

}  // namespace FlashModule

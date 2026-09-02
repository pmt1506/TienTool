#include "packet-proxy.h"

#include <winsock2.h>
#include <windows.h>

#include <atomic>
#include <cstdio>
#include <mutex>

#include "MinHook.h"
#include "flash-module.h"

namespace {

using SendFn = int(WSAAPI *)(SOCKET, const char *, int, int);
using RecvFn = int(WSAAPI *)(SOCKET, char *, int, int);
using WsaSendFn = int(WSAAPI *)(SOCKET, LPWSABUF, DWORD, LPDWORD, DWORD, LPWSAOVERLAPPED,
                                LPWSAOVERLAPPED_COMPLETION_ROUTINE);
using WsaRecvFn = int(WSAAPI *)(SOCKET, LPWSABUF, DWORD, LPDWORD, LPDWORD, LPWSAOVERLAPPED,
                                LPWSAOVERLAPPED_COMPLETION_ROUTINE);

SendFn g_origSend = nullptr;
RecvFn g_origRecv = nullptr;
WsaSendFn g_origWsaSend = nullptr;
WsaRecvFn g_origWsaRecv = nullptr;

std::atomic<bool> g_installed(false);
std::atomic<uint64_t> g_sent(0), g_received(0), g_bytesSent(0), g_bytesReceived(0);

// Bảo vệ tệp nhật ký và observer. Socket của Flash chạy trên luồng riêng.
std::mutex g_mutex;
FILE *g_log = nullptr;
PacketProxy::Observer g_observer;

void writeHex(FILE *f, const uint8_t *data, size_t len)
{
    for (size_t i = 0; i < len; ++i) {
        std::fprintf(f, "%02x", data[i]);
    }
}

void record(PacketProxy::Direction dir, const uint8_t *data, size_t len)
{
    if (!len) {
        return;
    }
    const bool out = dir == PacketProxy::Direction::Outgoing;
    if (out) {
        g_sent.fetch_add(1, std::memory_order_relaxed);
        g_bytesSent.fetch_add(len, std::memory_order_relaxed);
    } else {
        g_received.fetch_add(1, std::memory_order_relaxed);
        g_bytesReceived.fetch_add(len, std::memory_order_relaxed);
    }

    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_log) {
        // Một dòng một gói: thời điểm, chiều, độ dài, rồi toàn bộ byte dạng hex.
        // Dạng này grep/diff được giữa hai lần bắt để tìm gói vào trận.
        std::fprintf(g_log, "%lu %s %zu ", (unsigned long)GetTickCount(), out ? "OUT" : "IN", len);
        writeHex(g_log, data, len);
        std::fputc('\n', g_log);
        std::fflush(g_log);
    }
    if (g_observer) {
        g_observer(dir, data, len);
    }
}

// Chỉ quan tâm lời gọi phát ra từ Flash. Qt cũng dùng winsock cho HTTP của
// WebKit; không lọc thì nhật ký ngập ảnh và ashx.
inline bool fromFlash(const void *ret) { return FlashModule::containsAddress(ret); }

int WSAAPI hookedSend(SOCKET s, const char *buf, int len, int flags)
{
    const bool mine = fromFlash(__builtin_return_address(0));
    const int n = g_origSend(s, buf, len, flags);
    if (mine && n > 0) {
        record(PacketProxy::Direction::Outgoing, (const uint8_t *)buf, (size_t)n);
    }
    return n;
}

int WSAAPI hookedRecv(SOCKET s, char *buf, int len, int flags)
{
    const bool mine = fromFlash(__builtin_return_address(0));
    const int n = g_origRecv(s, buf, len, flags);
    if (mine && n > 0) {
        record(PacketProxy::Direction::Incoming, (const uint8_t *)buf, (size_t)n);
    }
    return n;
}

// WSASend/WSARecv nhận một mảng buffer. Chỉ ghi được khi lời gọi hoàn tất ngay
// (overlapped == nullptr); dạng overlapped thật sự thì dữ liệu tới sau, ở
// completion routine — nếu nhật ký trống mà game vẫn chạy thì phải bẫy thêm chỗ đó.
void recordBuffers(PacketProxy::Direction dir, LPWSABUF bufs, DWORD count, DWORD transferred)
{
    DWORD left = transferred;
    for (DWORD i = 0; i < count && left; ++i) {
        const DWORD take = bufs[i].len < left ? bufs[i].len : left;
        record(dir, (const uint8_t *)bufs[i].buf, take);
        left -= take;
    }
}

int WSAAPI hookedWsaSend(SOCKET s, LPWSABUF bufs, DWORD count, LPDWORD sent, DWORD flags,
                         LPWSAOVERLAPPED ov, LPWSAOVERLAPPED_COMPLETION_ROUTINE cr)
{
    const bool mine = fromFlash(__builtin_return_address(0));
    const int r = g_origWsaSend(s, bufs, count, sent, flags, ov, cr);
    if (mine && r == 0 && !ov && sent) {
        recordBuffers(PacketProxy::Direction::Outgoing, bufs, count, *sent);
    }
    return r;
}

int WSAAPI hookedWsaRecv(SOCKET s, LPWSABUF bufs, DWORD count, LPDWORD received, LPDWORD flags,
                         LPWSAOVERLAPPED ov, LPWSAOVERLAPPED_COMPLETION_ROUTINE cr)
{
    const bool mine = fromFlash(__builtin_return_address(0));
    const int r = g_origWsaRecv(s, bufs, count, received, flags, ov, cr);
    if (mine && r == 0 && !ov && received) {
        recordBuffers(PacketProxy::Direction::Incoming, bufs, count, *received);
    }
    return r;
}

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

namespace PacketProxy {

int install()
{
    if (g_installed.load()) {
        return 0;
    }
    if (!FlashModule::ensureHookEngine()) {
        return 0;
    }

    // ws2_32 thường đã nạp sẵn, nhưng LoadLibrary cho chắc và để giữ nó lại.
    HMODULE ws2 = LoadLibraryW(L"ws2_32.dll");

    int n = 0;
    n += hookOne(ws2, "send", (void *)hookedSend, &g_origSend);
    n += hookOne(ws2, "recv", (void *)hookedRecv, &g_origRecv);
    n += hookOne(ws2, "WSASend", (void *)hookedWsaSend, &g_origWsaSend);
    n += hookOne(ws2, "WSARecv", (void *)hookedWsaRecv, &g_origWsaRecv);

    if (n == 0 || MH_EnableHook(MH_ALL_HOOKS) != MH_OK) {
        return 0;
    }
    g_installed.store(true);
    return n;
}

bool startCapture(const wchar_t *path)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_log) {
        std::fclose(g_log);
        g_log = nullptr;
    }
    if (!path || !*path) {
        return true;
    }
    g_log = _wfopen(path, L"w");
    return g_log != nullptr;
}

void stopCapture() { startCapture(nullptr); }

bool isCapturing()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    return g_log != nullptr;
}

void setObserver(Observer observer)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    g_observer = std::move(observer);
}

Stats stats()
{
    return {g_sent.load(std::memory_order_relaxed), g_received.load(std::memory_order_relaxed),
            g_bytesSent.load(std::memory_order_relaxed),
            g_bytesReceived.load(std::memory_order_relaxed)};
}

}  // namespace PacketProxy

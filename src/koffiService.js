// koffi

import koffi from "koffi";

// ─── KOFFI WIN32 API ─────────────────────────────────────────────
const user32 = koffi.load("user32.dll");

const EnumWindowsProc = koffi.proto("bool __stdcall EnumWindowsProc(void* hwnd, long lParam)");
const EnumWindows = user32.func("bool __stdcall EnumWindows(EnumWindowsProc *func, long lParam)");
const GetWindowThreadProcessId = user32.func("uint32 __stdcall GetWindowThreadProcessId(void* hwnd, _Out_ uint32* lpdwProcessId)");
const SetWindowTextW = user32.func("bool __stdcall SetWindowTextW(void* hwnd, str16 lpString)");
const SetWindowPos = user32.func("bool __stdcall SetWindowPos(void* hwnd, void* hwndInsertAfter, int x, int y, int cx, int cy, uint32 uFlags)");
const GetWindowRect = user32.func("bool __stdcall GetWindowRect(void* hwnd, _Out_ int* lpRect)");
const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(void* hwnd)");
const GetWindowTextLengthW = user32.func("int __stdcall GetWindowTextLengthW(void* hwnd)");
const GetWindowTextW = user32.func("int __stdcall GetWindowTextW(void* hwnd, _Out_ uint16_t* lpString, int nMaxCount)");
const SendMessageW = user32.func("intptr __stdcall SendMessageW(void* hwnd, uint32 msg, uintptr wParam, intptr lParam)");
const FindWindowW = user32.func("void* __stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)");
const GetClassNameW = user32.func("int __stdcall GetClassNameW(void* hwnd, _Out_ uint16_t* lpClassName, int nMaxCount)");

const SWP_NOZORDER = 0x0004;
const SWP_SHOWWINDOW = 0x0040;
const SWP_NOSIZE = 0x0001; // Optional if we only want to move

function renameWindowByPid(targetPid, newName) {
    let foundHwnd = null;

    const callback = koffi.register((hwnd, lParam) => {
        let pidOut = [0];
        GetWindowThreadProcessId(hwnd, pidOut);
        if (pidOut[0] === targetPid) {
            foundHwnd = hwnd;
            return false; // Stop
        }
        return true;
    }, koffi.pointer(EnumWindowsProc));

    EnumWindows(callback, 0);
    koffi.unregister(callback);

    if (foundHwnd) {
        SetWindowTextW(foundHwnd, newName);
        return true;
    }
    return false;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

export async function waitAndRename(pid, newName, retries = 20, interval = 250) {
    for (let i = 0; i < retries; i++) {
        await delay(interval);
        if (renameWindowByPid(pid, newName)) {
            console.log(`[WindowRename] Thành công đổi tên cửa sổ thành: ${newName} (PID: ${pid})`);
            return;
        }
    }
    console.log(`[WindowRename] Hết thời gian chờ cửa sổ của PID ${pid}`);
}

function findHwndByPid(targetPid) {
    let foundHwnd = null;
    const callback = koffi.register((hwnd, lParam) => {
        let pidOut = [0];
        GetWindowThreadProcessId(hwnd, pidOut);
        if (pidOut[0] === targetPid) {
            // Only target visible windows with titles to avoid background splash screens/white boxes
            if (IsWindowVisible(hwnd)) {
                const titleLen = GetWindowTextLengthW(hwnd);
                if (titleLen > 0) {
                    foundHwnd = hwnd;
                    return false;
                }
            }
        }
        return true;
    }, koffi.pointer(EnumWindowsProc));

    EnumWindows(callback, 0);
    koffi.unregister(callback);
    return foundHwnd;
}

export function moveWindowByPid(pid, x, y, width, height, useSize = true) {
    const hwnd = findHwndByPid(pid);
    if (hwnd) {
        let flags = SWP_NOZORDER | SWP_SHOWWINDOW;
        if (!useSize) {
            flags |= SWP_NOSIZE;
        }
        SetWindowPos(hwnd, null, x, y, width, height, flags);
        return true;
    }
    return false;
}

export function getWindowRectByPid(pid) {
    const hwnd = findHwndByPid(pid);
    if (hwnd) {
        let rect = [0, 0, 0, 0]; // left, top, right, bottom
        if (GetWindowRect(hwnd, rect)) {
            return {
                left: rect[0],
                top: rect[1],
                right: rect[2],
                bottom: rect[3],
                width: rect[2] - rect[0],
                height: rect[3] - rect[1]
            };
        }
    }
    return null;
}
const WM_CLOSE = 0x0010;

export function autoCloseAlertByTitle(titleSubstring) {
    let closedCount = 0;
    const lowerSubstring = titleSubstring.toLowerCase();

    const callback = koffi.register((hwnd, lParam) => {
        if (IsWindowVisible(hwnd)) {
            const titleLen = GetWindowTextLengthW(hwnd);
            if (titleLen > 0) {
                const buf = Buffer.alloc((titleLen + 1) * 2);
                const actualTitleLen = GetWindowTextW(hwnd, buf, titleLen + 1);
                const title = buf.toString("utf16le", 0, actualTitleLen * 2);

                if (title.toLowerCase().includes(lowerSubstring)) {
                    const classBuf = Buffer.alloc(512);
                    const classLen = GetClassNameW(hwnd, classBuf, 256);
                    const className = classBuf.toString("utf16le", 0, classLen * 2);

                    console.log(`[AutoClose] Found alert window: "${title}" (Class: ${className}), closing...`);
                    SendMessageW(hwnd, WM_CLOSE, 0, 0);
                    closedCount++;
                }
            }
        }
        return true;
    }, koffi.pointer(EnumWindowsProc));

    EnumWindows(callback, 0);
    koffi.unregister(callback);
    return closedCount;
}
// ─────────────────────────────────────────────────────────────────

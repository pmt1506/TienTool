// koffi

import koffi from "koffi";

// ─── KOFFI WIN32 API ─────────────────────────────────────────────
const user32 = koffi.load("user32.dll");

const EnumWindowsProc = koffi.proto("bool __stdcall EnumWindowsProc(void* hwnd, long lParam)");
const EnumWindows = user32.func("bool __stdcall EnumWindows(EnumWindowsProc *func, long lParam)");
const GetWindowThreadProcessId = user32.func("uint32 __stdcall GetWindowThreadProcessId(void* hwnd, _Out_ uint32* lpdwProcessId)");
const SetWindowTextW = user32.func("bool __stdcall SetWindowTextW(void* hwnd, str16 lpString)");

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
// ─────────────────────────────────────────────────────────────────
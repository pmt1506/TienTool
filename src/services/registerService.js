import { BrowserWindow } from "electron";
import { loginApi } from "./loginService.js";
import { getSerialNumber } from "../utils.js";

export async function registerCharacter(userName, password, serverID, prefix, maxLength) {
    const serialNumber = getSerialNumber();
    const apiResult = await loginApi(userName, password, serialNumber);

    if (!apiResult.success) {
        return { success: false, msg: apiResult.msg };
    }

    try {
        const token = apiResult.token;
        return await ensureCharacterExists(userName, token, serverID, prefix, maxLength);
    } catch (err) {
        return { success: false, msg: "Lỗi hệ thống: " + err.message };
    }
}

export async function ensureCharacterExists(userName, token, serverID, prefix, maxLength) {
    try {
        const redirectUrl = `http://play.gunnylaumienphi2017.com/RedircetPlayGame?user=${token}&s=${serverID}`;

        console.log(`[Register] Verifying character for ${userName}...`);
        console.log(`[Register] Redirect URL: ${redirectUrl}`);

        let registerAttempts = 0;
        let timeoutId;

        return new Promise((resolve) => {
            const win = new BrowserWindow({
                show: false, // Run in background
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            win.webContents.on('did-navigate', async (event, url) => {
                console.log(`[Register] Navigated to: ${url}`);

                if (url.includes('play.gunnylaumienphi2017.com/Register')) {
                    registerAttempts++;
                    console.log(`[Register] No character found, starting registration...`);
                    console.log(`[Register] Detected Register page, attempt ${registerAttempts}...`);

                    if (registerAttempts > 1) {
                        // Probably reloaded because of an error
                        try {
                            const errorHTML = await win.webContents.executeJavaScript(`document.getElementById('lbError') ? document.getElementById('lbError').innerHTML : ''`);
                            console.log(`[Register] Error from lbError: ${errorHTML}`);
                            if (errorHTML && errorHTML.trim() !== "") {
                                win.close();
                                clearTimeout(timeoutId);
                                resolve({ success: false, msg: "Lỗi tạo NV: " + errorHTML.replace(/(<([^>]+)>)/gi, "").trim() });
                                return;
                            }
                        } catch (e) { }

                        if (registerAttempts > 3) {
                            win.close();
                            clearTimeout(timeoutId);
                            resolve({ success: false, msg: "Không thể đăng ký (lặp lại quá nhiều lần)" });
                            return;
                        }
                    }

                    try {
                        const execResult = await win.webContents.executeJavaScript(`
                                                    (function() {
                            const prefix = "${prefix}";
                            const maxLength = 14;

                            const randomLen = Math.max(0, maxLength - prefix.length);

                            let rand = "";
                            while (rand.length < randomLen) {
                                rand += Math.random().toString(36).substring(2).toUpperCase();
                            }

                            rand = rand.substring(0, randomLen);

                            const userInput = prefix + rand;

                            const nicknameInput = document.getElementById('txtNickName');
                            if (nicknameInput) {
                                nicknameInput.value = userInput;

                                const btnReg = document.getElementById('btnReg');
                                if (btnReg) {
                                    setTimeout(() => btnReg.click(), 500);
                                    return "clicked " + userInput;
                                }
                            }
                            return "not_found";
                        })();
                        `);
                        console.log(`[Register] Script execution result: ${execResult}`);
                    } catch (e) {
                        console.error("[Register] Injection error:", e);
                    }
                } else if (url.includes('play.gunnylaumienphi2017.com/PlayGame')) {
                    console.log(`[Register] Detected PlayGame page, registration successful`);
                    win.close();
                    clearTimeout(timeoutId);
                    resolve({ success: true, msg: "Đăng ký thành công" });
                }
            });

            win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                console.error(`[Register] Page failed to load: ${validatedURL} (${errorCode} - ${errorDescription})`);
            });

            win.on('closed', () => {
                clearTimeout(timeoutId);
                resolve({ success: false, msg: "Cửa sổ bị đóng trước khi hoàn tất" });
            });

            timeoutId = setTimeout(() => {
                console.log(`[Register] Timeout reached (15s)`);
                if (!win.isDestroyed()) {
                    win.close();
                }
                resolve({ success: false, msg: "Quá thời gian (Timeout) khi đăng ký" });
            }, 15000);

            win.loadURL(redirectUrl);
        });

    } catch (err) {
        return { success: false, msg: "Lỗi hệ thống: " + err.message };
    }
}

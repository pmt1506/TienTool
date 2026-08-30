
import fs from 'fs/promises';
import config from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, ipcMain } from 'electron';

// fix __dirname cho ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function cleanCaptchaText(raw) {
    return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getCaptchaApiKey() {
    return config.captcha.apiNinjaKey;
}

// PARENT_DIR should be resolved inside functions to ensure app is ready
function getParentDir() {
    return app ? app.getPath('userData') : __dirname;
}

// ─────────────────────────────────────────────
// 🖼️ Get Captcha Image
// ─────────────────────────────────────────────
export async function getCaptchaImage() {
    const apiUrl = `${config.api.base}/api/oauth/GetCaptcha`;

    const res = await fetch(apiUrl, {
        method: 'POST',
    });

    const imgString = await res.text();

    // bỏ dấu " giống C#
    const base64 = imgString.replace(/"/g, '').trim();

    const buffer = Buffer.from(base64, 'base64');

    const filePath = path.join(getParentDir(), 'download.png');

    await fs.writeFile(filePath, buffer);

    return filePath;
}

// OCR captcha qua api-ninjas
export async function ocrCaptchaNinja(imgPath, apiKey) {
    const apiUrl = 'https://api.api-ninjas.com/v1/imagetotext';
    const fileBuffer = await fs.readFile(imgPath);
    const formData = new FormData();
    formData.append('image', new Blob([fileBuffer]), 'download.png');

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: formData,
    });

    const json = await res.text();
    try {
        const data = JSON.parse(json);
        if (Array.isArray(data) && data.length > 0) {
            return cleanCaptchaText(data[0]?.text || '');
        }
        if (data?.error) {
            console.log(`⚠️ api-ninjas lỗi: ${data.error}`);
        }
    } catch {
        // phản hồi không phải JSON — coi như đọc thất bại
    }
    return '';
}

// Lấy + giải captcha bằng API Ninja
export async function getCaptcha(checkStop) {
    const { retryDelayMs, minLength, maxAttempts } = config.captcha;
    const cap = maxAttempts || 15;
    const apiKey = getCaptchaApiKey();

    if (!apiKey) {
        console.log('❌ Chưa cấu hình API_NINJA — không thể giải captcha.');
        return null;
    }

    for (let attempt = 0; attempt < cap; attempt++) {
        if (checkStop && checkStop()) return null;

        const imgPath = await getCaptchaImage();
        const captcha = await ocrCaptchaNinja(imgPath, apiKey);

        if (captcha && captcha.length >= minLength) {
            return captcha;
        }

        await new Promise((r) => setTimeout(r, retryDelayMs));
    }

    console.log(`❌ Không giải được captcha sau ${cap} lần thử.`);
    return null;
}


// ─────────────────────────────────────────────
// 🔑 Get Login Token
// ─────────────────────────────────────────────
export async function getLoginToken(username, password, checkStop) {
    const apiUrl = `${config.api.base}/api/oauth/Token`;
    // Trần số lần submit để không treo khi server liên tục từ chối captcha
    // (OCR sai) hoặc khi captcha không giải được. Bình thường chỉ cần ~1-2 lần.
    const maxLogin = config.captcha.maxAttempts || 15;

    for (let attempt = 0; attempt < maxLogin; attempt++) {
        if (checkStop && checkStop()) return null;
        console.log(`🔑 Login attempt for ${username}`);

        const captcha = await getCaptcha(checkStop);
        if (checkStop && checkStop()) return null;
        if (!captcha) {
            console.log(`❌ Không lấy được captcha cho ${username} — dừng.`);
            return null; // fail-fast: caller coi như đăng nhập thất bại
        }

        const payload = {
            username,
            password,
            Token: '',
            msg: '',
            result: true,
            Captcha: captcha,
        };

        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const jsonText = await res.text();

            let data;
            try {
                data = JSON.parse(jsonText);
            } catch {
                console.log('⚠️ Parse JSON failed, retrying...');
                continue;
            }

            if (data?.result === true) {
                const token = data.Token;

                console.log(`✅ Login successful for ${username}`);

                // ghi file giống C#
                // const filePath = path.join(PARENT_DIR, 'loginToken.txt');
                // await fs.writeFile(filePath, token, 'utf-8');


                // check nếu ko có nhân vật mặc định thì set mặc định

                if (data?.UserInfo?.UserIdDefault === 0 && data?.UserInfo?.ServerIdDefault === 0) {
                    const characters = await getAllNickName(token);
                    
                    if (characters && characters.length > 0) {
                        let selectedChar = null;
                        
                        // Mở popup cho user chọn
                        selectedChar = await new Promise((resolve) => {
                            const win = new BrowserWindow({
                                width: 400,
                                height: 300,
                                alwaysOnTop: true,
                                title: 'Chọn nhân vật mặc định',
                                autoHideMenuBar: true,
                                webPreferences: {
                                    nodeIntegration: true,
                                    contextIsolation: false
                                }
                            });

                            const optionsHtml = characters.map((c, i) => {
                                const safeName = c.NickName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                return `<option value="${i}">${safeName} (Server ${c.ServerId})</option>`;
                            }).join('');

                            const html = `
                                <html>
                                    <body style="background: #1e1e1e; color: white; font-family: sans-serif; padding: 20px; text-align: center;">
                                        <h3>Chọn nhân vật mặc định cho ${username}</h3>
                                        <select id="charSelect" style="width: 100%; padding: 8px; margin-bottom: 20px; font-size: 16px;">
                                            ${optionsHtml}
                                        </select>
                                        <button id="btnSelect" style="padding: 10px 20px; cursor: pointer; font-size: 16px; background: #007bff; color: white; border: none; border-radius: 4px;">Chọn làm mặc định</button>
                                        <script>
                                            const { ipcRenderer } = require('electron');
                                            document.getElementById('btnSelect').onclick = () => {
                                                const idx = document.getElementById('charSelect').value;
                                                ipcRenderer.send('select-character-done', idx);
                                            };
                                        </script>
                                    </body>
                                </html>
                            `;

                            win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

                            const handler = (event, idx) => {
                                if (event.sender === win.webContents) {
                                    ipcMain.removeListener('select-character-done', handler);
                                    win.close();
                                    resolve(characters[parseInt(idx)]);
                                }
                            };

                            ipcMain.on('select-character-done', handler);

                            win.on('closed', () => {
                                ipcMain.removeListener('select-character-done', handler);
                                resolve(null);
                            });
                        });

                        if (selectedChar) {
                            try {
                                const result = await setAccountDefault(token, selectedChar);
                                console.log(`✅ Set default account successful for ${username}: ${result}`);
                                
                                // Cập nhật lại userId và serverId để trả về
                                return {
                                    token: token,
                                    userId: selectedChar.UserId,
                                    serverId: selectedChar.ServerId
                                };
                            } catch (setErr) {
                                console.log(`❌ Lỗi khi set nhân vật mặc định: ${setErr.message}`);
                            }
                        } else {
                            console.log(`⚠️ Người dùng đã huỷ chọn nhân vật cho ${username}`);
                        }
                    }
                }

                return {
                    token: token,
                    userId: data?.UserInfo?.UserIdDefault,
                    serverId: data?.UserInfo?.ServerIdDefault
                };
            } else {
                const msg = data?.msg || 'No error message';

                // msg	"Tài khoản hoặc mật khẩu không chính xác !" -- break
                if (msg === 'Tài khoản hoặc mật khẩu không chính xác !') {
                    break;
                }

                console.log(`❌ Login failed for ${username}: ${msg}, retrying...`);
            }
        } catch (err) {
            console.log(`⚠️ Request failed: ${err.message}`);
        }
    }

    console.log(`❌ Đăng nhập ${username} thất bại sau ${maxLogin} lần thử.`);
    return null; // fail-fast: hết trần số lần
}

export async function getAllNickName(token) {
    const apiUrl = `${config.api.base}/api/Function/GetAllNickName`;

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
        },
        body: JSON.stringify({
            Token: token,
        }),
    });

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        console.log(`[getAllNickName] Phản hồi không phải JSON: ${text}`);
        return [];
    }

    // check nếu json.result = true 
    if (json.result === true && Array.isArray(json.ListNickName)) {
        return json.ListNickName;
    }
    return [];
}

export async function setAccountDefault(token, defaultAccount) {
    const apiUrl = `${config.api.base}/api/Function/SetAccountDefault`;

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
        },
        body: JSON.stringify({ "ServerId": defaultAccount.ServerId, "UserId": defaultAccount.UserId, "Otp": "", "Code": "", "Money": 0, "Captcha": "" }),
    });

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error(`Phản hồi không phải JSON: ${text}`);
    }

    return json.msg;
}
import axios from "axios";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { shell } from "electron";
import { getSerialNumber } from "../utils.js";
import { ensureCharacterExists } from "./registerService.js";
import { createGameSession } from "./gameSessionService.js";
import config from "../config.js";
import { getWebToken } from './web-token-cache.js';


export async function loginApi(userName, password, serialNumber) {
    try {
        const params = new URLSearchParams();
        params.append("username", userName);
        params.append("password", password);
        params.append("PublicKey", "PublicKey-" + serialNumber);

        const response = await axios.post(
            "http://api.gnddt.com/api/Launcher/LauncherWebV566",
            params.toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36",
                    "Accept": "*/*",
                    "Connection": "keep-alive"
                },
                timeout: 10000
            }
        );

        let text = response.data;

        if (typeof text !== "string") {
            text = JSON.stringify(text);
        }

        text = text.replace(/"/g, "");

        if (text === "0") {
            return {
                success: false,
                msg: "Tài khoản đã bị khóa, liên hệ admin để biết thêm chi tiết."
            };
        }

        if (text === "1") {
            return {
                success: false,
                msg: "Tài khoản hoặc mật khẩu không chính xác."
            };
        }

        return {
            success: true,
            token: text
        };

    } catch (err) {
        if (err.response) {
            console.log("STATUS:", err.response.status);
            console.log("HEADERS:", err.response.headers);
            console.log("DATA:", err.response.data);
        } else {
            console.log("ERROR:", err.message);
        }

        return {
            success: false,
            msg: "Lỗi gọi API"
        };
    }
}

/**
 * Đọc stdout/stderr của cửa sổ game rồi đẩy sang bảng log của TienTool.
 *
 * Cắt theo dòng chứ không in thẳng từng mẩu: pipe trả về theo khối byte, một
 * dòng log có thể bị chẻ làm đôi giữa hai lần 'data'.
 */
function pipeGameOutput(child, userName) {
    const pump = (stream, isError) => {
        if (!stream) return;
        let buffer = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                const msg = `[Game ${userName}] ${line.trim()}`;
                if (isError) console.error(msg);
                else console.log(msg);
            }
        });
        stream.on("error", () => {});
    };

    pump(child.stdout, false);
    pump(child.stderr, true);
}

export async function loginGame(userName, password, serverID, accountType, prefix, maxLength, checkReg = true) {
    const serialNumber = getSerialNumber();
    const apiResult = await loginApi(userName, password, serialNumber);

    if (!apiResult.success) {
        return { success: false, msg: apiResult.msg };
    }

    try {
        const token = apiResult.token;

        // 1. Ensure character exists (Auto Register if not)
        const isClone = accountType === 2 || accountType === "2" || accountType === 0 || accountType === "0";
        if (isClone && checkReg !== false) {
            console.log(`[Login] Checking/Creating character for clone account ${userName}...`);
            const ensureRes = await ensureCharacterExists(userName, token, serverID, prefix, maxLength);
            if (!ensureRes.success) {
                return { success: false, msg: ensureRes.msg };
            }
        } else {
            console.log(`[Login] Skipping character check for account ${userName} (type: ${accountType}, checkReg: ${checkReg})`);
        }

        // 2. Mở game. Ưu tiên launcher tự viết (nhận --swf và tự gắn Referer
        //    play.gnddt.com); chưa build thì lùi về GunnyBrowser.exe gốc.
        let filePath = path.resolve(config.game.browserExe);
        let args;

        if (fs.existsSync(filePath)) {
            const session = await createGameSession(userName, token, serverID);
            if (!session.success) {
                return { success: false, msg: session.msg };
            }
            args = ["--swf", session.swfUrl, "--title", `Gunny - ${userName}`];

            // Kèm token webshop để launcher gọi được API mua hộp thẻ. Lấy qua
            // cache nên chỉ giải captcha lần đầu trong ngày; hỏng thì bỏ qua,
            // game vẫn mở bình thường, chỉ mất mấy nút mua thẻ.
            try {
                const web = await getWebToken(userName, password);
                if (web?.token) {
                    args.push("--webtoken", web.token,
                              "--userid", String(web.userId ?? 0),
                              "--serverid", String(serverID));
                }
            } catch (webErr) {
                console.log(`[Login] Khong lay duoc token webshop: ${webErr.message}`);
            }
        } else {
            filePath = `${config.game.clientDir}/GunnyBrowser.exe`;
            args = [userName, token, serverID.toString(), "0", serialNumber, "0"];
        }

        if (!fs.existsSync(filePath)) {
            shell.openExternal("https://drive.google.com/drive/folders/1lhFDUdq1_TKkh1P8WmLH0XFULCOm-Ryc");
            return {
                success: false,
                msg: "Bạn chưa cài game. Đang mở link tải..."
            };
        }

        const appPlayer = spawn(filePath, args, {
            // Chạy trong thư mục của chính exe: Qt tìm plugin và DLL cạnh nó.
            cwd: path.dirname(filePath),
            detached: true,
            // Hứng stdout/stderr của cửa sổ game để thao tác trong game (điểm
            // danh, dọn túi, vào trận...) hiện chung một bảng log với thao tác
            // trên giao diện tool.
            stdio: ["ignore", "pipe", "pipe"]
        });

        pipeGameOutput(appPlayer, userName);

        appPlayer.on('error', (err) => {
            console.error(`[Login] Spawn error:`, err);
        });

        appPlayer.unref();

        return {
            success: true,
            pid: appPlayer.pid,
            hwid: serialNumber,
            msg: "Login game successfully"
        };
    } catch (err) {
        return { success: false, msg: "Lỗi hệ thống: " + err.message };
    }
}


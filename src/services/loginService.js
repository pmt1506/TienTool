import axios from "axios";
import { spawn } from "child_process";
import path from "path";
import { getSerialNumber } from "../utils.js";
import { ensureCharacterExists } from "./registerService.js";


export async function loginApi(userName, password, serialNumber) {
    try {
        const params = new URLSearchParams();
        params.append("username", userName);
        params.append("password", password);
        params.append("PublicKey", "PublicKey-" + serialNumber);

        const response = await axios.post(
            "http://api3.gnddt.com/api/Launcher/LauncherWebV566",
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

export async function loginGame(userName, password, serverID, accountType, prefix, maxLength) {
    const serialNumber = getSerialNumber();
    const apiResult = await loginApi(userName, password, serialNumber);

    if (!apiResult.success) {
        return { success: false, msg: apiResult.msg };
    }

    try {
        const token = apiResult.token;
        
        // 1. Ensure character exists (Auto Register if not)
        if (accountType === 2 || accountType === "2") {
            console.log(`[Login] Checking/Creating character for clone account ${userName}...`);
            const ensureRes = await ensureCharacterExists(userName, token, serverID, prefix, maxLength);
            if (!ensureRes.success) {
                return { success: false, msg: ensureRes.msg };
            }
        } else {
            console.log(`[Login] Skipping character check for main account ${userName}`);
        }

        // 2. Launch GunnyBrowser
        const args = [
            userName,
            token,
            serverID.toString(),
            "0",
            serialNumber,
            "0"
        ];

        const filePath = "C:/Program Files (x86)/gunnyclient/GunnyBrowser.exe";

        const appPlayer = spawn(filePath, args, {
            cwd: "C:/Program Files (x86)/gunnyclient",
            detached: true,
            stdio: "ignore"
        });

        appPlayer.unref();

        return { success: true, pid: appPlayer.pid, msg: "Login game successfully" };
    } catch (err) {
        return { success: false, msg: "Lỗi hệ thống: " + err.message };
    }
}


// Giữ lại JWT của webshop để khỏi giải captcha mỗi lần mở game.
//
// Token do /api/oauth/Token cấp có hạn ghi ngay trong payload (`exp`, giây Unix)
// — thực tế khoảng 24 giờ. Giải captcha mất vài giây và đôi khi OCR sai phải thử
// lại, nên làm việc đó mỗi lần bấm "Login Launcher" là phí.
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

import { getLoginToken } from './apiService.js';

// Đọc `exp` trong payload JWT. Token hỏng thì coi như hết hạn.
function readExpiry(token) {
    try {
        const payload = token.split('.')[1];
        const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
        return JSON.parse(json).exp || 0;
    } catch {
        return 0;
    }
}

function cacheFile() {
    return path.join(app.getPath('userData'), 'webshop-tokens.json');
}

async function readCache() {
    try {
        return JSON.parse(await fs.readFile(cacheFile(), 'utf-8'));
    } catch {
        return {};
    }
}

/**
 * Trả về JWT còn hạn cho tài khoản, giải captcha khi cần.
 * @returns {Promise<{token: string, userId: number, serverId: number} | null>}
 */
export async function getWebToken(username, password) {
    const cache = await readCache();
    const hit = cache[username];

    // Trừ hao 5 phút: token sắp hết hạn mà đem đi mua hàng thì hỏng giữa chừng.
    const now = Math.floor(Date.now() / 1000);
    if (hit?.token && readExpiry(hit.token) > now + 300) {
        return hit;
    }

    const login = await getLoginToken(username, password);
    if (!login?.token) {
        return null;
    }

    cache[username] = login;
    try {
        await fs.writeFile(cacheFile(), JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
        // Không ghi được thì thôi, lần sau giải captcha lại — không đáng để hỏng
        // cả luồng đăng nhập.
    }
    return login;
}

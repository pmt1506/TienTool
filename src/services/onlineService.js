import { getLoginToken } from './apiService.js';
import { getMarkItem } from './resetMarkService.js';

// Server chặn các thao tác web khi nhân vật đang trong game, trả về msg dạng
// "Nhân vật đang online không thể thực hiện !". Không có endpoint "ai đang online"
// riêng, nên ta suy ra trạng thái từ chính msg từ chối này của GetMarkItem
// (read-only, không gây side-effect lên tài khoản).
const ONLINE_MARKER = 'đang online';

/**
 * Kiểm tra một tài khoản có đang online (nhân vật mặc định đang trong game) không.
 * Tốn 1 captcha vì phải login oauth để lấy JWT + userId/serverId.
 *
 * @param {{ username: string, password: string }} account
 * @param {() => boolean} [checkStop] Cho phép huỷ trong lúc chờ captcha.
 * @returns {Promise<{ success: boolean, status: 'online'|'offline'|'unknown', msg?: string, error?: string }>}
 */
export async function checkAccountOnline(account, checkStop) {
    const login = await getLoginToken(account.username, account.password, checkStop);
    if (!login || !login.token) {
        return { success: false, status: 'unknown', error: 'Đăng nhập kiểm tra thất bại' };
    }

    const { token, userId, serverId } = login;

    try {
        const res = await getMarkItem(token, userId, serverId, 1);
        const msg = typeof res?.msg === 'string' ? res.msg : '';

        if (msg.toLowerCase().includes(ONLINE_MARKER)) {
            return { success: true, status: 'online', msg };
        }

        return { success: true, status: 'offline' };
    } catch (error) {
        return { success: false, status: 'unknown', error: error.message };
    }
}

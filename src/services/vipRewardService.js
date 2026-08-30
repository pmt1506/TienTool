import { getCaptcha, getLoginToken, getAllNickName } from './apiService.js';
import config from '../config.js';

/**
 * Gọi API nhận quà VIP 10 tuần cho 1 tài khoản
 */
export async function claimVipRewardWeekApi(token, userId, serverId, captcha) {
    const apiUrl = `${config.api.base}/api/Function/VipRewardWeek`;
    const payload = {
        ServerId: Number(serverId),
        VipLevel: '10',
        UserId: Number(userId),
        Captcha: captcha,
    };

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': token,
            'Referer': 'https://gnddt.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
        },
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`Phản hồi server không hợp lệ: ${text}`);
    }

    return json;
}

/**
 * Xử lý nhận quà VIP 10 tuần cho danh sách các tài khoản được tick
 */
export async function startVipRewardWeek(accounts, onProgress, checkStop, onDialog) {
    if (onProgress) onProgress({ message: 'Bắt đầu quá trình nhận quà V10 tuần...' });

    const accTotal = accounts.length;

    for (let i = 0; i < accTotal; i++) {
        if (checkStop && checkStop()) break;

        const account = accounts[i];
        const accCurrent = i + 1;

        if (onProgress) onProgress({
            message: `Đang đăng nhập tài khoản ${account.username}...`,
            accCurrent, accTotal, username: account.username
        });

        // 1. Đăng nhập lấy Token
        const loginAccount = await getLoginToken(account.username, account.password, checkStop);
        if (!loginAccount) {
            if (checkStop && checkStop()) break;
            const errMsg = `Đăng nhập thất bại: ${account.username}`;
            if (onProgress) onProgress({
                message: `❌ ${errMsg}`,
                accCurrent, accTotal, username: account.username
            });
            if (onDialog) {
                await onDialog({
                    title: 'Lỗi đăng nhập',
                    message: `Tài khoản: ${account.username}\n\nĐăng nhập không thành công. Vui lòng kiểm tra lại tài khoản hoặc mật khẩu.`,
                    type: 'error',
                    username: account.username
                });
            }
            continue;
        }

        const { token } = loginAccount;
        let userId = loginAccount.userId;
        let serverId = loginAccount.serverId || parseInt(account.server) || 2;

        // Nếu chưa có UserId mặc định, thử lấy từ danh sách nhân vật
        if (!userId || userId === 0) {
            try {
                const characters = await getAllNickName(token);
                if (characters && characters.length > 0) {
                    const matchedChar = characters.find(c => String(c.ServerId) === String(serverId)) || characters[0];
                    userId = matchedChar.UserId;
                    serverId = matchedChar.ServerId;
                }
            } catch (charErr) {
                console.error(`[VipRewardWeek] Lỗi lấy danh sách nhân vật cho ${account.username}:`, charErr);
            }
        }

        if (!userId || userId === 0) {
            if (onProgress) onProgress({
                message: `❌ ${account.username}: Không tìm thấy nhân vật`,
                accCurrent, accTotal, username: account.username
            });
            if (onDialog) {
                await onDialog({
                    title: 'Không tìm thấy nhân vật',
                    message: `Tài khoản: ${account.username}\n\nKhông tìm thấy nhân vật nào trên server. Vui lòng tạo nhân vật hoặc chọn nhân vật mặc định.`,
                    type: 'error',
                    username: account.username
                });
            }
            continue;
        }

        // 2. Thử giải Captcha và nhận quà (cho phép thử lại nếu sai captcha)
        const maxAttempts = 10;
        let accountFinished = false;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (checkStop && checkStop()) break;

            if (onProgress) onProgress({
                message: `Đang giải captcha & nhận quà V10 tuần cho ${account.username}... (Lần ${attempt + 1})`,
                accCurrent, accTotal, username: account.username,
                codeCurrent: attempt + 1, codeTotal: maxAttempts
            });

            const captcha = await getCaptcha(checkStop);
            if (!captcha) {
                if (checkStop && checkStop()) break;
                continue;
            }

            try {
                const json = await claimVipRewardWeekApi(token, userId, serverId, captcha);
                console.log(`[VipRewardWeek] ${account.username} response:`, json);

                if (json?.result === false) {
                    const msg = json.msg || 'Thất bại không rõ nguyên nhân';

                    // Nếu do sai Captcha thì tiếp tục retry vòng lặp
                    const isCaptchaError = msg.includes('Mã bảo vệ không đúng') ||
                                         msg.includes('Mã bảo vệ không đúng') ||
                                         msg.toLowerCase().includes('bảo vệ') ||
                                         msg.toLowerCase().includes('captcha');

                    if (isCaptchaError) {
                        console.log(`[VipRewardWeek] Sai captcha cho ${account.username}, đang thử lại...`);
                        await new Promise(r => setTimeout(r, 500));
                        continue;
                    }

                    // Lỗi khác (đã nhận, không đủ cấp VIP, v.v.): trả đúng message từ response
                    if (onProgress) {
                        onProgress({
                            message: `❌ ${account.username}: ${msg}`,
                            accCurrent, accTotal, username: account.username
                        });
                    }

                    // Hiện dialog ở giữa màn hình để người dùng đọc thông báo lỗi không bị trôi
                    if (onDialog) {
                        await onDialog({
                            title: 'Thông báo nhận quà V10 tuần',
                            message: `Tài khoản: ${account.username}\n\nLỗi: ${msg}`,
                            type: 'error',
                            username: account.username,
                            error: msg
                        });
                    }

                    accountFinished = true;
                    break;
                } else {
                    // Thành công: trả message từ response (hoặc fallback thông báo thành công)
                    const msg = json?.msg || 'Nhận quà V10 tuần thành công!';
                    if (onProgress) {
                        onProgress({
                            message: `✅ ${account.username}: ${msg}`,
                            accCurrent, accTotal, username: account.username
                        });
                    }
                    accountFinished = true;
                    break;
                }
            } catch (err) {
                console.error(`[VipRewardWeek] Exception cho ${account.username}:`, err);
                if (attempt === maxAttempts - 1) {
                    if (onProgress) {
                        onProgress({
                            message: `❌ ${account.username}: ${err.message}`,
                            accCurrent, accTotal, username: account.username
                        });
                    }
                    if (onDialog) {
                        await onDialog({
                            title: 'Lỗi nhận quà V10 tuần',
                            message: `Tài khoản: ${account.username}\n\nLỗi kết nối: ${err.message}`,
                            type: 'error',
                            username: account.username,
                            error: err.message
                        });
                    }
                }
                await new Promise(r => setTimeout(r, 800));
            }
        }

        if (!accountFinished && (checkStop && checkStop())) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (onProgress) {
        if (checkStop && checkStop()) {
            onProgress({ message: '🛑 Đã dừng tiến trình theo yêu cầu.' });
        } else {
            onProgress({ message: '✅ Đã hoàn thành nhận quà V10 tuần cho các tài khoản đã chọn.' });
        }
    }
}

import { getCaptcha, getLoginToken } from './apiService';
import { getCollection } from '../database/mongodb.js';
import { ObjectId } from 'mongodb';

// lấy list account có type = 1 ở mongodb
export async function getAccounts(keyId) {
    const accountsCollection = getCollection('accounts');
    const accounts = await accountsCollection.find({ accountType: 1, keyId: new ObjectId(keyId) }).toArray();
    return accounts;
}

// xem list code có thể nhận
export async function getAllGiftCodesAvailable(token) {
    const apiUrl = `https://api3.gnddt.com/api/Function/GetCodeEvent`;

    try {
        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                Authorization: token,
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            console.log(`[getAllGiftCodesAvailable] HTTP error: ${res.status}`);
            return null;
        }

        const text = await res.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.log(`[getAllGiftCodesAvailable] JSON parse failed`);
            return null;
        }

        console.log(`[getAllGiftCodesAvailable] infos count: ${data?.infos?.length ?? 'N/A'}, result: ${data?.result}`);

        const now = new Date();

        const infos = Array.isArray(data?.infos) ? data.infos : [];

        const validCodes = infos
            .filter((info) => {
                const isExist = info?.IsExist === true;

                const endDateStr = info?.EndDate;
                const endDate = new Date(endDateStr);

                const isValidDate =
                    endDateStr &&
                    !isNaN(endDate.getTime()) &&
                    endDate > now;

                const code = info?.GiftCode;

                if (!isExist || !isValidDate || !code) {
                    console.log(`[filter] skip code=${code}, isExist=${isExist}, isValidDate=${isValidDate}, endDate=${endDateStr}`);
                }

                return isExist && isValidDate && code;
            })
            .map((info) => info.GiftCode);

        console.log(`[getAllGiftCodesAvailable] FINAL validCodes count: ${validCodes.length}`);
        return validCodes;
    } catch (err) {
        return null;
    }
}

// nhận all code
export async function getAllCode(keyId, onProgress, checkStop) {
    const apiUrl = `https://api3.gnddt.com/api/Function/GiftAward`;

    if (onProgress) onProgress({ message: 'Đang tải danh sách tài khoản...' });
    const accounts = await getAccounts(keyId);

    if (!accounts || accounts.length === 0) {
        if (onProgress) onProgress({ message: '❌ Không tìm thấy tài khoản nào.' });
        return;
    }

    const accTotal = accounts.length;

    for (let i = 0; i < accTotal; i++) {
        if (checkStop && checkStop()) break;

        const account = accounts[i];
        const accCurrent = i + 1;

        if (onProgress) onProgress({
            message: `Đang đăng nhập tài khoản ${account.username}...`,
            accCurrent, accTotal, username: account.username
        });

        // login
        const loginAccount = await getLoginToken(account.username, account.password, checkStop);
        if (!loginAccount) {
            if (checkStop && checkStop()) break;
            if (onProgress) onProgress({
                message: `❌ Đăng nhập thất bại: ${account.username}`,
                accCurrent, accTotal, username: account.username
            });
            continue;
        }

        const { token, serverId, userId } = loginAccount;

        if (onProgress) onProgress({
            message: `Đang lấy danh sách code cho ${account.username}...`,
            accCurrent, accTotal, username: account.username
        });

        console.log(`[getAllCode] Calling getAllGiftCodesAvailable for token: ${token.substring(0, 10)}...`);
        const giftCodes = await getAllGiftCodesAvailable(token);
        console.log(`[getAllCode] Got ${giftCodes?.length ?? 0} codes for ${account.username}`);

        if (!giftCodes || giftCodes.length === 0) {
            if (onProgress) onProgress({
                message: `ℹ️ Không có code nào khả dụng cho ${account.username}`,
                accCurrent, accTotal, username: account.username
            });
            continue;
        }

        const codeTotal = giftCodes.length;

        for (let j = 0; j < codeTotal; j++) {
            if (checkStop && checkStop()) break;

            const code = giftCodes[j];
            const codeCurrent = j + 1;

            // 🔁 retry cùng code
            while (true) {
                if (checkStop && checkStop()) break;

                if (onProgress) onProgress({
                    message: `Đang nhận code: ${code}...`,
                    accCurrent, accTotal, username: account.username,
                    codeCurrent, codeTotal
                });

                const captcha = await getCaptcha(checkStop);
                if (!captcha) {
                    if (checkStop && checkStop()) break;
                    continue;
                }

                try {
                    const res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: token,
                        },
                        body: JSON.stringify({
                            Type: 5,
                            ServerId: serverId,
                            UserId: userId,
                            Captcha: captcha,
                            Code: code,
                        }),
                    });

                    const json = await res.json();


                    // ❌ fail
                    if (json?.result === false) {
                        const msg = json.msg || '';

                        if (msg.includes('Mã bảo vệ không đúng')) {
                            // Captcha sai -> Thử lại mã code này với captcha mới
                            continue;
                        }
                        else {
                            // Lỗi khác: Code đã nhận, code hết hạn, v.v.. -> Nhảy sang tiếp code sau
                            break;
                        }
                    }

                    // ✅ success → sang code tiếp theo
                    break;

                } catch (err) {
                    // Nếu lỗi do mạng, vẫn nên bỏ qua sang code khác thay vì kẹt vĩnh viễn
                    break;
                }
            }
        }
    }

    if (onProgress) {
        if (checkStop && checkStop()) {
            onProgress({ message: '🛑 Đã dừng tiến trình theo yêu cầu.' });
        } else {
            onProgress({ message: '✅ Đã hoàn thành nhận toàn bộ code cho tất cả tài khoản.' });
        }
    }
}

export async function getWeeklyCode(keyId, codesInput, onProgress, checkStop) {
    const apiUrl = `https://api3.gnddt.com/api/Function/Function/GiftCodeAward`;
    // Use a copy of the input array since we will remove codes
    let codesList = [...codesInput];

    if (onProgress) onProgress({ message: 'Đang tải danh sách tài khoản...' });
    const accounts = await getAccounts(keyId);

    if (!accounts || accounts.length === 0) {
        if (onProgress) onProgress({ message: '❌ Không tìm thấy tài khoản nào.' });
        return;
    }

    const accTotal = accounts.length;

    for (let i = 0; i < accTotal; i++) {
        if (checkStop && checkStop()) break;
        if (codesList.length === 0) {
            if (onProgress) onProgress({ message: '❌ Danh sách code đã báo hết.' });
            break;
        }

        const account = accounts[i];
        const accCurrent = i + 1;

        if (onProgress) onProgress({
            message: `Đang đăng nhập tài khoản ${account.username}...`,
            accCurrent, accTotal, username: account.username
        });

        // login
        const loginAccount = await getLoginToken(account.username, account.password, checkStop);
        if (!loginAccount) {
            if (checkStop && checkStop()) break;
            if (onProgress) onProgress({
                message: `❌ Đăng nhập thất bại: ${account.username}`,
                accCurrent, accTotal, username: account.username
            });
            continue;
        }

        const { token, serverId, userId } = loginAccount;

        let codeIndex = 0;
        let nextAccount = false;

        while (codeIndex < codesList.length) {
            if (checkStop && checkStop()) break;

            const code = codesList[codeIndex];

            if (onProgress) onProgress({
                message: `Đang nhận Code tuần: ${code}...`,
                accCurrent, accTotal, username: account.username,
                codeCurrent: codeIndex + 1, codeTotal: codesList.length
            });

            const captcha = await getCaptcha(checkStop);
            if (!captcha) {
                if (checkStop && checkStop()) break;
                continue;
            }

            try {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': token,
                    },
                    body: JSON.stringify({
                        Type: 5,
                        ServerId: serverId,
                        UserId: userId,
                        Captcha: captcha,
                        Code: code,
                    }),
                });

                const text = await res.text();
                let json;
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    console.log(`[Error] Parse JSON failed for code ${code}, result: ${text}`);
                    await new Promise(r => setTimeout(r, 1000));
                    continue; // thử lại
                }

                if (json?.result === false) {
                    const msg = json.msg || '';

                    if (msg.includes('Mã bảo vệ không đúng')) {
                        // Thử lại mã code này với captcha mới
                        continue;
                    }
                    else if (msg.includes('Code đã được sử dụng')) {
                        // Code này đã hỏng hoàn toàn (ai đó đã dùng rồi)
                        // Loại code khỏi danh sách và chuyển sang code kế tiếp (không tăng codeIndex do đã xóa)
                        codesList.splice(codeIndex, 1);
                        continue;
                    }
                    else if (msg.includes('Code chỉ có thể nhận 1 lần')) {
                        // Acc này đã nhận rồi, chuyển qua account kế tiếp lập tức
                        nextAccount = true;
                        break;
                    }
                    else {
                        // Lỗi khác chưa biết, nhảy sang code kế tiếp
                        codeIndex++;
                        continue;
                    }
                } else {
                    // Thành công
                    // Đã nhận code xong => Loại khỏi list và chuyển qua tài khoản khác
                    codesList.splice(codeIndex, 1);
                    nextAccount = true;
                    break;
                }

            } catch (err) {
                console.log(`[Error] fetch exception cho code ${code}:`, err);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
        } // end codes loop

        if (nextAccount) {
            continue;
        }
    } // end account loop

    if (onProgress) {
        if (checkStop && checkStop()) {
            onProgress({ message: '🛑 Đã dừng tiến trình theo yêu cầu.' });
        } else {
            onProgress({ message: '✅ Đã hoàn thành nhận code tuần cho tất cả tài khoản.' });
        }
    }
}

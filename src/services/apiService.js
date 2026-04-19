
// api service để chạy các api web liên quan tới login. retry captcha, lấy info user và token

// get ảnh captcha sau đó gửi tới api-ninja để giải, reuse cho các function khác
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// fix __dirname cho ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAPTCHA_API_KEY = process.env.API_NINJA;
const PARENT_DIR = __dirname;

// ─────────────────────────────────────────────
// 🖼️ Get Captcha Image
// ─────────────────────────────────────────────
export async function getCaptchaImage() {
    const apiUrl = 'https://api3.gnddt.com/api/oauth/GetCaptcha';

    const res = await fetch(apiUrl, {
        method: 'POST',
    });

    const imgString = await res.text();

    // bỏ dấu " giống C#
    const base64 = imgString.replace(/"/g, '').trim();

    const buffer = Buffer.from(base64, 'base64');

    const filePath = path.join(PARENT_DIR, 'download.png');

    await fs.writeFile(filePath, buffer);

    return filePath;
}

export async function getCaptcha(checkStop) {
    const apiUrl = 'https://api.api-ninjas.com/v1/imagetotext';

    let retries = 0;

    while (true) {
        if (checkStop && checkStop()) return null;
        retries++;

        const imgPath = await getCaptchaImage();

        const formData = new FormData();

        const fileBuffer = await fs.readFile(imgPath);

        formData.append('image', new Blob([fileBuffer]), 'download.png');

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'X-Api-Key': CAPTCHA_API_KEY,
            },
            body: formData,
        });

        const json = await res.text();

        try {
            const data = JSON.parse(json);

            if (Array.isArray(data) && data.length > 0) {
                let text = data[0]?.text;

                if (text && text.length >= 4) {
                    let captcha = text.replace(/[-_]/g, '');

                    return captcha;
                }
            }
        } catch (err) {
        }
        await new Promise((r) => setTimeout(r, 1200));
    }
}


// ─────────────────────────────────────────────
// 🔑 Get Login Token
// ─────────────────────────────────────────────
export async function getLoginToken(username, password, checkStop) {
    const apiUrl = 'https://api3.gnddt.com/api/oauth/Token';

    while (true) {
        if (checkStop && checkStop()) return null;
        console.log(`🔑 Login attempt for ${username}`);

        const captcha = await getCaptcha(checkStop);
        if (checkStop && checkStop()) return null;

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
                    const result = await setAccountDefault(token);
                    if (result) {
                        console.log(`✅ Set default account successful for ${username}`);
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
}

export async function getAllNickName(token) {
    const apiUrl = `${process.env.BASE_URL}/GetAllNickName`;

    const res = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            Token: token,
        }),
    });

    const json = res.json()

    // check nếu json.result = true và array ListNickName chỉ có 1 
    if (json.result === true && json.ListNickName.length === 1) {
        return json.ListNickName[0];
    }
}

export async function setAccountDefault(token) {
    const apiUrl = `${process.env.BASE_URL}/SetAccountDefault`;

    const defaultAccount = await getAllNickName(token)

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ "ServerId": defaultAccount.ServerId, "UserId": defaultAccount.UserId, "Otp": "", "Code": "", "Money": 0, "Captcha": "" }),
    });

    const json = res.json()

    return json.msg;
} 
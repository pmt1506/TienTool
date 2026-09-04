import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs/promises';
import { app } from 'electron';
import config from '../config.js';
import { loginApi } from './loginService.js';
import { getSerialNumber } from '../utils.js';
import { getCaptcha, ocrCaptchaNinja, getAllNickName, getLoginToken } from './apiService.js';

// ─────────────────────────────────────────────────────────────
// 🔐 GNDDT Crypto Helpers (RSA-1024 PKCS1 v1.5 + MD5)
// ─────────────────────────────────────────────────────────────
const RSA_MOD_B64 = 'zRSdzFcnZjOCxDMkWUbuRgiOZIQlk7frZMhElQ0a7VqZI9VgU3+lwo0ghZLU3Gg63kOY2UyJ5vFpQdwJUQydsF337ZAUJz4rwGRt/MNL70wm71nGfmdPv4ING+DyJ3ZxFawwE1zSMjMOqQtY4IV8his/HlgXuUfIHVDK87nMNLc=';
const RSA_EXP_B64 = 'AQAB';
const CLIENT_VERSION = 2612558;

export const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

export function rsaPublicKeyPem(modB64 = RSA_MOD_B64, expB64 = RSA_EXP_B64) {
  let n = Buffer.from(modB64, 'base64');
  if (n[0] & 0x80) n = Buffer.concat([Buffer.from([0]), n]); // force positive INTEGER
  const e = Buffer.from(expB64, 'base64');
  const len = (l) => (l < 128 ? Buffer.from([l]) : l < 256 ? Buffer.from([0x81, l]) : Buffer.from([0x82, l >> 8, l & 255]));
  const int = (b) => Buffer.concat([Buffer.from([0x02]), len(b.length), b]);
  const rsaSeqBody = Buffer.concat([int(n), int(e)]);
  const rsaSeq = Buffer.concat([Buffer.from([0x30]), len(rsaSeqBody.length), rsaSeqBody]);
  const algId = Buffer.from('300d06092a864886f70d0101010500', 'hex');
  const bitBody = Buffer.concat([Buffer.from([0x00]), rsaSeq]);
  const bit = Buffer.concat([Buffer.from([0x03]), len(bitBody.length), bitBody]);
  const spkiBody = Buffer.concat([algId, bit]);
  const spki = Buffer.concat([Buffer.from([0x30]), len(spkiBody.length), spkiBody]);
  return '-----BEGIN PUBLIC KEY-----\n' + spki.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----\n';
}

export const RSA_PEM = rsaPublicKeyPem(RSA_MOD_B64, RSA_EXP_B64);

function rand6lower() {
  const a = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * 26)];
  return s;
}

export function loginParams(user, guid, opts = {}) {
  const pass6 = opts.pass6 || rand6lower();
  const d = opts.date || new Date();
  const head = Buffer.alloc(7);
  head.writeUInt16BE(d.getUTCFullYear(), 0);
  head[2] = d.getUTCMonth() + 1;
  head[3] = d.getUTCDate();
  head[4] = d.getUTCHours();
  head[5] = d.getUTCMinutes();
  head[6] = d.getUTCSeconds();
  const body = Buffer.from(`${user},${guid},${pass6},`, 'utf8');
  const plain = Buffer.concat([head, body]);
  const p = crypto.publicEncrypt({ key: RSA_PEM, padding: crypto.constants.RSA_PKCS1_PADDING }, plain).toString('base64');
  return {
    params: { loginDevice: 'true', selfid: '', key: md5(guid), v: CLIENT_VERSION, p, site: '', rid: '' },
    pass6,
  };
}

export function visualizeRegisterParams(user, pass6, nickName, sex = false) {
  return {
    site: '',
    NickName: nickName,
    Name: user,
    key: md5(pass6),
    rnd: Math.random(),
    selfid: '',
    Pass: pass6,
    Sex: !!sex,
  };
}

// ─────────────────────────────────────────────────────────────
// 🌐 HTTP Utilities & Endpoints
// ─────────────────────────────────────────────────────────────
const PLAY_HOST = 'http://play.gnddt.com';
const QUEST_HOST = 'https://quest2.gnddt.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36';

let cachedIp = null;
export async function publicIp() {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('http://api.ipify.org', { signal: AbortSignal.timeout(4000) });
    cachedIp = (await res.text()).trim();
  } catch {
    cachedIp = '127.0.0.1';
  }
  return cachedIp;
}

export function questHeaders() {
  return {
    'User-Agent': UA,
    Referer: `${PLAY_HOST}/PlayGameV1?rand=0.5`,
    'x-requested-with': 'ShockwaveFlash/26.0.0.151',
  };
}

// GET/POST mang theo cookies và đi theo redirect thủ công
/**
 * Tên gọn của một URL để ghi log: host + path, bỏ query.
 *
 * Query mang token phiên và chuỗi `content` đã ký — ghi nguyên vào bảng log là
 * lộ thứ đăng nhập được vào tài khoản, mà đọc log cũng chẳng cần tới.
 */
function shortUrl(url) {
    try {
        const u = new URL(url);
        return u.host + u.pathname;
    } catch {
        return String(url).split('?')[0];
    }
}

export async function hop(url, cookieRef, opt = {}) {
  const r = await fetch(url, {
    method: opt.method || 'GET',
    body: opt.body,
    redirect: 'manual',
    headers: { 'User-Agent': UA, ...(cookieRef.v ? { Cookie: cookieRef.v } : {}), ...(opt.headers || {}) },
  });
  console.log(`[HTTP] ${opt.method || 'GET'} ${shortUrl(url)} -> ${r.status}`);
  const sc = r.headers.get('set-cookie');
  if (sc) cookieRef.v = (cookieRef.v ? cookieRef.v + '; ' : '') + sc.split(';')[0];
  let loc = r.headers.get('location');
  let body = await r.text();
  let n = 0;
  while (loc && n < 6) {
    const u = loc.startsWith('http') ? loc : PLAY_HOST + loc;
    const r2 = await fetch(u, {
      headers: { 'User-Agent': UA, ...(cookieRef.v ? { Cookie: cookieRef.v } : {}) },
      redirect: 'manual',
    });
    console.log(`[HTTP] GET ${shortUrl(u)} -> ${r2.status} (chuyen huong)`);
    const sc2 = r2.headers.get('set-cookie');
    if (sc2) cookieRef.v = (cookieRef.v ? cookieRef.v + '; ' : '') + sc2.split(';')[0];
    loc = r2.headers.get('location');
    body = await r2.text();
    n++;
  }
  return body;
}

export function generateNickName(prefix = 'GNLM', maxLength = 14) {
  const cleanPrefix = (prefix || 'GNLM').trim();
  const suffixLen = maxLength - cleanPrefix.length;
  if (suffixLen <= 0) {
    return cleanPrefix.slice(0, maxLength);
  }

  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const allChars = lowercase + uppercase + digits;

  const randChar = (charset) => charset[Math.floor(Math.random() * charset.length)];

  const chars = [];
  // Đảm bảo có cả chữ thường, chữ hoa và số nếu độ dài suffix >= 3
  if (suffixLen >= 3) {
    chars.push(randChar(lowercase));
    chars.push(randChar(uppercase));
    chars.push(randChar(digits));
  } else if (suffixLen === 2) {
    chars.push(randChar(lowercase));
    chars.push(randChar(digits));
  } else if (suffixLen === 1) {
    chars.push(randChar(allChars));
  }

  while (chars.length < suffixLen) {
    chars.push(randChar(allChars));
  }

  // Trộn ngẫu nhiên các ký tự suffix
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return cleanPrefix + chars.join('');
}

// ─────────────────────────────────────────────────────────────
// 🚀 Pure HTTP Character Creation & Verification
// ─────────────────────────────────────────────────────────────
export async function ensureCharacterExists(userName, token, serverID, prefix = 'GNLM', maxLength = 14) {
  try {
    const serial = getSerialNumber() || 'ABCDEF12345678901';
    const server = String(serverID ?? '2');
    const cookie = { v: '' };

    console.log(`[Register] Kiểm tra/tạo nhân vật cho ${userName} trên server ${server}...`);

    // 1. Hop RedircetPlayGameV1 -> Lấy content đã được server ký + session GUID
    const rdUrl = `${PLAY_HOST}/RedircetPlayGameV1.aspx?user=${encodeURIComponent(token)}&s=${server}&UseLocalStorage=0&serial=${encodeURIComponent(serial)}&cert=0`;
    const rd = await hop(rdUrl, cookie);

    const content = (rd.match(/CreateLogin\.aspx\?content=([^'"]+)/i) || [])[1];
    const guid = (rd.match(/key=([0-9a-f-]{36})/i) || rd.match(/%7c([0-9a-f-]{36})%7c/i) || [])[1];

    if (!content || !guid) {
      console.warn('[Register] Không tìm thấy content hoặc guid trong RedircetPlayGameV1');
      return { success: false, msg: 'Không tìm thấy CreateLogin content / session GUID từ server' };
    }

    const questHostMatch = rd.match(/(https?:\/\/[^/'"]+)\/CreateLogin\.aspx/i);
    const questHost = questHostMatch ? questHostMatch[1] : `https://quest${server}.gnddt.com`;

    // 2. Kích hoạt session qua CreateLogin.aspx với IP
    const ip = await publicIp();
    const clRes = await fetch(`${questHost}/CreateLogin.aspx?content=${content}&active=${ip}`, {
      headers: questHeaders(),
    });
    const cl = (await clRes.text()).trim();
    if (cl !== '0') {
      console.warn(`[Register] CreateLogin.aspx trả về '${cl}' (kỳ vọng '0')`);
      return { success: false, msg: `CreateLogin thất bại: mã '${cl}'` };
    }

    // 3. Game login (login.ashx) với RSA-encrypted payload (tạo pass6)
    const L = loginParams(userName, guid);
    const lp = new URLSearchParams({ ...L.params, rnd: Math.random() });
    const lrRes = await fetch(`${questHost}/login.ashx?${lp}`, {
      headers: questHeaders(),
    });
    const lr = await lrRes.text();

    if (!/value="true"/i.test(lr)) {
      // Nếu đã có nhân vật trên server này -> server trả về "Kích hoạt thất bại"
      if (/Kích hoạt thất bại/i.test(lr) || /error/i.test(lr)) {
        console.log(`[Register] Tài khoản ${userName} đã có nhân vật trên server ${server}`);
        return { success: true, alreadyExists: true, msg: 'Tài khoản đã có nhân vật' };
      }
      return { success: false, msg: `login.ashx thất bại: ${lr.slice(0, 80)}` };
    }

    // 4. Chọn nickname hợp lệ và chưa ai dùng
    let nick = generateNickName(prefix, maxLength);
    for (let i = 0; i < 5; i++) {
      const ncRes = await fetch(`${questHost}/nicknamecheck.ashx?NickName=${encodeURIComponent(nick)}&rnd=${Math.random()}`, {
        headers: questHeaders(),
      });
      const nc = await ncRes.text();
      if (/value="true"/i.test(nc)) break;
      nick = generateNickName(prefix, maxLength);
    }

    // 5. Tạo nhân vật qua visualizeregister.ashx
    const V = visualizeRegisterParams(userName, L.pass6, nick, false);
    const vp = new URLSearchParams(V);
    const vrRes = await fetch(`${questHost}/visualizeregister.ashx?${vp}`, {
      headers: questHeaders(),
    });
    const vr = await vrRes.text();

    if (/value="true"/i.test(vr)) {
      console.log(`[Register] ✅ Đã tạo nhân vật "${nick}" cho ${userName} trên server ${server}`);
      return { success: true, nick, msg: `Đã tạo nhân vật: ${nick}` };
    }

    return { success: false, nick, msg: `Tạo nhân vật thất bại: ${vr.slice(0, 80)}` };
  } catch (err) {
    console.error('[Register] Lỗi khi tạo nhân vật:', err);
    return { success: false, msg: 'Lỗi hệ thống: ' + err.message };
  }
}

export async function registerCharacter(userName, password, serverID, prefix, maxLength) {
  const serialNumber = getSerialNumber() || 'ABCDEF12345678901';
  const apiResult = await loginApi(userName, password, serialNumber);

  if (!apiResult.success) {
    return { success: false, msg: apiResult.msg };
  }

  return await ensureCharacterExists(userName, apiResult.token, serverID, prefix, maxLength);
}

// ─────────────────────────────────────────────────────────────
// 👤 Web Account Registration (RegAccount)
// ─────────────────────────────────────────────────────────────
const REG_STOP = ['đã tồn tại', 'ton tai', 'tài khoản đã', 'exist'];

export function phoneFor(username) {
  const digits = (username.match(/\d+/g) || []).join('');
  let n = digits ? parseInt(digits.slice(-8), 10) : 0;
  if (!n) {
    for (const c of username) n = (n * 31 + c.charCodeAt(0)) % 100000000;
  }
  return '09' + String(n).padStart(8, '0');
}

export async function registerAccount(username, password, { base, email, phone, checkStop } = {}) {
  const apiBase = base || config.api.base || 'https://api.gnddt.com';
  const maxAttempts = config.captcha?.maxAttempts || 15;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (checkStop && checkStop()) return { success: false, msg: 'Đã dừng đăng ký' };

    const captcha = await getCaptcha(checkStop);
    if (!captcha) return { success: false, msg: 'Không thể giải captcha' };

    const payload = {
      UserName: username,
      Password: password,
      Email: email || `${username}@gmail.com`,
      Phone: phone || phoneFor(username),
      Captcha: captcha,
    };

    let res, json;
    try {
      res = await fetch(`${apiBase}/api/oauth/RegAccount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      json = JSON.parse(await res.text());
    } catch {
      continue;
    }

    const msg = json?.msg || '';
    if (json?.result === true) {
      return { success: true, msg: msg || 'Đăng ký tài khoản thành công', token: json.Token };
    }

    if (REG_STOP.some((s) => msg.toLowerCase().includes(s))) {
      return { success: false, stop: true, msg: msg || 'Tài khoản đã tồn tại' };
    }
  }

  return { success: false, msg: `Đăng ký thất bại sau ${maxAttempts} lần thử captcha` };
}

// ─────────────────────────────────────────────────────────────
// 🎁 Subscriber Codes Flow (2100, 2200, 2300, 2500)
// ─────────────────────────────────────────────────────────────

export function convertStringToHex(str) {
  const arr = [];
  for (let i = 0; i < str.length; i++) {
    arr[i] = ('00' + str.charCodeAt(i).toString(8)).slice(-4);
  }
  return arr.join('');
}

export async function getSubscriberCaptcha(keyCapcha, checkStop) {
  const { retryDelayMs, minLength, maxAttempts } = config.captcha;
  const cap = maxAttempts || 10;
  const apiKey = config.captcha.apiNinjaKey;
  const apiBase = config.api.base || 'https://api.gnddt.com';

  if (!apiKey) {
    console.log('❌ Chưa cấu hình API_NINJA — không thể giải captcha.');
    return null;
  }

  const parentDir = (typeof app !== 'undefined' && app?.getPath) ? app.getPath('userData') : process.cwd();
  const filePath = path.join(parentDir, 'sub_captcha.png');

  for (let attempt = 0; attempt < cap; attempt++) {
    if (checkStop && checkStop()) return null;

    try {
      const res = await fetch(`${apiBase}/api/oauth/GetCaptcha`, {
        method: 'POST',
        headers: {
          'KeyCapcha': keyCapcha,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': 'https://gnddt.com/',
          'User-Agent': UA,
        },
      });

      const imgString = await res.text();
      const base64 = imgString.replace(/"/g, '').trim();
      if (base64 && base64.length > 50) {
        await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
        const text = await ocrCaptchaNinja(filePath, apiKey);
        if (text && text.length >= minLength) {
          return text;
        }
      }
    } catch (err) {
      console.warn('[SubscriberCaptcha] Lỗi giải captcha:', err.message);
    }

    await new Promise((r) => setTimeout(r, retryDelayMs || 800));
  }

  return null;
}

export async function generateSingleSubscriberCode(token, keyCapcha, typeCode, checkStop) {
  const apiBase = config.api.base || 'https://api.gnddt.com';
  const maxRetries = 6;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (checkStop && checkStop()) {
      return { code: String(typeCode), success: false, msg: 'Đã dừng theo yêu cầu' };
    }

    const captcha = await getSubscriberCaptcha(keyCapcha, checkStop);
    if (!captcha) {
      return { code: String(typeCode), success: false, msg: 'Không thể giải captcha' };
    }

    try {
      const res = await fetch(`${apiBase}/api/Function/CodeAwardSubscriber`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': token,
          'Referer': 'https://gnddt.com/',
          'KeyCapcha': keyCapcha,
          'User-Agent': UA,
        },
        body: JSON.stringify({
          TypeCode: String(typeCode),
          Captcha: captcha,
          AccessToken: '',
        }),
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return { code: String(typeCode), success: false, msg: `Phản hồi lỗi: ${text.slice(0, 50)}` };
      }

      const msg = json?.msg || '';

      // Trường hợp sai captcha -> Thử lại
      if (json?.result === false && (msg.includes('bảo vệ') || msg.includes('bảo vệ') || msg.toLowerCase().includes('captcha'))) {
        console.log(`[CodeAwardSubscriber] Code ${typeCode} sai captcha (${captcha}), thử lại (${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      // Trường hợp đã nhận từ trước -> coi như đã có mã code
      if (json?.result === false && msg.includes('Bạn đã nhận từ trước')) {
        return { code: String(typeCode), success: true, alreadyAcquired: true, msg };
      }

      // Thành công lấy code
      if (json?.result === true) {
        return { code: String(typeCode), success: true, msg: msg || 'Lấy code thành công' };
      }

      return { code: String(typeCode), success: false, msg: msg || 'Thất bại' };
    } catch (err) {
      if (attempt === maxRetries - 1) {
        return { code: String(typeCode), success: false, msg: `Lỗi kết nối: ${err.message}` };
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return { code: String(typeCode), success: false, msg: 'Hết lượt thử captcha' };
}

export async function getSubscriberGiftCodes(token) {
  const apiBase = config.api.base || 'https://api.gnddt.com';
  try {
    const res = await fetch(`${apiBase}/api/Function/GetCodeEvent?type=ytb`, {
      method: 'GET',
      headers: {
        Authorization: token,
        Accept: 'application/json',
      },
    });

    const text = await res.text();
    const data = JSON.parse(text);
    if (data?.result === true && Array.isArray(data?.infos)) {
      return data.infos;
    }
  } catch (err) {
    console.error('[getSubscriberGiftCodes] Lỗi lấy danh sách code:', err);
  }
  return [];
}

export async function redeemGiftCode(token, serverId, userId, giftCode, checkStop) {
  const apiBase = config.api.base || 'https://api.gnddt.com';
  const maxRetries = 6;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (checkStop && checkStop()) {
      return { success: false, msg: 'Đã dừng theo yêu cầu' };
    }

    const captcha = await getCaptcha(checkStop);
    if (!captcha) {
      return { success: false, msg: 'Không thể giải captcha để nhận code' };
    }

    try {
      const res = await fetch(`${apiBase}/api/Function/GiftAward`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({
          Type: 5,
          ServerId: Number(serverId),
          UserId: Number(userId),
          Captcha: captcha,
          Code: giftCode,
        }),
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return { success: false, msg: `Phản hồi server lỗi: ${text.slice(0, 50)}` };
      }

      const msg = json?.msg || '';
      if (json?.result === false) {
        if (
          msg.includes('Mã bảo vệ không đúng') ||
          msg.includes('Mã bảo vệ không đúng') ||
          msg.includes('bảo vệ') ||
          msg.toLowerCase().includes('captcha')
        ) {
          console.log(`[GiftAward] Sai captcha khi nhận ${giftCode}, thử lại (${attempt + 1}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        return { success: false, msg: msg || 'Không thể sử dụng code' };
      }

      return { success: true, msg: msg || 'Nhận code vào nhân vật thành công!' };
    } catch (err) {
      if (attempt === maxRetries - 1) {
        return { success: false, msg: `Lỗi kết nối: ${err.message}` };
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return { success: false, msg: 'Sai captcha nhiều lần khi nhận code' };
}

export const SUBSCRIBER_CODES_CONFIG = [
  { typeCode: '2100', name: 'Code 1K Sub' },
  { typeCode: '2200', name: 'Code 2K Sub' },
  { typeCode: '2300', name: 'Code 3K Sub' },
  { typeCode: '2500', name: 'Code 5K Sub' },
];

export async function processSubscriberCodesForAccount(
  username,
  password,
  token,
  targetServer,
  checkStop,
  onProgress
) {
  const codesToProcess = SUBSCRIBER_CODES_CONFIG;
  let authToken = token;

  if (!authToken && username && password) {
    if (onProgress) onProgress({ step: 'login', message: `Đang lấy token web cho ${username}...` });
    const loginRes = await getLoginToken(username, password, checkStop);
    authToken = loginRes?.token;
  }

  if (!authToken) {
    return {
      username,
      success: false,
      msg: 'Không thể lấy token đăng nhập web',
      results: codesToProcess.map((c) => ({ code: c.typeCode, name: c.name, success: false, msg: 'Chưa có token web' })),
    };
  }

  // 1. Sinh KeyCapcha từ IP
  const ip = await publicIp();
  const keyCapcha = convertStringToHex(ip);

  // 2. Chạy tuần tự 4 lần API CodeAwardSubscriber để lấy/kích hoạt 4 code
  for (let i = 0; i < codesToProcess.length; i++) {
    if (checkStop && checkStop()) break;
    const { typeCode, name } = codesToProcess[i];
    if (onProgress) onProgress({ step: 'generate', code: typeCode, name, message: `[${name}] Đang lấy mã code...` });
    const genRes = await generateSingleSubscriberCode(authToken, keyCapcha, typeCode, checkStop);
    console.log(`[processSubscriber] ${username} gen code ${typeCode} (${name}):`, genRes);
    await new Promise((r) => setTimeout(r, 400));
  }

  if (checkStop && checkStop()) {
    return {
      username,
      success: false,
      msg: 'Đã dừng theo yêu cầu',
      results: codesToProcess.map((c) => ({ code: c.typeCode, name: c.name, success: false, msg: 'Đã dừng' })),
    };
  }

  // 3. Lấy danh sách GiftCode thực tế từ GetCodeEvent?type=ytb
  if (onProgress) onProgress({ step: 'fetch_codes', message: 'Đang tải danh sách chuỗi code đã nhận...' });
  const infos = await getSubscriberGiftCodes(authToken);
  console.log(`[processSubscriber] ${username} fetched infos:`, infos?.length);

  // 4. Tìm UserId và ServerId cho tài khoản (từ GetAllNickName nếu chưa có)
  if (onProgress) onProgress({ step: 'get_char', message: 'Đang kiểm tra nhân vật để nhập code...' });
  let userId = 0;
  let serverId = Number(targetServer || 2);
  let characterNick = '';

  try {
    const characters = await getAllNickName(authToken);
    if (characters && characters.length > 0) {
      const matched = characters.find((c) => String(c.ServerId) === String(serverId)) || characters[0];
      userId = matched.UserId;
      serverId = matched.ServerId;
      characterNick = matched.NickName;
    }
  } catch (err) {
    console.error(`[processSubscriber] Lỗi getAllNickName cho ${username}:`, err);
  }

  if (!userId) {
    return {
      username,
      characterNick: '',
      serverId,
      success: false,
      msg: 'Không tìm thấy nhân vật trên server để nhập code',
      results: codesToProcess.map((c) => ({
        code: c.typeCode,
        name: c.name,
        success: false,
        msg: 'Không tìm thấy nhân vật',
      })),
    };
  }

  // 5. Nhập lần lượt từng code vào nhân vật qua GiftAward
  const finalResults = [];
  for (let i = 0; i < codesToProcess.length; i++) {
    if (checkStop && checkStop()) {
      finalResults.push({ code: codesToProcess[i].typeCode, name: codesToProcess[i].name, success: false, msg: 'Đã dừng theo yêu cầu' });
      continue;
    }

    const { typeCode, name } = codesToProcess[i];
    const item = infos.find((info) => String(info.TypeCode) === String(typeCode));
    const giftCodeStr = item?.GiftCode;

    if (!giftCodeStr) {
      finalResults.push({
        code: typeCode,
        name,
        giftCode: '',
        success: false,
        msg: 'Không tìm thấy mã code từ server',
      });
      continue;
    }

    if (onProgress) onProgress({ step: 'redeem', code: typeCode, name, giftCode: giftCodeStr, message: `[${name}] Đang nhập code vào NV ${characterNick}...` });
    const redeemRes = await redeemGiftCode(authToken, serverId, userId, giftCodeStr, checkStop);

    finalResults.push({
      code: typeCode,
      name,
      giftCode: giftCodeStr,
      success: redeemRes.success,
      msg: redeemRes.msg,
    });

    if (onProgress) {
      onProgress({
        step: 'redeemed',
        code: typeCode,
        name,
        success: redeemRes.success,
        msg: redeemRes.msg,
        message: `[${name}] ${redeemRes.success ? '✅ Nhận thành công' : '❌ Thất bại'}: ${redeemRes.msg}`,
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const okCount = finalResults.filter((r) => r.success).length;
  return {
    username,
    characterNick,
    serverId,
    success: okCount > 0,
    okCount,
    totalCount: codesToProcess.length,
    results: finalResults,
  };
}


import crypto from 'node:crypto';
import config from '../config.js';
import { loginApi } from './loginService.js';
import { getSerialNumber } from '../utils.js';
import { getCaptcha } from './apiService.js';

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

function questHeaders() {
  return {
    'User-Agent': UA,
    Referer: `${PLAY_HOST}/PlayGameV1?rand=0.5`,
    'x-requested-with': 'ShockwaveFlash/26.0.0.151',
  };
}

// GET/POST mang theo cookies và đi theo redirect thủ công
async function hop(url, cookieRef, opt = {}) {
  const r = await fetch(url, {
    method: opt.method || 'GET',
    body: opt.body,
    redirect: 'manual',
    headers: { 'User-Agent': UA, ...(cookieRef.v ? { Cookie: cookieRef.v } : {}), ...(opt.headers || {}) },
  });
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
  const maxSuffixLen = Math.max(2, maxLength - cleanPrefix.length);
  if (maxSuffixLen <= 0) return cleanPrefix.slice(0, maxLength);

  let suffix = '';
  if (maxSuffixLen <= 4) {
    const maxVal = Math.pow(10, maxSuffixLen) - 1;
    const minVal = Math.pow(10, maxSuffixLen - 1);
    suffix = String(Math.floor(minVal + Math.random() * (maxVal - minVal + 1)));
  } else {
    // 4 digits suffix by default
    suffix = String(Math.floor(1000 + Math.random() * 8999));
    if (suffix.length > maxSuffixLen) suffix = suffix.slice(0, maxSuffixLen);
  }
  return `${cleanPrefix}${suffix}`.slice(0, maxLength);
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

    // 2. Kích hoạt session qua CreateLogin.aspx với IP
    const ip = await publicIp();
    const clRes = await fetch(`${QUEST_HOST}/CreateLogin.aspx?content=${content}&active=${ip}`, {
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
    const lrRes = await fetch(`${QUEST_HOST}/login.ashx?${lp}`, {
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
      const ncRes = await fetch(`${QUEST_HOST}/nicknamecheck.ashx?NickName=${encodeURIComponent(nick)}&rnd=${Math.random()}`, {
        headers: questHeaders(),
      });
      const nc = await ncRes.text();
      if (/value="true"/i.test(nc)) break;
      nick = generateNickName(prefix, maxLength);
    }

    // 5. Tạo nhân vật qua visualizeregister.ashx
    const V = visualizeRegisterParams(userName, L.pass6, nick, false);
    const vp = new URLSearchParams(V);
    const vrRes = await fetch(`${QUEST_HOST}/visualizeregister.ashx?${vp}`, {
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

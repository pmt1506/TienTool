/**
 * Tạo phiên chơi game và dựng link SWF cho launcher mới (gunny-browser-qt).
 *
 * GunnyBrowser.exe cũ nhận 6 tham số vị trí rồi tự đi lấy link SWF. Launcher
 * mới nhận thẳng `--swf <url>`, nên phần lấy link chuyển về đây.
 *
 * Chuỗi bắt buộc (thiếu bước CreateLogin thì login.ashx trả "Đăng nhập thất
 * bại" và game đứng ở màn Loading 100%):
 *   RedircetPlayGameV1 -> CreateLogin.aspx?content=..&active=<ip> -> link SWF
 */
import { hop, publicIp, questHeaders } from './registerService.js';
import { getSerialNumber } from '../utils.js';

const PLAY_HOST = 'http://play.gnddt.com';
const RES_HOST = 'http://res1.gnddt.com';
const CONFIG_HOST = 'http://config.gnddt.com';
// Bản resource; trùng giá trị trang PlayGame.aspx phát ra.
const GAME_VERSION = '10950';

/**
 * @returns {Promise<{success: boolean, swfUrl?: string, guid?: string, msg?: string}>}
 */
export async function createGameSession(userName, token, serverID) {
  const server = String(serverID ?? '2');
  const serial = getSerialNumber() || 'ABCDEF12345678901';
  const cookie = { v: '' };

  // 1. Trang gate: trả về chuỗi `content` đã được server ký + session GUID.
  const rdUrl =
    `${PLAY_HOST}/RedircetPlayGameV1.aspx?user=${encodeURIComponent(token)}` +
    `&s=${server}&UseLocalStorage=0&serial=${encodeURIComponent(serial)}&cert=0`;
  const rd = await hop(rdUrl, cookie);

  const content = (rd.match(/CreateLogin\.aspx\?content=([^'"]+)/i) || [])[1];
  const guid =
    (rd.match(/key=([0-9a-f-]{36})/i) || rd.match(/%7c([0-9a-f-]{36})%7c/i) || [])[1];
  if (!content || !guid) {
    return { success: false, msg: 'Không lấy được content/session GUID từ trang gate' };
  }

  const questHost =
    (rd.match(/(https?:\/\/[^/'"]+)\/CreateLogin\.aspx/i) || [])[1] ||
    `https://quest${server}.gnddt.com`;

  // 2. Kích hoạt session trên game server. Trang gate gốc làm bước này bằng
  //    JavaScript, nên launcher chạy Flash trực tiếp sẽ bỏ sót.
  const ip = await publicIp();
  const res = await fetch(`${questHost}/CreateLogin.aspx?content=${content}&active=${ip}`, {
    headers: questHeaders(),
  });
  const code = (await res.text()).trim();
  if (code !== '0') {
    return { success: false, msg: `CreateLogin thất bại: mã '${code}'` };
  }

  // 3. Link SWF, đúng định dạng trang PlayGame.aspx phát ra.
  const params = new URLSearchParams({
    user: userName,
    key: guid,
    isGuest: 'False',
    ua: '',
    loginType: '0',
    fbapp: 'false',
    v: GAME_VERSION,
    rand: Date.now().toString(),
    config: `${CONFIG_HOST}/config${server}.xml`,
  });

  return {
    success: true,
    guid,
    swfUrl: `${RES_HOST}/flash/Loading.swf?${params}`,
  };
}

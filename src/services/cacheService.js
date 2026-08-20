import path from 'node:path';
import { existsSync } from 'node:fs';
import fsp from 'node:fs/promises';

/**
 * Xoá cache của game (Flash + shader) để khắc phục lỗi hiển thị/đăng nhập —
 * đúng như nút "Xóa Cache" của launcher gốc. Chỉ đụng dữ liệu riêng của game,
 * KHÔNG xoá cookie/mật khẩu WinINet hay cache của ứng dụng khác.
 *
 * Game Gunny render bằng Flash trong QtWebKit (GunnyBrowser) nên cache lớn nhất
 * nằm ở %APPDATA%\Macromedia\Flash Player; Qt sinh thêm shader cache ở
 * %LOCALAPPDATA%\cache\qtshadercache*.
 */

// %APPDATA%\Macromedia\Flash Player — local storage + SWF cache của Flash.
function flashCacheDir() {
    return path.join(process.env.APPDATA || '', 'Macromedia', 'Flash Player');
}

// %LOCALAPPDATA%\cache — thư mục cha chứa các qtshadercache* do GunnyBrowser (Qt) tạo.
function qtCacheParent() {
    return path.join(process.env.LOCALAPPDATA || '', 'cache');
}

async function removePath(target, cleared) {
    if (!existsSync(target)) return;
    try {
        await fsp.rm(target, { recursive: true, force: true });
        cleared.push(target);
    } catch (err) {
        console.error('[Cache] Không xoá được', target, '-', err.message);
    }
}

/**
 * Xoá cache game. Trả về danh sách đường dẫn đã xoá thật sự (bỏ qua cái không tồn tại).
 * @returns {Promise<{success: boolean, data: {cleared: string[]}}>}
 */
export async function clearGameCache() {
    const cleared = [];

    // 1. Flash Player cache — thủ phạm chính khi game lỗi.
    await removePath(flashCacheDir(), cleared);

    // 2. Qt shader cache — chỉ các thư mục qtshadercache*, tránh xoá nhầm cache app khác.
    try {
        const parent = qtCacheParent();
        const entries = await fsp.readdir(parent, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('qtshadercache')) {
                await removePath(path.join(parent, entry.name), cleared);
            }
        }
    } catch {
        // Thư mục cache không tồn tại — bỏ qua.
    }

    return { success: true, data: { cleared } };
}

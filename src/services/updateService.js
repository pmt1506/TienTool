import axios from 'axios';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import config from '../config.js';

/**
 * Tự cập nhật tài nguyên game trong app (thay cho việc mở launcher gốc).
 *
 * Cơ chế đúng như GunnyClient: tải manifest `ResourceInfo.xml` (danh sách
 * <Item FileName Hash/> với Hash là MD5), so MD5 từng file với bản local trong
 * thư mục `resource/`, file nào thiếu hoặc khác hash thì tải lại từ server res.
 * Thư mục `resource/` ghi được không cần quyền admin.
 */

// Manifest: <Item FileName="flash\x.swf" Hash="aa-bb-..(MD5).." />
function parseManifest(xml) {
    const items = [];
    const re = /<Item\s+FileName="([^"]+)"\s+Hash="([^"]+)"\s*\/>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        items.push({ fileName: m[1], hash: m[2].replace(/-/g, '').toLowerCase() });
    }
    return items;
}

async function localMd5(filePath) {
    try {
        const buf = await fsp.readFile(filePath);
        return createHash('md5').update(buf).digest('hex');
    } catch {
        return null; // file chưa tồn tại
    }
}

// Thư mục resource nằm cạnh GunnyBrowser.exe (cùng thư mục cài gunnyclient).
function resourceDir() {
    return path.join(config.game.clientDir, 'resource');
}

/**
 * @param {(p: {message?: string, accCurrent?: number, accTotal?: number}) => void} onProgress
 * @param {() => boolean} checkStop
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function updateGameResources(onProgress = () => {}, checkStop = () => false) {
    const dir = resourceDir();

    // 1. Tải manifest.
    onProgress({ message: 'Đang tải danh sách cập nhật...' });
    let items;
    try {
        const res = await axios.get(config.resource.manifestUrl, {
            timeout: 20000,
            responseType: 'text',
        });
        items = parseManifest(typeof res.data === 'string' ? res.data : String(res.data));
    } catch (err) {
        return { success: false, error: 'Không tải được danh sách cập nhật: ' + err.message };
    }
    if (!items.length) {
        return { success: false, error: 'Danh sách cập nhật rỗng hoặc sai định dạng.' };
    }

    // 2. So MD5 để lọc file cần tải.
    onProgress({ message: `Đang kiểm tra ${items.length} file...` });
    const toDownload = [];
    for (const it of items) {
        if (checkStop()) return { success: false, error: 'Đã dừng.' };
        if ((await localMd5(path.join(dir, it.fileName))) !== it.hash) toDownload.push(it);
    }

    const total = toDownload.length;
    if (total === 0) {
        return { success: true, data: { checked: items.length, downloaded: 0 } };
    }

    // 3. Tải từng file cần cập nhật.
    let done = 0;
    for (const it of toDownload) {
        if (checkStop()) return { success: false, error: 'Đã dừng.', data: { downloaded: done } };
        const urlPath = it.fileName.replace(/\\/g, '/');
        onProgress({ message: `Đang tải ${urlPath}`, accCurrent: done, accTotal: total });
        try {
            const res = await axios.get(config.resource.baseUrl + urlPath, {
                timeout: 60000,
                responseType: 'arraybuffer',
            });
            const dest = path.join(dir, it.fileName);
            await fsp.mkdir(path.dirname(dest), { recursive: true });
            await fsp.writeFile(dest, Buffer.from(res.data));
            done += 1;
            onProgress({ message: `Đã tải ${urlPath}`, accCurrent: done, accTotal: total });
        } catch (err) {
            return {
                success: false,
                error: `Lỗi tải ${urlPath}: ${err.message}`,
                data: { downloaded: done },
            };
        }
    }

    return { success: true, data: { checked: items.length, downloaded: done } };
}

// Giải captcha cục bộ bằng Tesseract (offline), thay cho việc phụ thuộc api-ninjas.
//
// Captcha của gnddt là ảnh 4 ký tự IN HOA, nền TRONG SUỐT, một màu, kèm 1-2 đường
// kẻ ngang nhiễu. Ta nhị-phân-hóa-theo-alpha (mọi pixel có màu -> đen, nền -> trắng)
// rồi phóng to 3x để Tesseract đọc ổn định kể cả với chữ màu sáng (vàng) — greyscale
// thường làm mất tương phản ở các màu này.
//
// Worker Tesseract khởi tạo 1 lần rồi tái sử dụng. Chạy hoàn toàn offline: eng.traineddata
// đóng gói kèm app (extraResource), lõi wasm lấy từ node_modules (asarUnpack), không gọi CDN.

import path from 'node:path';
import { app } from 'electron';
import { createRequire } from 'node:module';
import { Jimp } from 'jimp';

const require = createRequire(import.meta.url);

// Captcha chỉ gồm chữ cái IN HOA; giới hạn whitelist giúp giảm nhầm lẫn.
const CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BINARIZE_THRESHOLD = 200; // độ sáng < ngưỡng (và alpha đủ đục) => nét chữ
const UPSCALE = 3;

/** Thư mục chứa eng.traineddata (dev: repo, prod: resources cạnh app). */
function getTessdataDir() {
  return app?.isPackaged
    ? path.join(process.resourcesPath, 'tessdata')
    : path.join(app.getAppPath(), 'src', 'resources', 'tessdata');
}

/** Thư mục lõi wasm của tesseract.js (đẩy ra asar.unpacked khi đã đóng gói). */
function getCorePath() {
  const dir = path.dirname(require.resolve('tesseract.js-core/package.json'));
  // Khi đóng gói, node_modules nằm trong app.asar nhưng wasm được asarUnpack ra ngoài.
  return dir.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

let workerPromise = null;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    const tessdataDir = getTessdataDir();
    const worker = await createWorker('eng', 1, {
      // QUAN TRỌNG: đọc traineddata qua cơ chế cache (fs.readFile), KHÔNG qua langPath.
      // Trong Electron, tesseract.js nhận diện env != 'node' nên nhánh langPath sẽ
      // fetch() đường dẫn cục bộ như URL -> "Only absolute URLs are supported".
      // cachePath + cacheMethod 'readOnly' luôn dùng fs.readFile, không phụ thuộc env,
      // không ghi/không gọi CDN. File cần đặt đúng tên `eng.traineddata` (không nén).
      langPath: tessdataDir, // dự phòng
      cachePath: tessdataDir,
      cacheMethod: 'readOnly',
      gzip: false, // traineddata không nén
      corePath: getCorePath(),
      workerBlobURL: false,
    });
    await worker.setParameters({
      tessedit_char_whitelist: CHAR_WHITELIST,
      tessedit_pageseg_mode: '8', // coi cả ảnh là 1 "từ"
    });
    return worker;
  })().catch((err) => {
    workerPromise = null; // cho phép thử lại lần sau
    throw err;
  });
  return workerPromise;
}

/** Chuẩn hóa kết quả OCR: viết hoa, chỉ giữ A-Z0-9. */
export function cleanCaptchaText(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Nhị phân hóa (alpha-aware) mảng pixel RGBA tại chỗ: pixel đủ đục và tối -> đen,
 * còn lại (nền trong suốt hoặc sáng) -> trắng. Nhờ vậy đọc được cả chữ màu sáng (vàng),
 * thứ mà greyscale thường làm mất tương phản.
 */
export function binarizePixels(data, pixelCount, threshold = BINARIZE_THRESHOLD) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const alpha = data[idx + 3];
    const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    const value = alpha >= 128 && brightness < threshold ? 0 : 255;
    data[idx] = data[idx + 1] = data[idx + 2] = value;
    data[idx + 3] = 255;
  }
  return data;
}

/**
 * Nhị phân hóa + phóng to ảnh captcha, trả về buffer PNG cho Tesseract.
 * Mọi màu chữ -> đen trên nền trắng, phóng to 3x để nét rõ hơn.
 */
export async function preprocessCaptcha(imgPath, threshold = BINARIZE_THRESHOLD) {
  const img = await Jimp.read(imgPath);
  const { width, height } = img.bitmap;
  binarizePixels(img.bitmap.data, width * height, threshold);
  img.scale(UPSCALE);
  return img.getBuffer('image/png');
}

/**
 * OCR captcha cục bộ. Ném lỗi nếu worker Tesseract không khởi tạo được — đó là
 * lỗi cài đặt (thiếu traineddata hoặc wasm), không phải đọc sai, nên caller nên
 * dừng hẳn thay vì thử lại. Trả chuỗi đã chuẩn hóa (có thể rỗng khi đọc không ra).
 */
export async function ocrCaptchaLocal(imgPath) {
  const worker = await getWorker();
  const buffer = await preprocessCaptcha(imgPath);
  const { data } = await worker.recognize(buffer);
  return cleanCaptchaText(data.text);
}

/** Dọn worker khi thoát app. */
export async function terminateCaptcha() {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // đã hỏng lúc init hoặc đã đóng — bỏ qua
  }
  workerPromise = null;
}

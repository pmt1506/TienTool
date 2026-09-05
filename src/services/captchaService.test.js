import { describe, it, expect, vi } from 'vitest';

// captchaService import `electron` (app) ở top-level → mock ở biên.
// tesseract.js chỉ được import động trong getWorker nên không cần cho các test dưới.
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/app' } }));

import { cleanCaptchaText, binarizePixels } from './captchaService.js';

describe('cleanCaptchaText', () => {
  it('viết hoa và bỏ ký tự không phải A-Z0-9', () => {
    expect(cleanCaptchaText('ab-cd')).toBe('ABCD');
    expect(cleanCaptchaText(' z k p r ')).toBe('ZKPR');
    expect(cleanCaptchaText('He1lo!')).toBe('HE1LO');
  });

  it('trả chuỗi rỗng cho đầu vào rỗng/null', () => {
    expect(cleanCaptchaText('')).toBe('');
    expect(cleanCaptchaText(null)).toBe('');
    expect(cleanCaptchaText(undefined)).toBe('');
  });
});

describe('binarizePixels', () => {
  // 3 pixel: [0]=chữ xanh đục, [1]=nền trong suốt, [2]=vàng sáng đục
  function makePixels() {
    return new Uint8ClampedArray([
      0,
      0,
      255,
      255, // blue, opaque -> ink (đen)
      0,
      0,
      0,
      0, // transparent bg -> trắng
      255,
      255,
      0,
      255, // yellow (bright ~170), opaque -> ink (đen)
    ]);
  }

  it('màu đục -> đen, nền trong suốt -> trắng, alpha ép về 255', () => {
    const data = binarizePixels(makePixels(), 3);
    // pixel 0: đen
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 255]);
    // pixel 1: trắng (nền trong suốt)
    expect([data[4], data[5], data[6], data[7]]).toEqual([255, 255, 255, 255]);
    // pixel 2: vàng sáng nhưng vẫn là nét -> đen
    expect([data[8], data[9], data[10], data[11]]).toEqual([0, 0, 0, 255]);
  });

  it('mọi pixel chỉ còn thuần đen hoặc trắng', () => {
    const data = binarizePixels(makePixels(), 3);
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      expect(v === 0 || v === 255).toBe(true);
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
      expect(data[i + 3]).toBe(255);
    }
  });

  it('pixel sáng đục (gần trắng) -> trắng (nền)', () => {
    const data = binarizePixels(new Uint8ClampedArray([250, 250, 250, 255]), 1);
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });
});

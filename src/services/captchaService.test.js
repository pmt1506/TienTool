import { describe, it, expect } from 'vitest';
import { cleanCaptchaText } from './apiService.js';

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


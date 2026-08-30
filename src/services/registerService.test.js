import { describe, it, expect, vi } from 'vitest';
import {
  md5,
  rsaPublicKeyPem,
  loginParams,
  visualizeRegisterParams,
  generateNickName,
  phoneFor,
} from './registerService.js';

describe('registerService crypto & helpers', () => {
  it('md5 hash tính chính xác', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    const guid = '2407bc07-c2a7-4be8-a799-4315dfd92faa';
    expect(md5(guid)).toBe('463fd00acd8b0a469773b59a8901770d');
    expect(md5('bejlod')).toBe('edcdb542e1f8559d0fa5a9b37aad3d57');
  });

  it('rsaPublicKeyPem tạo ra định dạng PEM hợp lệ', () => {
    const pem = rsaPublicKeyPem();
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
  });

  it('loginParams tạo payload mã hóa RSA PKCS1 hợp lệ', () => {
    const guid = '2407bc07-c2a7-4be8-a799-4315dfd92faa';
    const result = loginParams('s2myt0007', guid, { pass6: 'bejlod', date: new Date('2026-08-30T12:00:00Z') });

    expect(result.pass6).toBe('bejlod');
    expect(result.params.key).toBe('463fd00acd8b0a469773b59a8901770d');
    expect(result.params.v).toBe(2612558);
    expect(result.params.loginDevice).toBe('true');
    // RSA-1024 mã hóa ra 128 bytes -> base64 length là 172
    expect(result.params.p.length).toBe(172);
  });

  it('visualizeRegisterParams tạo đúng params cho visualizeregister.ashx', () => {
    const params = visualizeRegisterParams('s2myt0007', 'bejlod', 'GNLM1234', false);
    expect(params.Name).toBe('s2myt0007');
    expect(params.NickName).toBe('GNLM1234');
    expect(params.Pass).toBe('bejlod');
    expect(params.key).toBe('edcdb542e1f8559d0fa5a9b37aad3d57');
    expect(params.Sex).toBe(false);
  });

  it('generateNickName sinh tên theo prefix và độ dài tối đa', () => {
    const nick1 = generateNickName('GNLM', 14);
    expect(nick1.startsWith('GNLM')).toBe(true);
    expect(nick1.length).toBeLessThanOrEqual(14);
    expect(nick1.length).toBeGreaterThanOrEqual(6);

    const nick2 = generateNickName('Chip', 10);
    expect(nick2.startsWith('Chip')).toBe(true);
    expect(nick2.length).toBeLessThanOrEqual(10);
  });

  it('phoneFor sinh số điện thoại 10 số bắt đầu bằng 09', () => {
    const phone1 = phoneFor('testaccount01');
    expect(phone1.startsWith('09')).toBe(true);
    expect(phone1.length).toBe(10);

    const phone2 = phoneFor('s2myt0007');
    expect(phone2.startsWith('09')).toBe(true);
    expect(phone2.length).toBe(10);
    expect(phone1).not.toBe(phone2);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  md5,
  rsaPublicKeyPem,
  loginParams,
  visualizeRegisterParams,
  generateNickName,
  phoneFor,
  convertStringToHex,
} from './registerService.js';

describe('registerService crypto & helpers', () => {
  it('convertStringToHex mã hóa IP thành KeyCapcha octal chính xác', () => {
    // 171.225.202.93 là IP trong curl mẫu của người dùng
    const ip = '171.225.202.93';
    const keyCapcha = convertStringToHex(ip);
    expect(keyCapcha).toBe('00610067006100560062006200650056006200600062005600710063');
  });

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

  it('generateNickName sinh tên có cả chữ thường chữ hoa số xen lẫn và đủ 14 ký tự', () => {
    const nick1 = generateNickName('GNLM', 14);
    expect(nick1.startsWith('GNLM')).toBe(true);
    expect(nick1.length).toBe(14);
    const suffix1 = nick1.slice(4);
    expect(/[a-z]/.test(suffix1)).toBe(true);
    expect(/[A-Z]/.test(suffix1)).toBe(true);
    expect(/[0-9]/.test(suffix1)).toBe(true);

    const nick2 = generateNickName('Chip', 10);
    expect(nick2.startsWith('Chip')).toBe(true);
    expect(nick2.length).toBe(10);
    const suffix2 = nick2.slice(4);
    expect(/[a-z]/.test(suffix2)).toBe(true);
    expect(/[A-Z]/.test(suffix2)).toBe(true);
    expect(/[0-9]/.test(suffix2)).toBe(true);

    const longPrefix = 'VeryLongPrefixName';
    const nick3 = generateNickName(longPrefix, 14);
    expect(nick3.length).toBe(14);
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

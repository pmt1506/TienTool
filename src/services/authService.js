import crypto from 'node:crypto';
import axios from 'axios';
import { getCollection } from '../database/mongodb.js';
import config from '../config.js';
import { sendLicenseEmail } from './licenseMailService.js';

const REQUEST_TTL_MS = 30 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function keysCol() {
  return getCollection(config.mongodb.collections.keys);
}

function requestsCol() {
  return getCollection(config.mongodb.collections.licenseRequests);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomSegment(size = 4) {
  return crypto.randomBytes(size).toString('hex').slice(0, size).toUpperCase();
}

async function generateUniqueKey() {
  for (let i = 0; i < 10; i += 1) {
    const key = `TT-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
    const [existingKey, existingRequest] = await Promise.all([
      keysCol().findOne({ keys: key }, { projection: { _id: 1 } }),
      requestsCol().findOne({ generatedKey: key }, { projection: { _id: 1 } }),
    ]);
    if (!existingKey && !existingRequest) return key;
  }
  throw new Error('Không tạo được key duy nhất.');
}

async function generateUniqueRequestId() {
  for (let i = 0; i < 10; i += 1) {
    const requestId = `REQ${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const exists = await requestsCol().findOne({ requestId }, { projection: { _id: 1 } });
    if (!exists) return requestId;
  }
  throw new Error('Không tạo được requestId duy nhất.');
}

async function getCurrentTimeMs() {
  try {
    const timeResp = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC', { timeout: 5000 });
    return new Date(timeResp.data.datetime).getTime();
  } catch (err) {
    console.error('[AuthService] Lỗi khi check api giờ:', err.message);
    return Date.now();
  }
}

export async function loginByKey(key) {
  try {
    const keyDoc = await keysCol().findOne({ keys: key });

    if (!keyDoc) {
      return { success: false, error: 'Key không hợp lệ hoặc không tồn tại.' };
    }

    if (keyDoc.expiredAt) {
      const currentTime = await getCurrentTimeMs();
      const expiredTime = new Date(keyDoc.expiredAt).getTime();

      if (currentTime > expiredTime) {
        return { success: false, error: 'Tài khoản đã hết hạn. Cần gia hạn.' };
      }
    }

    return {
      success: true,
      data: {
        _id: keyDoc._id.toString(),
        keys: keyDoc.keys,
        expiredAt: keyDoc.expiredAt,
        email: keyDoc.email || '',
      },
    };
  } catch (error) {
    console.error('[AuthService] Login error:', error.message);
    return { success: false, error: 'Lỗi kết nối database.' };
  }
}

export async function checkKeyExists(key) {
  try {
    const keyDoc = await keysCol().findOne({ keys: key });
    return {
      success: true,
      exists: !!keyDoc,
      expiredAt: keyDoc ? keyDoc.expiredAt : null,
      email: keyDoc ? (keyDoc.email || '') : '',
    };
  } catch (error) {
    console.error('[AuthService] Check key error:', error.message);
    return { success: false, error: 'Lỗi kết nối database.' };
  }
}

export async function createRegistrationRequest(email) {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return { success: false, error: 'Email không hợp lệ.' };
    }

    const now = new Date();
    const existingPending = await requestsCol().findOne({
      email: normalizedEmail,
      status: 'pending',
      expiresAt: { $gt: now.toISOString() },
    });

    if (existingPending) {
      return {
        success: true,
        data: {
          requestId: existingPending.requestId,
          email: existingPending.email,
        },
      };
    }

    const requestId = await generateUniqueRequestId();
    const generatedKey = await generateUniqueKey();

    await requestsCol().insertOne({
      requestId,
      generatedKey,
      email: normalizedEmail,
      status: 'pending',
      amount: 59000,
      durationDays: 30,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(),
    });

    return {
      success: true,
      data: {
        requestId,
        email: normalizedEmail,
      },
    };
  } catch (error) {
    console.error('[AuthService] Create registration request error:', error.message);
    return { success: false, error: 'Không tạo được yêu cầu đăng ký.' };
  }
}

export async function getRegistrationRequestStatus(requestId) {
  try {
    const requestDoc = await requestsCol().findOne({ requestId: String(requestId || '').trim().toUpperCase() });

    if (!requestDoc) {
      return { success: false, error: 'Không tìm thấy yêu cầu đăng ký.' };
    }

    const isExpiredPending = requestDoc.status === 'pending' && requestDoc.expiresAt && new Date(requestDoc.expiresAt).getTime() < Date.now();

    if (isExpiredPending) {
      await requestsCol().updateOne(
        { _id: requestDoc._id },
        { $set: { status: 'expired' } },
      );
      requestDoc.status = 'expired';
    }

    return {
      success: true,
      data: {
        requestId: requestDoc.requestId,
        status: requestDoc.status,
        email: requestDoc.email,
        key: requestDoc.status === 'paid' ? requestDoc.generatedKey : '',
      },
    };
  } catch (error) {
    console.error('[AuthService] Get registration status error:', error.message);
    return { success: false, error: 'Không kiểm tra được trạng thái đăng ký.' };
  }
}

export async function resendLicenseEmail(email) {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return { success: false, error: 'Email không hợp lệ.' };
    }

    const keyDoc = await keysCol().findOne(
      { email: normalizedEmail },
      { sort: { expiredAt: -1, createdAt: -1 } },
    );

    if (!keyDoc) {
      return { success: false, error: 'Không tìm thấy key nào gắn với email này.' };
    }

    await sendLicenseEmail({
      to: normalizedEmail,
      key: keyDoc.keys,
      expiredAt: keyDoc.expiredAt,
      mode: 'resend',
    });

    return { success: true };
  } catch (error) {
    console.error('[AuthService] Resend email error:', error.message);
    return { success: false, error: error.message || 'Không gửi lại được email.' };
  }
}

export function getLicenseDurationMs() {
  return THIRTY_DAYS_MS;
}

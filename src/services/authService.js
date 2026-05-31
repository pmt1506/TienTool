import { getCollection } from '../database/mongodb.js';
import config from '../config.js';
import axios from 'axios';

/**
 * Login by key string.
 * Finds a document in `keys` collection where `keys` field matches the given key.
 * Returns the key document if found, null otherwise.
 */
export async function loginByKey(key) {
  try {
    const keysCol = getCollection(config.mongodb.collections.keys);
    const keyDoc = await keysCol.findOne({ keys: key });

    if (!keyDoc) {
      return { success: false, error: 'Key không hợp lệ hoặc không tồn tại.' };
    }

    if (keyDoc.expiredAt) {
      try {
        const timeResp = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC', { timeout: 5000 });
        const currentTime = new Date(timeResp.data.datetime).getTime();
        const expiredTime = new Date(keyDoc.expiredAt).getTime();
        
        if (currentTime > expiredTime) {
          return { success: false, error: 'Tài khoản đã hết hạn. Cần gia hạn.' };
        }
      } catch (err) {
        console.error('[AuthService] Lỗi khi check api giờ:', err.message);
        // Fallback sang local time nếu API lỗi
        const currentTime = new Date().getTime();
        const expiredTime = new Date(keyDoc.expiredAt).getTime();
        if (currentTime > expiredTime) {
          return { success: false, error: 'Tài khoản đã hết hạn. Cần gia hạn.' };
        }
      }
    }

    return {
      success: true,
      data: {
        _id: keyDoc._id.toString(),
        keys: keyDoc.keys,
        expiredAt: keyDoc.expiredAt,
      },
    };
  } catch (error) {
    console.error('[AuthService] Login error:', error.message);
    return { success: false, error: 'Lỗi kết nối database.' };
  }
}

/**
 * Check if a key exists in database
 */
export async function checkKeyExists(key) {
  try {
    const keysCol = getCollection(config.mongodb.collections.keys);
    const keyDoc = await keysCol.findOne({ keys: key });
    return { success: true, exists: !!keyDoc };
  } catch (error) {
    console.error('[AuthService] Check key error:', error.message);
    return { success: false, error: 'Lỗi kết nối database.' };
  }
}

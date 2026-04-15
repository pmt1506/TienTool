import { getCollection } from '../database/mongodb.js';
import config from '../config.js';

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

    return {
      success: true,
      data: {
        _id: keyDoc._id.toString(),
        keys: keyDoc.keys,
      },
    };
  } catch (error) {
    console.error('[AuthService] Login error:', error.message);
    return { success: false, error: 'Lỗi kết nối database.' };
  }
}

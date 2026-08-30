import { ObjectId } from 'mongodb';
import { getCollection } from '../database/mongodb.js';
import config from '../config.js';

const col = () => getCollection(config.mongodb.collections.accounts);

/**
 * Get all accounts for a given keyId sort by type -> server -> account by alphabet
 */
export async function getAccounts(keyId) {
  try {
    const accounts = await col()
      .find({ keyId: new ObjectId(keyId) })
      .sort({ accountType: 1, server: 1 })
      .toArray();

    accounts.sort((a, b) => {
      if (a.accountType !== b.accountType) {
        return a.accountType - b.accountType;
      }

      if (a.server !== b.server) {
        return a.server - b.server;
      }

      return a.username.localeCompare(b.username, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    return {
      success: true,
      data: accounts.map((a) => ({
        ...a,
        _id: a._id.toString(),
        keyId: a.keyId.toString(),
      })),
    };
  } catch (error) {
    console.error('[AccountService] getAccounts error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new account
 * type = 1: acc chính
 * type = 2: acc clone
 */
export async function createAccount(data) {
  try {
    const doc = {
      keyId: new ObjectId(data.keyId),
      username: data.username,
      password: data.password,
      server: parseInt(data.server, 10),
      accountType: parseInt(data.accountType, 10) || 2,
      note: data.note || '',
    };

    const result = await col().insertOne(doc);
    return {
      success: true,
      data: { ...doc, _id: result.insertedId.toString(), keyId: doc.keyId.toString() },
    };
  } catch (error) {
    console.error('[AccountService] createAccount error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Batch create multiple accounts
 */
export async function createAccountsBatch(list) {
  try {
    if (!list || list.length === 0) return { success: true, count: 0 };
    const docs = list.map((data) => ({
      keyId: new ObjectId(data.keyId),
      username: data.username,
      password: data.password,
      server: parseInt(data.server, 10),
      accountType: parseInt(data.accountType, 10) || 2,
      note: data.note || '',
    }));
    const result = await col().insertMany(docs);
    return { success: true, count: result.insertedCount };
  } catch (error) {
    console.error('[AccountService] createAccountsBatch error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing account by _id
 */
export async function updateAccount(id, data) {
  try {
    const updateFields = {};
    if (data.username !== undefined) updateFields.username = data.username;
    if (data.password !== undefined) updateFields.password = data.password;
    if (data.server !== undefined) updateFields.server = parseInt(data.server, 10);
    if (data.accountType !== undefined) updateFields.accountType = parseInt(data.accountType, 10);
    if (data.note !== undefined) updateFields.note = data.note;

    const result = await col().updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return { success: false, error: 'Account không tồn tại.' };
    }

    return { success: true, data: { _id: id, ...updateFields } };
  } catch (error) {
    console.error('[AccountService] updateAccount error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete an account by _id
 */
export async function deleteAccount(id) {
  try {
    const result = await col().deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return { success: false, error: 'Account không tồn tại.' };
    }

    return { success: true };
  } catch (error) {
    console.error('[AccountService] deleteAccount error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete multiple accounts by array of _ids
 */
export async function deleteAccountsBatch(ids) {
  try {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    const objectIds = ids.map((id) => new ObjectId(id));
    const result = await col().deleteMany({ _id: { $in: objectIds } });
    return { success: true, count: result.deletedCount };
  } catch (error) {
    console.error('[AccountService] deleteAccountsBatch error:', error.message);
    return { success: false, error: error.message };
  }
}

import { ObjectId } from 'mongodb';
import { getCollection } from '../database/mongodb.js';
import config from '../config.js';

const col = () => getCollection(config.mongodb.collections.templates);

/**
 * Get all templates for a given keyId
 */
export async function getTemplates(keyId) {
  try {
    const templates = await col()
      .find({ keyId: new ObjectId(keyId) })
      .sort({ name: 1, createdAt: -1 })
      .toArray();

    return {
      success: true,
      data: templates.map((t) => ({
        ...t,
        _id: t._id.toString(),
        keyId: t.keyId.toString(),
        accountIds: t.accountIds.map(id => id.toString())
      })),
    };
  } catch (error) {
    console.error('[TemplateService] getTemplates error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new template
 */
export async function createTemplate(data) {
  try {
    if (!data.keyId) throw new Error("keyId is missing or undefined");
    if (!Array.isArray(data.accountIds)) throw new Error("accountIds must be an array");
    
    const doc = {
      keyId: new ObjectId(data.keyId),
      name: data.name,
      accountIds: data.accountIds.map(id => {
        if (!id) throw new Error("An accountId is missing or undefined");
        return new ObjectId(id);
      }),
      createdAt: new Date(),
    };

    const result = await col().insertOne(doc);
    
    return {
      success: true,
      data: { 
        ...doc, 
        _id: result.insertedId.toString(), 
        keyId: doc.keyId.toString(),
        accountIds: doc.accountIds.map(id => id.toString())
      },
    };
  } catch (error) {
    console.error('[TemplateService] createTemplate error:', error.stack || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update a template by _id
 */
export async function updateTemplate(id, data) {
  try {
    const updateFields = {};
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.accountIds !== undefined) {
      updateFields.accountIds = data.accountIds.map(accId => new ObjectId(accId));
    }

    const result = await col().updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return { success: false, error: 'Template không tồn tại.' };
    }

    return { success: true, data: { _id: id, ...updateFields } };
  } catch (error) {
    console.error('[TemplateService] updateTemplate error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a template by _id
 */
export async function deleteTemplate(id) {
  try {
    const result = await col().deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return { success: false, error: 'Template không tồn tại.' };
    }

    return { success: true };
  } catch (error) {
    console.error('[TemplateService] deleteTemplate error:', error.message);
    return { success: false, error: error.message };
  }
}

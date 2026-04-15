import { MongoClient } from 'mongodb';
import config from '../config.js';

let client = null;
let db = null;

export async function connect() {
  try {
    client = new MongoClient(config.mongodb.uri);
    await client.connect();
    db = client.db(config.mongodb.dbName);
    console.log(`[MongoDB] Connected to ${config.mongodb.dbName}`);
    return db;
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error);
    throw error;
  }
}

export async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Disconnected');
  }
}

export function getDb() {
  if (!db) {
    throw new Error('[MongoDB] Not connected. Call connect() first.');
  }
  return db;
}

export function getCollection(name) {
  return getDb().collection(name);
}

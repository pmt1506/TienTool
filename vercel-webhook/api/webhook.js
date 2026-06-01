const { MongoClient } = require('mongodb');

// Vercel Serverless Function for SePay Webhook
// This endpoint will be accessible at: https://<your-vercel-domain>/api/webhook

// Setup MongoDB URI
// It uses environment variable if available, otherwise fallbacks to your hardcoded one
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://pmt1506:2eiSrgulkIDlJnPt@ac-lwlclos-shard-00-00.ladph0b.mongodb.net:27017,ac-lwlclos-shard-00-01.ladph0b.mongodb.net:27017,ac-lwlclos-shard-00-02.ladph0b.mongodb.net:27017/?ssl=true&replicaSet=atlas-84ahc7-shard-0&authSource=admin&appName=qltk";
const DB_NAME = 'qltk';

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  cachedDb = db;
  return db;
}

module.exports = async (req, res) => {
  // Allow only POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const data = req.body;

    // SePay Webhook Payload Fields
    const transferType = data.transferType; // 'in' is incoming money
    const transferAmount = parseInt(data.transferAmount, 10);
    const content = data.content || '';

    console.log('[Webhook] Received:', { transferType, transferAmount, content });

    // 1. Only process incoming transfers
    if (transferType !== 'in') {
      return res.status(200).json({ success: true, message: 'Not an incoming transfer' });
    }

    // 2. Tạm thời bỏ qua việc check số tiền (comment lại theo yêu cầu)
    // if (transferAmount < 59000) {
    //   return res.status(200).json({ success: true, message: 'Amount less than required (59,000)' });
    // }

    // 3. Extract the KEY from the content
    // We expect the user to send "GH <KEY>" or "DK <KEY>"
    const match = content.match(/(GH|DK)\s+([A-Za-z0-9_-]+)/i);
    if (!match) {
      return res.status(200).json({ success: true, message: 'No valid key found in content' });
    }

    const actionString = match[1].toUpperCase();
    const keyString = match[2];
    console.log(`[Webhook] Extracted Action: ${actionString}, Key: ${keyString}`);

    // 4. Update the Database
    const db = await connectToDatabase();
    const keysCol = db.collection('keys');

    const keyDoc = await keysCol.findOne({ keys: keyString });
    
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    if (!keyDoc) {
      // Key does not exist -> Create new key (Registration)
      console.log('[Webhook] Key not found, creating new key:', keyString);
      
      const newExpiredAt = new Date(now.getTime() + thirtyDaysMs);
      
      await keysCol.insertOne({
        keys: keyString,
        expiredAt: newExpiredAt.toISOString(),
        createdAt: now.toISOString()
      });
      
      console.log(`[Webhook] Successfully registered and activated key ${keyString}. ExpiredAt: ${newExpiredAt.toISOString()}`);
      return res.status(200).json({ success: true, message: 'Created and activated new key' });
    }

    // Key exists -> Calculate new expiredAt
    let currentExpiredAt = keyDoc.expiredAt ? new Date(keyDoc.expiredAt) : now;
    
    if (currentExpiredAt < now) {
      currentExpiredAt = now;
    }

    const newExpiredAt = new Date(currentExpiredAt.getTime() + thirtyDaysMs);

    // Update in MongoDB
    await keysCol.updateOne(
      { _id: keyDoc._id },
      { $set: { expiredAt: newExpiredAt.toISOString() } }
    );

    console.log(`[Webhook] Successfully renewed key ${keyString}. New expiredAt: ${newExpiredAt.toISOString()}`);
    
    // Respond back to SePay with success
    return res.status(200).json({ success: true, message: 'Renewed successfully' });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    // Return 200 so SePay doesn't keep retrying excessively if it's a code error,
    // but in real scenarios 500 is standard. Vercel logs will capture it.
    return res.status(500).json({ success: false, error: error.message });
  }
};

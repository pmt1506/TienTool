const { MongoClient } = require('mongodb');
const { sendLicenseEmail } = require('./_mail');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'qltk';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

function addDuration(baseDate) {
  return new Date(baseDate.getTime() + THIRTY_DAYS_MS);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const data = req.body || {};
    const transferType = data.transferType;
    const content = data.content || '';
    const transferAmount = parseInt(data.transferAmount, 10);

    console.log('[Webhook] Received:', { transferType, transferAmount, content });

    if (transferType !== 'in') {
      return res.status(200).json({ success: true, message: 'Not an incoming transfer' });
    }

    const match = content.match(/(GH|DK)\s+([A-Za-z0-9_-]+)/i);
    if (!match) {
      return res.status(200).json({ success: true, message: 'No valid action found in content' });
    }

    const action = match[1].toUpperCase();
    const token = match[2].toUpperCase();
    const db = await connectToDatabase();
    const keysCol = db.collection('keys');
    const licenseRequestsCol = db.collection('licenseRequests');
    const now = new Date();

    if (action === 'DK') {
      const requestDoc = await licenseRequestsCol.findOne({ requestId: token });

      if (requestDoc) {
        if (requestDoc.status === 'paid') {
          return res.status(200).json({ success: true, message: 'Request already processed' });
        }

        const expiredAt = addDuration(now);

        await keysCol.updateOne(
          { keys: requestDoc.generatedKey },
          {
            $set: {
              keys: requestDoc.generatedKey,
              email: requestDoc.email,
              expiredAt: expiredAt.toISOString(),
              activatedAt: now.toISOString(),
              requestId: requestDoc.requestId,
            },
            $setOnInsert: {
              createdAt: now.toISOString(),
            },
          },
          { upsert: true },
        );

        await licenseRequestsCol.updateOne(
          { _id: requestDoc._id },
          {
            $set: {
              status: 'paid',
              paidAt: now.toISOString(),
              expiredAt: expiredAt.toISOString(),
              transferAmount,
              transferContent: content,
            },
          },
        );

        try {
          await sendLicenseEmail({
            to: requestDoc.email,
            key: requestDoc.generatedKey,
            expiredAt: expiredAt.toISOString(),
            mode: 'register',
          });
        } catch (mailErr) {
          console.error('[Webhook] Send register email error:', mailErr);
        }

        return res.status(200).json({ success: true, message: 'Registration activated' });
      }

      // Backward compatibility: old flow "DK <KEY>"
      const keyString = match[2];
      const keyDoc = await keysCol.findOne({ keys: keyString });
      if (!keyDoc) {
        const expiredAt = addDuration(now);
        await keysCol.insertOne({
          keys: keyString,
          expiredAt: expiredAt.toISOString(),
          createdAt: now.toISOString(),
          activatedAt: now.toISOString(),
        });
        return res.status(200).json({ success: true, message: 'Created legacy key' });
      }
    }

    const keyString = match[2];
    const keyDoc = await keysCol.findOne({ keys: keyString });

    if (!keyDoc) {
      return res.status(200).json({ success: true, message: 'Key not found for renewal' });
    }

    let currentExpiredAt = keyDoc.expiredAt ? new Date(keyDoc.expiredAt) : now;
    if (currentExpiredAt < now) {
      currentExpiredAt = now;
    }

    const newExpiredAt = addDuration(currentExpiredAt);

    await keysCol.updateOne(
      { _id: keyDoc._id },
      { $set: { expiredAt: newExpiredAt.toISOString() } },
    );

    if (keyDoc.email) {
      try {
        await sendLicenseEmail({
          to: keyDoc.email,
          key: keyDoc.keys,
          expiredAt: newExpiredAt.toISOString(),
          mode: 'renew',
        });
      } catch (mailErr) {
        console.error('[Webhook] Send renew email error:', mailErr);
      }
    }

    return res.status(200).json({ success: true, message: 'Renewed successfully' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

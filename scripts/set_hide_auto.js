import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uriFromArgs = process.argv[2];
const uri = uriFromArgs || process.env.MONGODB_URI;
const dbName = 'qltk';

if (!uri) {
  console.error('❌ Lỗi: Vui lòng truyền connection string MongoDB hoặc cấu hình biến môi trường MONGODB_URI.');
  console.log('Cách dùng: node scripts/set_hide_auto.js "<mongodb_connection_string>"');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(uri);
  try {
    console.log('🔄 Đang kết nối tới MongoDB...');
    await client.connect();
    console.log('✅ Đã kết nối thành công!');

    const db = client.db(dbName);
    const keysCol = db.collection('keys');

    const totalKeys = await keysCol.countDocuments();
    console.log(`📊 Tổng số key trong collection "keys": ${totalKeys}`);

    const result = await keysCol.updateMany(
      {},
      { $set: { hideAuto: true } }
    );

    console.log(`✅ Cập nhật thành công!`);
    console.log(`   - Số document khớp: ${result.matchedCount}`);
    console.log(`   - Số document đã cập nhật (modified): ${result.modifiedCount}`);
  } catch (err) {
    console.error('❌ Lỗi trong quá trình cập nhật:', err);
  } finally {
    await client.close();
    console.log('🔒 Đã đóng kết nối MongoDB.');
  }
}

run();

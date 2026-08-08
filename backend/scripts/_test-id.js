import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  const f = await File.findOne({ trackingId: 'TEST-HVB5FD' }).lean();
  console.log('_id type:', typeof f?._id);
  console.log('_id:', f?._id);
  console.log('_id toString:', f?._id?.toString());
  await mongoose.disconnect();
}
main().catch(console.error);

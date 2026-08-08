import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  const f = await File.findOne({ trackingId: 'TEST-HVB5FD' }).lean();
  console.log('found via trackingId:', !!f);
  if (f) {
    console.log('_id:', f._id?.toString());
  }
  // Now try the same query the controller uses
  const f2 = await File.findOne({ _id: f?._id, isDeleted: { $ne: true } }).lean();
  console.log('found via controller query:', !!f2);
  await mongoose.disconnect();
}
main().catch(console.error);

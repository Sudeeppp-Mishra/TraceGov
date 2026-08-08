import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  // Mimic controller's exact query
  const id = '6a76fc3938c2873dce922307';
  const file = await File.findOne({ _id: id, isDeleted: { $ne: true } });
  console.log('file:', file ? 'FOUND' : 'NULL');
  if (file) {
    console.log('wardCode:', file.wardCode);
    console.log('docVerifications.length:', file.documentVerifications?.length);
    console.log('idx=0 status:', file.documentVerifications?.[0]?.status);
  }
  await mongoose.disconnect();
}
main().catch(console.error);

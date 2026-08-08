import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  const f = await File.findById('6a76fc3938c2873dce922307').lean();
  console.log('isDeleted:', f?.isDeleted);
  console.log('wardCode:', f?.wardCode);
  console.log('keys:', Object.keys(f));
  await mongoose.disconnect();
}
main().catch(console.error);

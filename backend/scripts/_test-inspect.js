import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  const f = await File.findById('6a76fc3938c2873dce922307').lean();
  console.log(JSON.stringify({wardCode: f?.wardCode, deleted: f?.isDeleted, dvs: f?.documentVerifications?.length}, null, 2));
  await mongoose.disconnect();
}
main().catch(console.error);

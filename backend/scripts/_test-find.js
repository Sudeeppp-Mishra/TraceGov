import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  const oid = new mongoose.Types.ObjectId('6a76fc3938c2873dce922307');
  console.log('oid:', oid);
  const f1 = await File.findById(oid).lean();
  console.log('findById(oid):', f1 ? 'FOUND' : 'NULL');
  const f2 = await File.findById('6a76fc3938c2873dce922307').lean();
  console.log('findById(str):', f2 ? 'FOUND' : 'NULL');
  // same as the controller
  const f3 = await File.findOne({ _id: '6a76fc3938c2873dce922307', isDeleted: { $ne: true } }).lean();
  console.log('findOne(controller style):', f3 ? 'FOUND' : 'NULL');
  await mongoose.disconnect();
}
main().catch(console.error);

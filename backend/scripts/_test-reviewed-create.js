import mongoose from 'mongoose';
import { File } from '../src/models/File.js';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/tracegov');
  const wardCode = 'W01';

  const fileId = new mongoose.Types.ObjectId();
  const fileUid = 'TEST-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  await File.create({
    _id: fileId,
    fileUid,
    trackingId: fileUid,
    title: 'Test needs_review reviewed',
    wardCode,
    currentStatus: 'Pending',
    currentLocation: 'Verification Desk',
    citizenName: 'Test Citizen',
    citizenPhone: '9800000099',
    documentType: 'Citizenship Certificate',
    qrPayload: 'test-qr',
    documentVerifications: [{
      documentLabel: 'Citizenship Certificate',
      status: 'needs_review',
      missingKeywords: ['signature', 'stamp'],
      detectedType: 'Citizenship',
      ocrConfidence: 0.6,
      isQualityPassed: false,
      scannedAt: new Date(),
    }],
    missingDocuments: [],
    verificationStatus: 'missing-documents',
    requiredDocuments: ['Citizenship Certificate'],
  });

  console.log('Created test file:', fileId.toString(), fileUid);
  console.log('TEST_FILE_ID=' + fileId.toString());
  console.log('TEST_FILE_UID=' + fileUid);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });

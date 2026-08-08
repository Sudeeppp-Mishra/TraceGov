// Verify the same `{...dv}` EmbeddedDocument-spread bug for `reuploadDocument`.
import mongoose from 'mongoose';
import { File } from '../src/models/File.js';

const MONGODB_URI = 'mongodb+srv://contactsudeepm_db_user:CI8olnsL6w8lLraL@tracegov.ypetvee.mongodb.net/tracegov?appName=TraceGov';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const fileUid = 'TEST-REU-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const file = await File.create({
    fileUid,
    trackingId: fileUid,
    title: 'Reupload E2E test',
    wardCode: 'W01',
    currentStatus: 'Pending',
    currentLocation: 'Verification Desk',
    citizenName: 'Test Citizen',
    citizenPhone: '9800000099',
    documentType: 'Citizenship Application',
    qrPayload: 'test-qr',
    requiredDocuments: ['Citizenship Copy'],
    documentVerifications: [{
      documentLabel: 'Citizenship Copy',
      status: 'needs_review',
      missingKeywords: ['signature'],
      detectedType: 'Citizenship',
      scannedAt: new Date(),
    }],
    missingDocuments: [],
    verificationStatus: 'missing-documents',
  });

  const fileId = file._id;
  const idxNum = 0;
  const reloaded = await File.findById(fileId);
  const dv = reloaded.documentVerifications[idxNum];

  // Mirrors the production controller's exact mutation block.
  reloaded.documentVerifications[idxNum] = {
    ...dv,
    imagePreview: 'data:image/png;base64,AAA',
    imagePreviews: ['data:image/png;base64,AAA'],
    scannedAt: new Date(),
    detectedType: 'Citizenship',
    ocrConfidence: 0.9,
    qualityScore: 0.9,
    completenessScore: 1.0,
    detectedLanguage: 'en',
    isQualityPassed: true,
    missingKeywords: [],
    status: 'verified',
  };
  try {
    await reloaded.save();
    console.log('reuploadDocument: SAVE SUCCEEDED (spread carried documentLabel)');
  } catch (err) {
    console.log('reuploadDocument: SAVE FAILED —', err.message);
  }

  await File.deleteOne({ _id: fileId });
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

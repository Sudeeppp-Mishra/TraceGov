import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { File } from '../src/models/File.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import {
  getMissingDocs,
  getNeedsReviewDocs,
  isDocNeedsReview,
} from '../src/utils/docStatus.js';

dotenv.config();

const MISSING_BLOBS = ['missingDocuments', 'missingKeywords'];

/**
 * One-time cleanup migration: strips labels that were misclassified as
 * "missing" in the legacy `file.missingDocuments[]` and
 * `file.documentVerification.missingDocuments[]` /
 * `file.documentVerification.missingKeywords[]` blobs.
 *
 * Bug history (see `per-doc-source-of-truth` memory): prior to this fix,
 * any `documentVerifications[].status !== 'verified'` was treated as
 * "missing" — including `needs_review`, which actually means "already
 * uploaded, awaiting officer review". The persisted legacy blobs therefore
 * listed docs the citizen had already handed in. Email bodies, citizen
 * track banners, and the registration receipt all read from those blobs
 * and showed the wrong labels.
 *
 * After this script runs:
 *   - `missingDocuments[]` only contains labels whose
 *     `documentVerifications[].status` is `not_uploaded` / `unverified`
 *   - `documentVerification.missingDocuments` /
 *     `documentVerification.missingKeywords` are scrubbed the same way
 *   - `verificationStatus` is recomputed (complete ↔ missing-documents)
 *
 * Idempotent: running twice is a no-op (the second pass sees no labels
 * to drop). Safe to run while the server is offline.
 *
 * Usage:
 *   cd backend && node scripts/migrate-cleanup-needs-review-missing.js
 */
async function migrate() {
  console.log('Migration: Connecting to database...');
  await connectDatabase();

  const cursor = File.find({
    isDeleted: { $ne: true },
    // Only touch files that actually carry per-doc data; pre-pipeline files
    // (no `documentVerifications[]`) need the legacy blob to survive
    // untouched so older files keep their existing citizen-pending list.
    documentVerifications: { $exists: true, $not: { $size: 0 } },
  }).cursor();

  let scanned = 0;
  let mutated = 0;

  for await (const file of cursor) {
    scanned += 1;

    // The shared helper is the source of truth for both lists. Don't trust
    // the persisted blobs — they may have been written under the old rule.
    const correctMissing = getMissingDocs(file);
    const correctNeedsReview = getNeedsReviewDocs(file);

    // Compare to what was persisted.
    const persistedMissing = Array.isArray(file.missingDocuments) ? file.missingDocuments : [];
    const persistedDvMissing = Array.isArray(file.documentVerification?.missingDocuments)
      ? file.documentVerification.missingDocuments : [];
    const persistedDvKeywords = Array.isArray(file.documentVerification?.missingKeywords)
      ? file.documentVerification.missingKeywords : [];

    // We expect the persisted missing set to be a SUPERSET of the correct
    // missing set (the bug was that needs_review labels were added in). If
    // they're equal, this file is already clean and we can skip the write.
    const isMissingClean = arraysEqualSet(persistedMissing, correctMissing)
      && arraysEqualSet(persistedDvMissing, correctMissing)
      && arraysEqualSet(persistedDvKeywords, correctMissing);
    const expectedStatus = correctMissing.length === 0 ? 'complete' : 'missing-documents';
    const isStatusClean = file.verificationStatus === expectedStatus;

    if (isMissingClean && isStatusClean) {
      continue;
    }

    file.missingDocuments = correctMissing;
    if (file.documentVerification) {
      file.documentVerification.missingDocuments = correctMissing;
      file.documentVerification.missingKeywords = correctMissing;
    }
    file.verificationStatus = expectedStatus;
    file.markModified?.('documentVerification');

    await file.save();
    mutated += 1;

    if (mutated % 25 === 0) {
      console.log(`Migration: progress ${mutated} file(s) updated (${scanned} scanned).`);
    }
  }

  console.log(`Migration: complete. Scanned ${scanned} file(s); mutated ${mutated} file(s).`);
  await disconnectDatabase();
  console.log('Migration: Done.');
}

function arraysEqualSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a.map((s) => String(s).toLowerCase()));
  const setB = new Set(b.map((s) => String(s).toLowerCase()));
  if (setA.size !== setB.size) return false;
  for (const v of setA) if (!setB.has(v)) return false;
  return true;
}

migrate().catch((err) => {
  console.error('Migration: fatal error:', err);
  process.exitCode = 1;
  // Always release the connection on failure.
  mongoose.disconnect().catch(() => {});
});
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';

// Load environment configuration
dotenv.config();

const STALE_INDEX_NAME = 'trackingNumber_1';
const COLLECTION_NAME = 'files';

/**
 * One-time migration: drops the legacy unique index `trackingNumber_1` left
 * behind on the `files` collection after the File model's `trackingNumber`
 * field was renamed to `trackingId`. Databases provisioned before that rename
 * may still carry this stale index; if left in place, MongoDB's unique index
 * constraint on the now-absent field would cause duplicate key errors
 * (E11000) on every file registered after the first, since all documents
 * would implicitly share `trackingNumber: null`.
 *
 * Safe to run multiple times, and safe to run against databases that never
 * had the stale index (it simply no-ops in that case).
 *
 * Usage: npm run migrate:drop-stale-index --workspace=backend
 *        (or: node scripts/migrate-drop-stale-index.js from backend/)
 */
async function migrate() {
  console.log('Migration: Connecting to database...');
  await connectDatabase();

  try {
    await mongoose.connection.db.collection(COLLECTION_NAME).dropIndex(STALE_INDEX_NAME);
    console.log(`Migration: Successfully dropped stale index "${STALE_INDEX_NAME}" from "${COLLECTION_NAME}".`);
  } catch (err) {
    if (err.codeName === 'IndexNotFound' || err.code === 27) {
      console.log(`Migration: Index "${STALE_INDEX_NAME}" not present on "${COLLECTION_NAME}" — nothing to do.`);
    } else {
      console.error(`Migration: Failed to drop index "${STALE_INDEX_NAME}": ${err.message}`);
      process.exitCode = 1;
    }
  } finally {
    await disconnectDatabase();
    console.log('Migration: Done.');
  }
}

migrate();
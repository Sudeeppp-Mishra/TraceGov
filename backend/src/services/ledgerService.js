import { MovementHistory } from '../models/MovementHistory.js';
import { computeLogHash } from './cryptoService.js';

/**
 * Appends a new immutable log entry to the movement ledger, linking it to the previous hash.
 */
export async function appendMovementLog({
  fileId,
  officerId,
  actionType,
  currentLocation,
  previousLocation,
  notes,
  internalNotes,
  backtrackReason,
  nextLocation,
  scannedVia,
  remarks,
  timestamp,
  session,
}) {
  // Find the last record for this file to link hashes
  const lastEntry = await MovementHistory.findOne({ fileId })
    .sort({ timestamp: -1 })
    .select('entryHash')
    .session(session || null)
    .lean();

  // Optional explicit timestamp (used by the demo seeder to build realistic,
  // backdated ledger history). Defaults to "now" for all production call
  // sites (registerFile/forwardFile/backtrackFile), matching prior behavior.
  const entryTimestamp = timestamp instanceof Date ? timestamp : new Date();
  const previousHash = lastEntry?.entryHash || 'GENESIS';

  const entryDraft = {
    fileId,
    officerId,
    actionType,
    currentLocation,
    previousLocation,
    timestamp: entryTimestamp,
    notes,
    internalNotes,
    backtrackReason,
    nextLocation,
    scannedVia: scannedVia || 'manual',
    remarks: remarks || undefined,
  };

  // Compute the cryptographic hash for the new record
  const entryHash = computeLogHash(entryDraft, previousHash);

  // Persist the entry in the ledger
  const [createdEntry] = await MovementHistory.create(
    [{ ...entryDraft, previousHash, entryHash }],
    { session }
  );

  return createdEntry;
}

/**
 * Verifies the integrity of the audit chain for a file's entire movement ledger.
 * Returns { valid: true } or identifies the specific record where the chain is broken.
 */
export async function verifyLogChain(fileId) {
  const entries = await MovementHistory.find({ fileId })
    .sort({ timestamp: 1 })
    .lean();

  let expectedPreviousHash = 'GENESIS';

  for (const entry of entries) {
    // Recompute hash using the same criteria
    const computedHash = computeLogHash(entry, expectedPreviousHash);

    if (entry.entryHash !== computedHash || entry.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        brokenAt: entry._id,
        expectedHash: computedHash,
        actualHash: entry.entryHash,
      };
    }
    
    expectedPreviousHash = entry.entryHash;
  }

  return {
    valid: true,
    count: entries.length,
  };
}
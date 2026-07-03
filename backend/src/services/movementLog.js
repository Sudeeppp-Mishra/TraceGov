import { MovementHistory } from '../models/MovementHistory.js';
import { computeLogHash } from '../utils/crypto.js';

/**
 * Append an immutable movement log entry with hash-chain integrity.
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
  session,
}) {
  const lastEntry = await MovementHistory.findOne({ fileId })
    .sort({ timestamp: -1 })
    .select('entryHash')
    .session(session || null)
    .lean();

  const timestamp = new Date();
  const previousHash = lastEntry?.entryHash || 'GENESIS';

  const draft = {
    fileId,
    officerId,
    actionType,
    currentLocation,
    previousLocation,
    timestamp,
    notes,
    internalNotes,
    backtrackReason,
    nextLocation,
  };

  const entryHash = computeLogHash(draft, previousHash);

  const [entry] = await MovementHistory.create(
    [{ ...draft, previousHash, entryHash }],
    { session }
  );

  return entry;
}

/**
 * Verify hash chain integrity for a file's movement history.
 */
export async function verifyLogChain(fileId) {
  const entries = await MovementHistory.find({ fileId }).sort({ timestamp: 1 }).lean();

  let previousHash = 'GENESIS';
  for (const entry of entries) {
    const expected = computeLogHash(entry, previousHash);
    if (entry.entryHash !== expected || entry.previousHash !== previousHash) {
      return { valid: false, brokenAt: entry._id };
    }
    previousHash = entry.entryHash;
  }

  return { valid: true, count: entries.length };
}

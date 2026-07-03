import crypto from 'crypto';

/**
 * Builds a tamper-evident hash for an immutable movement log entry.
 * Each entry chains to the previous hash to detect back-dating or manipulation.
 */
export function computeLogHash(entry, previousHash = 'GENESIS') {
  const payload = JSON.stringify({
    fileId: String(entry.fileId),
    officerId: String(entry.officerId),
    actionType: entry.actionType,
    currentLocation: entry.currentLocation,
    timestamp: entry.timestamp.toISOString(),
    notes: entry.notes || '',
    previousHash,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function generateFileUid() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TG-${date}-${random}`;
}

export function generateTrackingId() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

export function buildQrPayload(fileUid, wardCode = 'W01') {
  return JSON.stringify({
    v: 1,
    uid: fileUid,
    ward: wardCode,
    ts: Date.now(),
  });
}

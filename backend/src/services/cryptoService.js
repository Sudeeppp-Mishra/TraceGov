import crypto from 'crypto';

/**
 * Computes a deterministic SHA-256 hash of a log entry, chained to the previous hash.
 * This ensures that database modifications are immediately detectable.
 */
export function computeLogHash(entry, previousHash = 'GENESIS') {
  const timestampStr = entry.timestamp instanceof Date 
    ? entry.timestamp.toISOString() 
    : new Date(entry.timestamp).toISOString();

  const payload = JSON.stringify({
    fileId: String(entry.fileId),
    officerId: String(entry.officerId),
    actionType: entry.actionType,
    currentLocation: entry.currentLocation,
    timestamp: timestampStr,
    notes: entry.notes || '',
    previousHash,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Generates a human-friendly unique identifier for a physical file.
 * Format: TG-YYYYMMDD-HEX8 (e.g. TG-20260707-B45A82DF)
 */
export function generateFileUid() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TG-${dateStr}-${randomSuffix}`;
}

/**
 * Generates a high-entropy 10-character tracking ID for citizen lookups.
 */
export function generateTrackingId() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

/**
 * Serializes standard QR code handshake payload.
 */
export function buildQrPayload(fileUid, wardCode = 'W01') {
  return JSON.stringify({
    v: 1, // QR payload protocol version
    uid: fileUid,
    ward: wardCode,
    ts: Date.now(),
  });
}

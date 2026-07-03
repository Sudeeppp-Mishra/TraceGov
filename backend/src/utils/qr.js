import QRCode from 'qrcode';
import { buildQrPayload } from './crypto.js';

export async function generateQrCode(fileUid, wardCode) {
  const payload = buildQrPayload(fileUid, wardCode);
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });

  return { payload, dataUrl };
}

export function parseQrPayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.uid) return parsed.uid;
  } catch {
    // Plain FileUID string from manual entry
  }
  return raw.trim();
}

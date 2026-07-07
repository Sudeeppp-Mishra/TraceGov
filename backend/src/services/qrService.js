import QRCode from 'qrcode';
import { buildQrPayload } from './cryptoService.js';

/**
 * Generates a base64 encoded QR Code data URL containing file handshake data.
 */
export async function generateQrCode(fileUid, wardCode) {
  const payload = buildQrPayload(fileUid, wardCode);
  
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M', // Medium error correction to tolerate physical wear
    margin: 2,
    width: 300,
    color: {
      dark: '#0f172a',  // Off-black for premium look and scanner compatibility
      light: '#ffffff', // Clean white background
    },
  });

  return { payload, dataUrl };
}

/**
 * Parses raw text scanned from QR tags or typed manually.
 * Detects if the payload is serialized JSON and extracts the file UID,
 * falling back to the raw input if it is a plain text UID.
 */
export function parseQrPayload(rawInput) {
  if (!rawInput) return '';
  const trimmed = rawInput.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.uid) {
      return parsed.uid.trim();
    }
  } catch (err) {
    // Input is not JSON, treat it as a raw identifier/UID
  }
  
  return trimmed;
}

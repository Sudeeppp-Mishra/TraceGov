import { SmsLog } from '../models/SmsLog.js';

/**
 * Format SMS message content based on file status transition.
 */
export function formatSmsMessage({ citizenName, title, fileUid, trackingId, status, location, notes }) {
  const trackingUrl = process.env.CORS_ORIGIN
    ? `${process.env.CORS_ORIGIN}/track/${trackingId}`
    : `https://tracegov.gov.np/track/${trackingId}`;

  switch (status) {
    case 'Received':
      return `[TraceGov] Namaste ${citizenName}, your file "${title}" (ID: ${fileUid}) has been registered at ${location}. Status: Received. Track live: ${trackingUrl}`;

    case 'Backtracked':
      return `[TraceGov] ALERT: File "${title}" (ID: ${fileUid}) has been returned for correction at ${location}.${notes ? ` Reason: ${notes}.` : ''} Please check details: ${trackingUrl}`;

    case 'Approved':
      return `[TraceGov] GREAT NEWS: File "${title}" (ID: ${fileUid}) has been APPROVED at ${location}. Track final receipt: ${trackingUrl}`;

    case 'Rejected':
      return `[TraceGov] NOTICE: File "${title}" (ID: ${fileUid}) status: REJECTED at ${location}.${notes ? ` Reason: ${notes}.` : ''} Details: ${trackingUrl}`;

    case 'Dispatched':
      return `[TraceGov] File "${title}" (ID: ${fileUid}) has been DISPATCHED to ${location}. Track file: ${trackingUrl}`;

    case 'Under Review':
    case 'Verified':
    case 'Pending':
    default:
      return `[TraceGov] Update: File "${title}" (ID: ${fileUid}) status changed to "${status}" at ${location}. Track progress: ${trackingUrl}`;
  }
}

/**
 * Format a single-document-verified SMS.
 *
 * Triggered alongside the matching email when an officer clicks "Reviewed"
 * on a `needs_review` row in the Resolve Attachments modal. Kept short
 * (SMS is single-segment-friendly) and uses the same `documentLabel` +
 * tracking-URL recipe as the rest of the SMS service.
 *
 * `isAllClear=true` swaps the line to a positive "all done" variant so the
 * citizen reading the message alone still gets the right tone, with no
 * reference to other pending docs (they're zero, so it would just be noise).
 */
export function formatDocumentVerifiedSms({ citizenName, title, fileUid, trackingId, documentLabel, isAllClear = false }) {
  const trackingUrl = process.env.CORS_ORIGIN
    ? `${process.env.CORS_ORIGIN}/track/${trackingId}`
    : `https://tracegov.gov.np/track/${trackingId}`;
  const safeLabel = documentLabel || 'your document';
  if (isAllClear) {
    return `[TraceGov] Namaste ${citizenName}, your file "${title}" (ID: ${fileUid}) is now fully verified — all required documents are confirmed. Processing will continue. Track: ${trackingUrl}`;
  }
  return `[TraceGov] Namaste ${citizenName}, your "${safeLabel}" for file "${title}" (ID: ${fileUid}) has been verified. No further action needed from you on this document. Track: ${trackingUrl}`;
}

/**
 * Format a "document received and now under review" SMS.
 *
 * Triggered when an officer uploads a missing doc on the citizen's behalf
 * (Resolve modal — Section A "Missing") and the OCR pipeline flags the
 * row as `needs_review` (e.g. blurry scan, missing keywords). Tone is
 * deliberately different from the verified template: the citizen should
 * know the office has received the document but is still reviewing it —
 * NOT that it has been confirmed/verified.
 */
export function formatDocumentReceivedForReviewSms({ citizenName, title, fileUid, trackingId, documentLabel }) {
  const trackingUrl = process.env.CORS_ORIGIN
    ? `${process.env.CORS_ORIGIN}/track/${trackingId}`
    : `https://tracegov.gov.np/track/${trackingId}`;
  const safeLabel = documentLabel || 'your document';
  return `[TraceGov] Namaste ${citizenName}, we have received your "${safeLabel}" for file "${title}" (ID: ${fileUid}) and it is now under verification by the office. We will notify you once the review is complete. Track: ${trackingUrl}`;
}

/**
 * Send SMS notification to citizen when file status changes.
 * Non-blocking service wrapper that persists logs and handles failover gracefully.
 */
export async function sendSmsNotification({ file, status, location, notes }) {
  const enabled = process.env.ENABLE_SMS_NOTIFICATIONS !== 'false';
  if (!enabled) {
    console.log('[SMS SERVICE] SMS Notifications disabled via ENABLE_SMS_NOTIFICATIONS env var.');
    return { success: false, reason: 'disabled' };
  }

  if (!file || !file.citizenPhone) {
    console.warn('[SMS SERVICE] Cannot send SMS: Missing file or citizen phone number.');
    return { success: false, reason: 'missing_phone' };
  }

  const message = formatSmsMessage({
    citizenName: file.citizenName,
    title: file.title,
    fileUid: file.fileUid,
    trackingId: file.trackingId,
    status: status || file.currentStatus,
    location: location || file.currentLocation,
    notes,
  });

  const provider = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  let deliveryStatus = 'simulated';
  let errorMessage = null;

  try {
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      // Production Twilio integration
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const auth = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;
      const to = file.citizenPhone.startsWith('+') ? file.citizenPhone : `+977${file.citizenPhone}`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const bodyParams = new URLSearchParams({
        To: to,
        From: from,
        Body: message,
      });

      const authHeader = 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64');
      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams,
      });

      if (response.ok) {
        deliveryStatus = 'sent';
        console.log(`[SMS SERVICE] Twilio SMS dispatched successfully to ${to}`);
      } else {
        const errorData = await response.json();
        deliveryStatus = 'failed';
        errorMessage = errorData.message || 'Twilio API call failed';
        console.error('[SMS SERVICE] Twilio dispatch error:', errorMessage);
      }
    } else if (provider === 'sparrow' && process.env.SPARROW_SMS_TOKEN) {
      // Nepal Sparrow SMS gateway integration
      const token = process.env.SPARROW_SMS_TOKEN;
      const identity = process.env.SPARROW_SMS_IDENTITY || 'Demo';
      const to = file.citizenPhone.replace(/^\+977/, '');

      const sparrowUrl = `http://api.sparrowsms.com/v2/sms/?${new URLSearchParams({
        token,
        from: identity,
        to,
        text: message,
      })}`;

      const response = await fetch(sparrowUrl);
      const data = await response.json();
      if (response.ok && data.response_code === 200) {
        deliveryStatus = 'sent';
        console.log(`[SMS SERVICE] Sparrow SMS dispatched successfully to ${to}`);
      } else {
        deliveryStatus = 'failed';
        errorMessage = data.response || 'Sparrow SMS API error';
        console.error('[SMS SERVICE] Sparrow SMS dispatch error:', errorMessage);
      }
    } else {
      // Mock / Local Development mode simulation
      deliveryStatus = 'simulated';
      console.log('\n======================================================');
      console.log(`📱 [SMS NOTIFICATION DISPATCHED TO ${file.citizenPhone}]`);
      console.log(`Recipient : ${file.citizenName} (+977-${file.citizenPhone})`);
      console.log(`File UID  : ${file.fileUid} | Tracking ID: ${file.trackingId}`);
      console.log(`Trigger   : Status changed to "${status || file.currentStatus}"`);
      console.log(`Location  : ${location || file.currentLocation}`);
      console.log(`Message   : ${message}`);
      console.log('Mode      : MOCK SIMULATION (Add API credentials to .env to deliver real cellular SMS)');
      console.log('======================================================\n');
    }
  } catch (err) {
    deliveryStatus = 'failed';
    errorMessage = err.message;
    console.error('[SMS SERVICE] Error sending SMS:', err);
  }

  // Record dispatch log asynchronously in database
  let smsLogRecord = null;
  try {
    smsLogRecord = await SmsLog.create({
      fileId: file._id,
      fileUid: file.fileUid,
      trackingId: file.trackingId,
      citizenPhone: file.citizenPhone,
      citizenName: file.citizenName,
      statusTriggered: status || file.currentStatus,
      message,
      deliveryStatus,
      provider,
      errorMessage,
      sentAt: new Date(),
    });
  } catch (logErr) {
    console.error('[SMS SERVICE] Failed to record SmsLog entry:', logErr);
  }

  return {
    success: deliveryStatus !== 'failed',
    deliveryStatus,
    message,
    logId: smsLogRecord?._id,
  };
}

/**
 * Send the single-document-verified citizen SMS.
 *
 * Mirrors `sendSmsNotification`'s gating + provider dispatch + SmsLog
 * persistence, but uses `formatDocumentVerifiedSms` for the message body
 * so the SMS tone matches the new email. Tagged as `Document Verified`
 * in SmsLog so the audit trail can distinguish single-doc verification
 * SMS from generic status-update SMS.
 */
export async function sendDocumentVerifiedSms({ file, documentLabel, isAllClear = false }) {
  const enabled = process.env.ENABLE_SMS_NOTIFICATIONS !== 'false';
  if (!enabled) {
    return { success: false, reason: 'disabled' };
  }
  if (!file || !file.citizenPhone) {
    return { success: false, reason: 'missing_phone' };
  }

  const message = formatDocumentVerifiedSms({
    citizenName: file.citizenName,
    title: file.title,
    fileUid: file.fileUid,
    trackingId: file.trackingId,
    documentLabel,
    isAllClear,
  });

  const provider = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  let deliveryStatus = 'simulated';
  let errorMessage = null;

  try {
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const auth = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;
      const to = file.citizenPhone.startsWith('+') ? file.citizenPhone : `+977${file.citizenPhone}`;

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }),
      });

      if (response.ok) {
        deliveryStatus = 'sent';
        console.log(`[SMS SERVICE] Twilio document-verified SMS dispatched to ${to}`);
      } else {
        const errBody = await response.json().catch(() => ({}));
        deliveryStatus = 'failed';
        errorMessage = errBody.message || 'Twilio API call failed';
      }
    } else if (provider === 'sparrow' && process.env.SPARROW_SMS_TOKEN) {
      const token = process.env.SPARROW_SMS_TOKEN;
      const identity = process.env.SPARROW_SMS_IDENTITY || 'Demo';
      const to = file.citizenPhone.replace(/^\+977/, '');

      const response = await fetch(`http://api.sparrowsms.com/v2/sms/?${new URLSearchParams({
        token, from: identity, to, text: message,
      })}`);
      const data = await response.json();
      if (response.ok && data.response_code === 200) {
        deliveryStatus = 'sent';
        console.log(`[SMS SERVICE] Sparrow document-verified SMS dispatched to ${to}`);
      } else {
        deliveryStatus = 'failed';
        errorMessage = data.response || 'Sparrow SMS API error';
      }
    } else {
      deliveryStatus = 'simulated';
      console.log('\n======================================================');
      console.log(`📱 [DOCUMENT-VERIFIED SMS DISPATCHED TO ${file.citizenPhone}]`);
      console.log(`Recipient : ${file.citizenName} (+977-${file.citizenPhone})`);
      console.log(`File UID  : ${file.fileUid} | Tracking ID: ${file.trackingId}`);
      console.log(`Variant   : ${isAllClear ? 'all-clear' : 'partial'}`);
      console.log(`Message   : ${message}`);
      console.log('======================================================\n');
    }
  } catch (err) {
    deliveryStatus = 'failed';
    errorMessage = err.message;
    console.error('[SMS SERVICE] Error sending document-verified SMS:', err);
  }

  let smsLogRecord = null;
  try {
    smsLogRecord = await SmsLog.create({
      fileId: file._id,
      fileUid: file.fileUid,
      trackingId: file.trackingId,
      citizenPhone: file.citizenPhone,
      citizenName: file.citizenName,
      statusTriggered: 'Document Verified',
      message,
      deliveryStatus,
      provider,
      errorMessage,
      sentAt: new Date(),
    });
  } catch (logErr) {
    console.error('[SMS SERVICE] Failed to record SmsLog entry:', logErr);
  }

  return {
    success: deliveryStatus !== 'failed',
    deliveryStatus,
    message,
    logId: smsLogRecord?._id,
  };
}

/**
 * Send the "document received and now under review" citizen SMS.
 *
 * Mirrors `sendDocumentVerifiedSms`'s gating + provider dispatch +
 * SmsLog persistence, but uses `formatDocumentReceivedForReviewSms` for
 * the message body. Tagged as `Document Received for Review` in SmsLog
 * so the audit trail distinguishes the in-flight review SMS from the
 * verified SMS. Falsy `citizenPhone` makes this a no-op (same gating as
 * `sendSmsNotification`).
 */
export async function sendDocumentReceivedForReviewSms({ file, documentLabel }) {
  const enabled = process.env.ENABLE_SMS_NOTIFICATIONS !== 'false';
  if (!enabled) {
    return { success: false, reason: 'disabled' };
  }
  if (!file || !file.citizenPhone) {
    return { success: false, reason: 'missing_phone' };
  }

  const message = formatDocumentReceivedForReviewSms({
    citizenName: file.citizenName,
    title: file.title,
    fileUid: file.fileUid,
    trackingId: file.trackingId,
    documentLabel,
  });

  const provider = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  let deliveryStatus = 'simulated';
  let errorMessage = null;

  try {
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const auth = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;
      const to = file.citizenPhone.startsWith('+') ? file.citizenPhone : `+977${file.citizenPhone}`;

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }),
      });

      if (response.ok) {
        deliveryStatus = 'sent';
        console.log(`[SMS SERVICE] Twilio received-for-review SMS dispatched to ${to}`);
      } else {
        const errBody = await response.json().catch(() => ({}));
        deliveryStatus = 'failed';
        errorMessage = errBody.message || 'Twilio API call failed';
      }
    } else if (provider === 'sparrow' && process.env.SPARROW_SMS_TOKEN) {
      const token = process.env.SPARROW_SMS_TOKEN;
      const identity = process.env.SPARROW_SMS_IDENTITY || 'Demo';
      const to = file.citizenPhone.replace(/^\+977/, '');

      const response = await fetch(`http://api.sparrowsms.com/v2/sms/?${new URLSearchParams({
        token, from: identity, to, text: message,
      })}`);
      const data = await response.json();
      if (response.ok && data.response_code === 200) {
        deliveryStatus = 'sent';
        console.log(`[SMS SERVICE] Sparrow received-for-review SMS dispatched to ${to}`);
      } else {
        deliveryStatus = 'failed';
        errorMessage = data.response || 'Sparrow SMS API error';
      }
    } else {
      deliveryStatus = 'simulated';
      console.log('\n======================================================');
      console.log(`📱 [DOCUMENT-RECEIVED-FOR-REVIEW SMS DISPATCHED TO ${file.citizenPhone}]`);
      console.log(`Recipient : ${file.citizenName} (+977-${file.citizenPhone})`);
      console.log(`File UID  : ${file.fileUid} | Tracking ID: ${file.trackingId}`);
      console.log(`Document  : ${documentLabel}`);
      console.log(`Message   : ${message}`);
      console.log('======================================================\n');
    }
  } catch (err) {
    deliveryStatus = 'failed';
    errorMessage = err.message;
    console.error('[SMS SERVICE] Error sending received-for-review SMS:', err);
  }

  let smsLogRecord = null;
  try {
    smsLogRecord = await SmsLog.create({
      fileId: file._id,
      fileUid: file.fileUid,
      trackingId: file.trackingId,
      citizenPhone: file.citizenPhone,
      citizenName: file.citizenName,
      statusTriggered: 'Document Received for Review',
      message,
      deliveryStatus,
      provider,
      errorMessage,
      sentAt: new Date(),
    });
  } catch (logErr) {
    console.error('[SMS SERVICE] Failed to record SmsLog entry:', logErr);
  }

  return {
    success: deliveryStatus !== 'failed',
    deliveryStatus,
    message,
    logId: smsLogRecord?._id,
  };
}

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
      // Production Twilio integration fallback
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

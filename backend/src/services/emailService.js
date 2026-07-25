/**
 * Format HTML & Plaintext Email Templates for TraceGov File Status Updates.
 */
export function formatEmailTemplate({ citizenName, title, fileUid, trackingId, status, location, notes }) {
  const trackingUrl = process.env.CORS_ORIGIN
    ? `${process.env.CORS_ORIGIN}/track/${trackingId}`
    : `https://tracegov.gov.np/track/${trackingId}`;

  let badgeColor = '#3b82f6'; // blue default
  let headerTitle = `Status Update: ${status}`;
  let statusBanner = `File status has been updated to <strong>${status}</strong> at <strong>${location}</strong>.`;

  if (status === 'Received') {
    badgeColor = '#10b981'; // green
    headerTitle = 'File Registered Successfully';
    statusBanner = `Your physical file has been registered at desk: <strong>${location}</strong>.`;
  } else if (status === 'Approved') {
    badgeColor = '#059669'; // dark green
    headerTitle = '🎉 File Approved!';
    statusBanner = `Great news! Your file has been <strong>APPROVED</strong> at <strong>${location}</strong>.`;
  } else if (status === 'Backtracked') {
    badgeColor = '#ef4444'; // red
    headerTitle = '⚠️ Action Required: File Returned';
    statusBanner = `Your file has been returned for correction at desk <strong>${location}</strong>.${notes ? `<br><br><strong>Reason:</strong> ${notes}` : ''}`;
  } else if (status === 'Rejected') {
    badgeColor = '#dc2626'; // dark red
    headerTitle = 'Notice: File Rejected';
    statusBanner = `Your file was rejected at <strong>${location}</strong>.${notes ? `<br><br><strong>Reason:</strong> ${notes}` : ''}`;
  } else if (status === 'Dispatched') {
    badgeColor = '#6366f1'; // indigo
    headerTitle = 'File Dispatched';
    statusBanner = `Your file has been completed and dispatched to <strong>${location}</strong>.`;
  }

  const subject = `[TraceGov] ${headerTitle} - "${title}" (${fileUid})`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; }
    .header { background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 1px solid #334155; }
    .brand { font-size: 20px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px; }
    .content { padding: 32px 24px; }
    .badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; background-color: ${badgeColor}; color: #ffffff; font-weight: 700; font-size: 14px; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: 700; color: #f8fafc; margin-top: 0; margin-bottom: 12px; }
    .banner { background-color: #0f172a; border-left: 4px solid ${badgeColor}; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 15px; line-height: 1.6; color: #e2e8f0; }
    .details-box { background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; border-bottom: 1px solid #1e293b; padding: 10px 0; font-size: 14px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #94a3b8; font-weight: 600; }
    .detail-val { color: #f8fafc; font-weight: 700; font-mono: monospace; }
    .btn { display: block; text-align: center; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 700; font-size: 15px; margin-top: 28px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748b; border-top: 1px solid #334155; background-color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">TraceGov Municipal Tracking</div>
    </div>
    <div class="content">
      <div class="badge">${status}</div>
      <h1 class="title">${headerTitle}</h1>
      <p style="color: #94a3b8; font-size: 15px; margin-bottom: 20px;">Namaste ${citizenName}, here is the latest update regarding your physical file.</p>
      
      <div class="banner">
        ${statusBanner}
      </div>

      <div class="details-box">
        <div class="detail-row"><span class="detail-label">File Title</span><span class="detail-val">${title}</span></div>
        <div class="detail-row"><span class="detail-label">File UID</span><span class="detail-val">${fileUid}</span></div>
        <div class="detail-row"><span class="detail-label">Tracking ID</span><span class="detail-val">${trackingId}</span></div>
        <div class="detail-row"><span class="detail-label">Current Desk</span><span class="detail-val">${location}</span></div>
      </div>

      <a href="${trackingUrl}" class="btn">Track File Live on TraceGov Portal →</a>
    </div>
    <div class="footer">
      Automated update from Municipal Public Governance System · TraceGov<br>
      You are receiving this because your email was registered for file tracking.
    </div>
  </div>
</body>
</html>
  `;

  const textContent = `[TraceGov Alert] Namaste ${citizenName}, status for "${title}" (${fileUid}) updated to ${status} at ${location}. Track live: ${trackingUrl}`;

  return { subject, htmlContent, textContent };
}

/**
 * Send real email notification to citizen.
 * Supports SMTP (Gmail / Custom), Resend API, or Ethereal/Console fallback.
 */
export async function sendEmailNotification({ file, status, location, notes }) {
  const enabled = process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false';
  if (!enabled) {
    return { success: false, reason: 'disabled' };
  }

  if (!file || !file.citizenEmail) {
    return { success: false, reason: 'missing_email' };
  }

  const { subject, htmlContent, textContent } = formatEmailTemplate({
    citizenName: file.citizenName,
    title: file.title,
    fileUid: file.fileUid,
    trackingId: file.trackingId,
    status: status || file.currentStatus,
    location: location || file.currentLocation,
    notes,
  });

  const recipient = file.citizenEmail;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || `"TraceGov Alert" <${smtpUser || 'noreply@tracegov.gov.np'}>`;

  let deliveryStatus = 'simulated';
  let messageId = null;

  try {
    // 1. If SMTP credentials exist (e.g. Gmail App Password or custom SMTP server)
    if (smtpHost && smtpUser && smtpPass) {
      let nodemailer;
      try {
        nodemailer = await import('nodemailer');
      } catch (importErr) {
        console.warn('[EMAIL SERVICE] nodemailer package not installed, attempting fetch relay');
      }

      if (nodemailer) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const info = await transporter.sendMail({
          from: smtpFrom,
          to: recipient,
          subject,
          text: textContent,
          html: htmlContent,
        });

        deliveryStatus = 'sent';
        messageId = info.messageId;
        console.log(`[EMAIL SERVICE] Email dispatched via SMTP to ${recipient}. MessageID: ${info.messageId}`);
      }
    } 
    // 2. Resend API support if RESEND_API_KEY is configured
    else if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'TraceGov Alert <onboarding@resend.dev>',
          to: [recipient],
          subject,
          html: htmlContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        deliveryStatus = 'sent';
        messageId = data.id;
        console.log(`[EMAIL SERVICE] Email dispatched via Resend to ${recipient}. ID: ${data.id}`);
      } else {
        const errData = await response.json();
        console.error('[EMAIL SERVICE] Resend API error:', errData);
      }
    }
    // 3. Fallback: Log email details nicely for development mode
    else {
      deliveryStatus = 'simulated';
      console.log('\n======================================================');
      console.log(`📧 [EMAIL NOTIFICATION DISPATCHED TO ${recipient}]`);
      console.log(`Recipient : ${file.citizenName} <${recipient}>`);
      console.log(`Subject   : ${subject}`);
      console.log(`Status    : ${status || file.currentStatus} @ ${location || file.currentLocation}`);
      console.log('Notice    : Configure SMTP_HOST, SMTP_USER, SMTP_PASS in .env to deliver real emails to inbox.');
      console.log('======================================================\n');
    }
  } catch (err) {
    deliveryStatus = 'failed';
    console.error('[EMAIL SERVICE] Error dispatching email:', err);
  }

  return {
    success: deliveryStatus !== 'failed',
    deliveryStatus,
    recipientEmail: recipient,
    messageId,
  };
}

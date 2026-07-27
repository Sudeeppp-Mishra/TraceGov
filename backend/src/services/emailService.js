/**
 * Format HTML & Plaintext Email Templates for TraceGov File Status Updates.
 */
export function formatEmailTemplate({ citizenName, title, fileUid, trackingId, status, location, notes }) {
  const origin = process.env.APP_URL || (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',')[0].trim() : 'http://localhost:5173');
  const trackingUrl = `${origin.replace(/\/$/, '')}/track/${trackingId}`;

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
 * Build an ordered list of email providers from environment variables.
 * Brevo HTTP API is prioritized first (works on Render — port 443).
 * Gmail SMTP second (works on localhost and hosts that allow SMTP ports).
 * Only providers with required credentials are included.
 */
function buildProviderChain() {
  const providers = [];

  // Provider 1: Brevo HTTP API (Primary — uses HTTPS port 443, works on Render!)
  if (process.env.BREVO_API_KEY) {
    providers.push({
      name: 'Brevo HTTP API',
      type: 'http',
      apiKey: process.env.BREVO_API_KEY,
      senderName: process.env.BREVO_SENDER_NAME || 'TraceGov Alert',
      senderEmail: process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || 'noreply@tracegov.gov.np',
    });
  }

  // Provider 2: Gmail SMTP (Fallback — works on localhost and cloud hosts that allow SMTP)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT) || 587;
    providers.push({
      name: `Gmail SMTP (${process.env.SMTP_HOST}:${port})`,
      type: 'smtp',
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      from: process.env.SMTP_FROM || `"TraceGov Alert" <${process.env.SMTP_USER}>`,
    });
  }

  return providers;
}

/**
 * Send email via Brevo HTTP API (POST https://api.brevo.com/v3/smtp/email).
 * Uses HTTPS port 443 — never blocked by cloud hosts like Render.
 */
async function attemptBrevoHttpSend(provider, { recipient, subject, htmlContent }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': provider.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: provider.senderName, email: provider.senderEmail },
      to: [{ email: recipient }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Brevo API ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return { success: true, messageId: data.messageId || data.messageIds?.[0] || 'brevo-ok' };
}

/**
 * Send email via SMTP (nodemailer). Works on localhost and SMTP-friendly hosts.
 */
async function attemptSmtpSend(provider, { recipient, subject, textContent, htmlContent, replyTo }) {
  const nodemailer = await import('nodemailer');

  const transporter = nodemailer.createTransport({
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    family: 4, // Force IPv4 (avoids cloud IPv6 ENETUNREACH errors)
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
    auth: provider.auth,
    tls: {
      rejectUnauthorized: false,
      servername: provider.host,
    },
  });

  const info = await transporter.sendMail({
    from: provider.from,
    to: recipient,
    replyTo: replyTo || provider.auth.user,
    subject,
    text: textContent,
    html: htmlContent,
    headers: {
      'X-Application': 'TraceGov Municipal Portal',
    },
  });

  return { success: true, messageId: info.messageId };
}

/**
 * Send email notification to citizen.
 * Multi-provider with automatic fallback:
 *   1. Brevo SMTP (primary, production-optimized)
 *   2. Gmail SMTP (fallback, works everywhere)
 *   3. Console log (development simulation)
 *
 * The provider chain is built dynamically from available .env variables,
 * so no code changes are needed when switching environments.
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
  const providers = buildProviderChain();

  let deliveryStatus = 'simulated';
  let messageId = null;
  let usedProvider = null;

  // Try each provider in order; stop at the first success
  for (const provider of providers) {
    try {
      console.log(`[EMAIL SERVICE] Attempting delivery via ${provider.name} to ${recipient}...`);

      let result;
      if (provider.type === 'http') {
        result = await attemptBrevoHttpSend(provider, { recipient, subject, htmlContent });
      } else {
        result = await attemptSmtpSend(provider, {
          recipient,
          subject,
          textContent,
          htmlContent,
          replyTo: process.env.SMTP_USER,
        });
      }

      deliveryStatus = 'sent';
      messageId = result.messageId;
      usedProvider = provider.name;
      console.log(`[EMAIL SERVICE] ✅ Email dispatched via ${provider.name} to ${recipient}. MessageID: ${result.messageId}`);
      break; // Success — stop trying other providers

    } catch (err) {
      const reason = err.code || err.message || 'unknown';
      console.warn(`[EMAIL SERVICE] ⚠️ ${provider.name} failed (${reason}). ${providers.indexOf(provider) < providers.length - 1 ? 'Trying next provider...' : 'No more providers to try.'}`);
    }
  }

  // Fallback: No providers available or all failed — log to console for development
  if (deliveryStatus !== 'sent') {
    if (providers.length === 0) {
      deliveryStatus = 'simulated';
      console.log('\n======================================================');
      console.log(`📧 [EMAIL NOTIFICATION SIMULATED TO ${recipient}]`);
      console.log(`Recipient : ${file.citizenName} <${recipient}>`);
      console.log(`Subject   : ${subject}`);
      console.log(`Status    : ${status || file.currentStatus} @ ${location || file.currentLocation}`);
      console.log('Notice    : Configure BREVO_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS in .env to deliver real emails.');
      console.log('======================================================\n');
    } else {
      deliveryStatus = 'failed';
      console.error(`[EMAIL SERVICE] ❌ All ${providers.length} provider(s) failed for ${recipient}. Email was not delivered.`);
    }
  }

  return {
    success: deliveryStatus === 'sent',
    deliveryStatus,
    recipientEmail: recipient,
    messageId,
    provider: usedProvider,
  };
}

import mongoose from 'mongoose';

/**
 * Format HTML & Plaintext Email Templates for TraceGov File Status Updates.
 */
export function formatEmailTemplate({ citizenName, title, fileUid, trackingId, status, location, notes }) {
  const origin = process.env.APP_URL || (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',')[0].trim() : 'http://localhost:5173');
  const trackingUrl = `${origin.replace(/\/$/, '')}/track/${trackingId}`;

  // Status palette matches the app's own design tokens - amber for routine
  // friction (Backtracked), not red. Red is reserved for a genuine negative
  // outcome (Rejected) only.
  const STATUS_STYLES = {
    Received: {
      accent: '#0F9D74',
      bg: '#E7F5F0',
      headerTitle: 'File registered',
      banner: (loc) => `Your file has been registered at <strong>${loc}</strong>. We'll notify you as it moves.`,
    },
    Approved: {
      accent: '#1F7A5C',
      bg: '#E5F2ED',
      headerTitle: 'File approved',
      banner: (loc) => `Your file has been approved at <strong>${loc}</strong>.`,
    },
    Dispatched: {
      accent: '#1F7A5C',
      bg: '#E5F2ED',
      headerTitle: 'File dispatched',
      banner: (loc) => `Your file has been completed and dispatched to <strong>${loc}</strong>.`,
    },
    Backtracked: {
      accent: '#B8790A',
      bg: '#FBF1E1',
      headerTitle: 'One thing needs your attention',
      banner: (loc) => `Your file was sent back for a correction at <strong>${loc}</strong>.`,
    },
    Rejected: {
      accent: '#C1442E',
      bg: '#FBEAE6',
      headerTitle: 'File rejected',
      banner: (loc) => `Your file was rejected at <strong>${loc}</strong>.`,
    },
  };

  const style = STATUS_STYLES[status] || {
    accent: '#2F6FED',
    bg: '#EAF1FE',
    headerTitle: `Status update: ${status}`,
    banner: (loc) => `Your file's status has been updated to <strong>${status}</strong> at <strong>${loc}</strong>.`,
  };

  const bannerText = style.banner(location) + (notes ? `<br><br><strong>Note:</strong> ${notes}` : '');
  const preheaderText = `${style.headerTitle} — ${title} is now at ${location}.`;

  const subject = `TraceGov: ${style.headerTitle} · ${fileUid}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#FAFAF9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${preheaderText}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background-color:#FFFFFF; border:1px solid #E7E8EA; border-radius:12px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #E7E8EA;">
              <span style="font-size:16px; font-weight:600; color:#14171A; letter-spacing:-0.2px;">TraceGov</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <span style="display:inline-block; padding:4px 12px; border-radius:999px; background-color:${style.bg}; color:${style.accent}; font-weight:600; font-size:13px; margin-bottom:16px;">
                ${status}
              </span>

              <h1 style="font-size:20px; font-weight:600; color:#14171A; margin:12px 0 8px;">${style.headerTitle}</h1>
              <p style="font-size:14px; color:#5B6168; margin:0 0 20px; line-height:1.5;">Namaste ${citizenName}, here's the latest on your file.</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF9; border:1px solid #E7E8EA; border-left:3px solid ${style.accent}; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px; font-size:14px; color:#14171A; line-height:1.6;">
                    ${bannerText}
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7E8EA; border-radius:8px; margin-bottom:28px;">
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #E7E8EA; font-size:13px; color:#9299A1;">File</td>
                  <td style="padding:12px 16px; border-bottom:1px solid #E7E8EA; font-size:13px; color:#14171A; text-align:right;">${title}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #E7E8EA; font-size:13px; color:#9299A1;">File UID</td>
                  <td style="padding:12px 16px; border-bottom:1px solid #E7E8EA; font-size:13px; color:#14171A; text-align:right; font-family:'SFMono-Regular', Consolas, Menlo, monospace;">${fileUid}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #E7E8EA; font-size:13px; color:#9299A1;">Tracking ID</td>
                  <td style="padding:12px 16px; border-bottom:1px solid #E7E8EA; font-size:13px; color:#14171A; text-align:right; font-family:'SFMono-Regular', Consolas, Menlo, monospace;">${trackingId}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; font-size:13px; color:#9299A1;">Current desk</td>
                  <td style="padding:12px 16px; font-size:13px; color:#14171A; text-align:right;">${location}</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="border-radius:8px; background-color:#2F6FED;">
                    <a href="${trackingUrl}" style="display:block; padding:13px 24px; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none;">
                      Track this file
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #E7E8EA; background-color:#FAFAF9;">
              <p style="font-size:12px; color:#9299A1; margin:0; line-height:1.5;">
                Automated update from TraceGov, a citizen file-tracking service.<br>
                Sent because this email is registered for updates on this file.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `TraceGov — ${style.headerTitle}\n\n${title} (${fileUid})\nTracking ID: ${trackingId}\nStatus: ${status} at ${location}${notes ? `\nNote: ${notes}` : ''}\n\nTrack this file: ${trackingUrl}`;

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
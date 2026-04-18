// Pluggable email sender. In production with RESEND_API_KEY set we call
// Resend's REST API. Without a key (e.g. preview deploys or first-run
// local testing) we log the magic link and also return it from the
// request endpoint so you can click it manually.

import type { Env } from './env';

export interface MagicLinkEmail {
  to: string;
  link: string;
  deviceLabel: string | null;
}

export interface EmailResult {
  // When true, the server should include the raw magic link in the
  // response body so the user can click it without an inbox. Only true
  // when the dev stub ran.
  includeLinkInResponse: boolean;
}

export async function sendMagicLinkEmail(env: Env, msg: MagicLinkEmail): Promise<EmailResult> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    // Dev stub: log it, and tell the caller to expose the link in the response.
    console.log(`[dev magic-link] ${msg.to} → ${msg.link}`);
    return { includeLinkInResponse: true };
  }

  const deviceLine = msg.deviceLabel
    ? `This sign-in was requested from ${msg.deviceLabel}.`
    : '';

  const subject = 'Your Brainwave sign-in link';
  const html = `
<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;color:#111;background:#fafafa;padding:24px">
    <h1 style="color:#6366f1">Sign in to Brainwave</h1>
    <p>Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(msg.link)}"
         style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Sign in
      </a>
    </p>
    ${deviceLine ? `<p style="color:#6b7280;font-size:14px">${escapeHtml(deviceLine)}</p>` : ''}
    <p style="color:#6b7280;font-size:14px">
      If this wasn't you, just ignore this email. Signing in on a new device
      will sign you out on any previous device.
    </p>
  </body>
</html>`;

  const text = `Sign in to Brainwave: ${msg.link}
This link expires in 15 minutes and can only be used once.${deviceLine ? `\n\n${deviceLine}` : ''}

If this wasn't you, just ignore this email. Signing in on a new device will sign you out on any previous device.`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: msg.to,
      subject,
      html,
      text
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[resend] send failed: ${res.status} ${detail}`);
    throw new Error('Failed to send magic-link email');
  }

  return { includeLinkInResponse: false };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

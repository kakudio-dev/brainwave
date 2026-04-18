// POST /api/auth/request
// Body: { email: string }
// Always returns 200 with a small JSON ack. We don't tell the caller
// whether the email exists or is valid — the actual email (if sent)
// is the sole channel by which a real user learns they're in.

import type { Env } from '../../_shared/env';
import {
  normalizeEmail,
  upsertAccount,
  createMagicLink,
  deriveDeviceLabel
} from '../../_shared/auth';
import { sendMagicLinkEmail } from '../../_shared/email';

interface RequestBody {
  email?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const email = normalizeEmail(body.email ?? '');
  if (!email) {
    // Normalize to the same generic ack so we don't leak whether the
    // email parsed — but 400 is honest about "you sent junk."
    return json({ ok: false, error: 'Invalid email' }, 400);
  }

  const deviceLabel = deriveDeviceLabel(request.headers.get('User-Agent'));

  // Create or look up the account (phase-2 open signup: any valid email is welcome).
  const account = await upsertAccount(env, email);

  // Mint a magic link.
  const token = await createMagicLink(env, account.email, deviceLabel);
  const baseUrl = env.APP_URL ?? new URL(request.url).origin;
  const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  // Send the email (or log it, in the dev stub path).
  let devLink: string | null = null;
  try {
    const res = await sendMagicLinkEmail(env, { to: email, link, deviceLabel });
    if (res.includeLinkInResponse) devLink = link;
  } catch (e) {
    console.error('sendMagicLinkEmail failed', e);
    return json({ ok: false, error: 'Failed to send email. Try again.' }, 500);
  }

  return json({ ok: true, devLink });
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

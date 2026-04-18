// GET /api/auth/verify?token=...
// Consumes the magic-link token, rotates the account's single session
// to a new random value, sets the session cookie, and redirects to /.

import type { Env } from '../../_shared/env';
import {
  consumeMagicLink,
  upsertAccount,
  rotateSession,
  deriveDeviceLabel
} from '../../_shared/auth';
import { buildSessionCookie } from '../../_shared/cookies';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return redirectTo('/login?error=missing_token');
  }

  const payload = await consumeMagicLink(env, token);
  if (!payload) {
    // Expired, already used, or made up. All look the same to the user.
    return redirectTo('/login?error=invalid_link');
  }

  const account = await upsertAccount(env, payload.email);

  // Prefer the device label captured when the link was requested; fall
  // back to the user agent of the verify call (e.g. if they click the
  // link from a different device than they requested it on).
  const deviceLabel =
    payload.device_label ?? deriveDeviceLabel(request.headers.get('User-Agent'));

  const sessionToken = await rotateSession(env, account.id, deviceLabel);

  // Redirect home with the cookie set. Using 302 so the browser follows.
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': buildSessionCookie(sessionToken)
    }
  });
};

function redirectTo(path: string): Response {
  return new Response(null, { status: 302, headers: { Location: path } });
}

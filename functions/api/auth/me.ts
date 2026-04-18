// GET /api/auth/me
// Returns { email } for the authenticated account, or 401.

import type { Env } from '../../_shared/env';
import { resolveSession } from '../../_shared/auth';
import { readSessionCookie, buildClearSessionCookie } from '../../_shared/cookies';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = readSessionCookie(request);
  const account = await resolveSession(env, token);
  if (!account) {
    // Clear any stale cookie the client may still be sending.
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildClearSessionCookie()
      }
    });
  }

  return new Response(
    JSON.stringify({ authenticated: true, email: account.email }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

// POST /api/auth/logout
// Invalidates the current device's session and clears the cookie.

import type { Env } from '../../_shared/env';
import { clearSession } from '../../_shared/auth';
import { buildClearSessionCookie, readSessionCookie } from '../../_shared/cookies';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = readSessionCookie(request);
  await clearSession(env, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearSessionCookie()
    }
  });
};

// Session cookie utilities. The cookie is opaque to the browser — just a
// random token the server maps to a session row. HttpOnly so JS can't
// read it; Secure + SameSite=Lax so it rides same-origin nav and standard
// cross-site GETs (needed for the /api/auth/verify redirect).

const COOKIE_NAME = 'brainwave_session';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function buildSessionCookie(token: string): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${ONE_YEAR_SECONDS}`
  ];
  return parts.join('; ');
}

export function buildClearSessionCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0'
  ].join('; ');
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get('Cookie');
  if (!header) return null;
  const cookies = header.split(';').map(s => s.trim());
  for (const c of cookies) {
    if (c.startsWith(`${COOKIE_NAME}=`)) {
      return c.slice(COOKIE_NAME.length + 1) || null;
    }
  }
  return null;
}

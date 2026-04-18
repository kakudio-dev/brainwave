// Authentication helpers shared across API endpoints: account lookup,
// session rotation, device-label derivation.

import type { Env } from './env';
import { randomHex, uuid } from './random';

export interface Account {
  id: string;
  email: string;
  created_at: number;
}

export interface Session {
  account_id: string;
  token: string;
  device_label: string | null;
  created_at: number;
  last_seen_at: number;
}

/**
 * Rough User-Agent → friendly label. Best-effort; purely cosmetic.
 */
export function deriveDeviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();

  let browser: string | null = null;
  if (ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
  else if (ua.includes('chrome/')) browser = 'Chrome';
  else if (ua.includes('safari/')) browser = 'Safari';

  let device: string | null = null;
  if (ua.includes('iphone')) device = 'iPhone';
  else if (ua.includes('ipad')) device = 'iPad';
  else if (ua.includes('android')) device = 'Android';
  else if (ua.includes('mac os x') || ua.includes('macintosh')) device = 'Mac';
  else if (ua.includes('windows')) device = 'Windows';
  else if (ua.includes('linux')) device = 'Linux';

  if (device && browser) return `${device} (${browser})`;
  if (device) return device;
  if (browser) return browser;
  return null;
}

/**
 * Normalize and lightly validate an email. Returns null for anything
 * that doesn't look like an email. Not a security boundary — we
 * follow up by sending an actual email, which is the real test.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Finds or creates an account for this email. Either way returns the row.
 */
export async function upsertAccount(env: Env, email: string): Promise<Account> {
  const existing = await env.DB
    .prepare('SELECT id, email, created_at FROM accounts WHERE email = ?')
    .bind(email)
    .first<Account>();
  if (existing) return existing;

  const id = uuid();
  const now = Date.now();
  await env.DB
    .prepare('INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)')
    .bind(id, email, now)
    .run();
  return { id, email, created_at: now };
}

/**
 * Replace the account's session with a fresh token. Enforces the
 * single-active-device policy: any previous session for this account
 * is overwritten, invalidating the old device's token.
 */
export async function rotateSession(
  env: Env,
  accountId: string,
  deviceLabel: string | null
): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();

  // INSERT OR REPLACE because account_id is the primary key — it
  // atomically replaces any prior session for this account.
  await env.DB
    .prepare(
      'INSERT OR REPLACE INTO sessions (account_id, token, device_label, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(accountId, token, deviceLabel, now, now)
    .run();

  return token;
}

/**
 * Look up the account authenticated by this session token. Returns
 * null if the token doesn't match a current session (e.g. the user
 * logged in on another device and this one got bumped).
 */
export async function resolveSession(env: Env, token: string | null): Promise<Account | null> {
  if (!token) return null;
  const row = await env.DB
    .prepare(
      `SELECT a.id AS id, a.email AS email, a.created_at AS created_at
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.token = ?`
    )
    .bind(token)
    .first<Account>();
  if (!row) return null;

  // Fire-and-forget last_seen update. Don't block the response on it.
  env.DB
    .prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?')
    .bind(Date.now(), token)
    .run()
    .catch(() => {});

  return row;
}

export async function clearSession(env: Env, token: string | null): Promise<void> {
  if (!token) return;
  await env.DB
    .prepare('DELETE FROM sessions WHERE token = ?')
    .bind(token)
    .run();
}

/**
 * Creates a single-use magic-link token that expires in 15 minutes.
 */
export async function createMagicLink(
  env: Env,
  email: string,
  deviceLabel: string | null
): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;

  await env.DB
    .prepare(
      'INSERT INTO magic_links (token, email, device_label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(token, email, deviceLabel, now, expiresAt)
    .run();

  return token;
}

export interface ConsumedMagicLink {
  email: string;
  device_label: string | null;
}

/**
 * Atomically consumes a magic link: marks it consumed, returns the
 * payload only if it hadn't already been consumed and hasn't expired.
 */
export async function consumeMagicLink(
  env: Env,
  token: string
): Promise<ConsumedMagicLink | null> {
  const now = Date.now();
  // D1 doesn't expose RETURNING in all runtimes but we can do a
  // SELECT-then-UPDATE in a two-step that's safe enough: a single
  // token is only ever consumed by one request, and the UPDATE's
  // condition on consumed_at IS NULL makes the mark itself atomic.
  const row = await env.DB
    .prepare(
      'SELECT token, email, device_label, expires_at, consumed_at FROM magic_links WHERE token = ?'
    )
    .bind(token)
    .first<{
      token: string;
      email: string;
      device_label: string | null;
      expires_at: number;
      consumed_at: number | null;
    }>();
  if (!row) return null;
  if (row.consumed_at !== null) return null;
  if (row.expires_at < now) return null;

  const res = await env.DB
    .prepare('UPDATE magic_links SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL')
    .bind(now, token)
    .run();
  // D1 returns `meta.changes` for row count. If zero, another request
  // beat us to it.
  const changes = (res.meta as { changes?: number } | undefined)?.changes ?? 0;
  if (changes === 0) return null;

  return { email: row.email, device_label: row.device_label };
}

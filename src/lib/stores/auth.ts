import { writable, derived, get } from 'svelte/store';

// Reflects the server's view of whether this browser is signed in.
// null = we haven't checked yet; false = confirmed signed out;
// an object = signed in.
export interface AuthUser {
  email: string;
}

export const authUser = writable<AuthUser | null | undefined>(undefined);

export const isAuthenticated = derived(authUser, ($u) => !!($u && typeof $u === 'object'));

let inFlight: Promise<void> | null = null;

/**
 * Load the current auth state from the server. Idempotent and safe to
 * call from multiple places; duplicate calls coalesce to one fetch.
 */
export function refreshAuth(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.status === 401) {
        authUser.set(null);
        return;
      }
      if (!res.ok) {
        // Treat transient errors as "unknown" — don't clobber a previously-known state.
        return;
      }
      const body = (await res.json()) as { authenticated?: boolean; email?: string };
      authUser.set(body.authenticated && body.email ? { email: body.email } : null);
    } catch {
      // Network error — leave current state alone.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    authUser.set(null);
  }
}

/**
 * Request a magic link email for the given address. Returns a helper
 * object rather than throwing: the UI shows the same confirmation
 * regardless of validity.
 */
export async function requestMagicLink(email: string): Promise<{
  ok: boolean;
  error?: string;
  devLink?: string | null;
}> {
  try {
    const res = await fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'same-origin'
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      devLink?: string | null;
    };
    if (!res.ok) return { ok: false, error: body.error ?? 'Something went wrong' };
    return { ok: true, devLink: body.devLink ?? null };
  } catch {
    return { ok: false, error: 'Network error. Try again.' };
  }
}

export function currentUser(): AuthUser | null {
  const v = get(authUser);
  return v && typeof v === 'object' ? v : null;
}

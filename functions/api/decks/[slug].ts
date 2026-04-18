// GET    /api/decks/:slug — fetch a full deck (any authed user, so share codes work)
// PUT    /api/decks/:slug — replace deck content (owner only)
// DELETE /api/decks/:slug — remove the deck (owner only)

import type { Env } from '../../_shared/env';
import { resolveSession } from '../../_shared/auth';
import { readSessionCookie } from '../../_shared/cookies';
import {
  validateDeckInput,
  isValidationError,
  getDeckWithWords,
  updateDeck,
  deleteDeck
} from '../../_shared/decks';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const account = await resolveSession(env, readSessionCookie(request));
  if (!account) return json401();

  const slug = normalizeSlug(params.slug);
  if (!slug) return json({ error: 'Invalid slug' }, 400);

  const deck = await getDeckWithWords(env, slug);
  if (!deck) return json({ error: 'Deck not found' }, 404);

  // Slugs act as unlisted share codes: any authed user who knows the
  // slug can fetch the deck. Ownership is surfaced so the client can
  // show edit/delete controls to the owner only.
  return json({ deck, isOwner: deck.owner_account_id === account.id });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const account = await resolveSession(env, readSessionCookie(request));
  if (!account) return json401();

  const slug = normalizeSlug(params.slug);
  if (!slug) return json({ error: 'Invalid slug' }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const validated = validateDeckInput(body);
  if (isValidationError(validated)) {
    return json({ error: validated.message, field: validated.field }, 400);
  }

  const ok = await updateDeck(env, account.id, slug, validated);
  if (!ok) return json({ error: 'Deck not found or not yours' }, 404);

  const deck = await getDeckWithWords(env, slug);
  return json({ deck });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const account = await resolveSession(env, readSessionCookie(request));
  if (!account) return json401();

  const slug = normalizeSlug(params.slug);
  if (!slug) return json({ error: 'Invalid slug' }, 400);

  const ok = await deleteDeck(env, account.id, slug);
  if (!ok) return json({ error: 'Deck not found or not yours' }, 404);
  return json({ ok: true });
};

function normalizeSlug(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(s)) return null;
  return s;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function json401() {
  return json({ error: 'Authentication required' }, 401);
}

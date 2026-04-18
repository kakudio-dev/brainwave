// GET /api/decks        — list caller's decks (summary form)
// POST /api/decks        — create a new deck
//
// Both require authentication.

import type { Env } from '../../_shared/env';
import { resolveSession } from '../../_shared/auth';
import { readSessionCookie } from '../../_shared/cookies';
import {
  validateDeckInput,
  isValidationError,
  countDecksForAccount,
  createDeck,
  listDecksForAccount,
  MAX_DECKS_PER_ACCOUNT
} from '../../_shared/decks';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const account = await resolveSession(env, readSessionCookie(request));
  if (!account) return json401();

  const decks = await listDecksForAccount(env, account.id);
  return json({ decks });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const account = await resolveSession(env, readSessionCookie(request));
  if (!account) return json401();

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

  const existingCount = await countDecksForAccount(env, account.id);
  if (existingCount >= MAX_DECKS_PER_ACCOUNT) {
    return json(
      {
        error: `You've reached the ${MAX_DECKS_PER_ACCOUNT}-deck limit. Delete one to create another.`,
        field: 'name'
      },
      400
    );
  }

  const deck = await createDeck(env, account.id, validated);
  return json({ deck }, 201);
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function json401() {
  return json({ error: 'Authentication required' }, 401);
}

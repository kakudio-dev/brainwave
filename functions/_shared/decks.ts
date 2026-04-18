// Deck validation, slug generation, and D1 helpers.
// Policy (locked in PLAN-v2):
//   - 50 decks per account
//   - 10 to 1000 words per deck
//   - 1 to 30 chars per word (trimmed, whitespace-collapsed)
//   - 1 to 60 chars per deck name
//   - words deduped within a deck, case-insensitively

import type { Env } from './env';
import { randomHex } from './random';

export const MAX_DECKS_PER_ACCOUNT = 50;
export const MIN_WORDS_PER_DECK = 10;
export const MAX_WORDS_PER_DECK = 1000;
export const MAX_WORD_LENGTH = 30;
export const MAX_DECK_NAME_LENGTH = 60;

// 8 characters picked from a 24-letter alphabet (all uppercase letters
// minus I and O to reduce visual confusion with digits). 24^8 ≈ 1.1e11
// — effectively unguessable without leaking a lot of slugs.
const SLUG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SLUG_LENGTH = 8;

export interface DeckRow {
  slug: string;
  owner_account_id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface DeckSummary extends DeckRow {
  word_count: number;
}

export interface DeckWithWords extends DeckRow {
  words: string[];
}

export interface DeckInput {
  name: string;
  words: string[];
}

export interface DeckValidationError {
  field: 'name' | 'words';
  message: string;
}

/**
 * Normalizes + validates user-supplied deck content. Returns either a
 * cleaned-up deck input ready for storage or a structured error.
 */
export function validateDeckInput(raw: unknown): DeckInput | DeckValidationError {
  if (!raw || typeof raw !== 'object') {
    return { field: 'name', message: 'Invalid request body' };
  }
  const body = raw as { name?: unknown; words?: unknown };

  // Name
  if (typeof body.name !== 'string') {
    return { field: 'name', message: 'Deck name is required' };
  }
  const name = body.name.trim();
  if (name.length === 0) {
    return { field: 'name', message: 'Deck name is required' };
  }
  if (name.length > MAX_DECK_NAME_LENGTH) {
    return { field: 'name', message: `Deck name must be ${MAX_DECK_NAME_LENGTH} characters or fewer` };
  }

  // Words
  if (!Array.isArray(body.words)) {
    return { field: 'words', message: 'Words must be an array' };
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of body.words) {
    if (typeof raw !== 'string') continue;
    const w = raw.replace(/\s+/g, ' ').trim();
    if (w.length === 0) continue;
    if (w.length > MAX_WORD_LENGTH) {
      return {
        field: 'words',
        message: `"${truncate(w, 20)}" is longer than ${MAX_WORD_LENGTH} characters`
      };
    }
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(w);
  }

  if (cleaned.length < MIN_WORDS_PER_DECK) {
    return {
      field: 'words',
      message: `A deck needs at least ${MIN_WORDS_PER_DECK} unique words (got ${cleaned.length})`
    };
  }
  if (cleaned.length > MAX_WORDS_PER_DECK) {
    return {
      field: 'words',
      message: `A deck can have at most ${MAX_WORDS_PER_DECK} words (got ${cleaned.length})`
    };
  }

  return { name, words: cleaned };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Returns true if the input is a DeckValidationError, false if it's a valid DeckInput.
 */
export function isValidationError(v: DeckInput | DeckValidationError): v is DeckValidationError {
  return (v as DeckValidationError).field !== undefined && (v as DeckValidationError).message !== undefined;
}

/**
 * Generates a random deck slug. Retries on collision (extremely rare
 * at the 24^8 alphabet size but still handled defensively).
 */
export async function generateUniqueSlug(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();
    const hit = await env.DB.prepare('SELECT slug FROM decks WHERE slug = ?').bind(slug).first();
    if (!hit) return slug;
  }
  // Fall back to high-entropy hex if we somehow hit 5 collisions in a row.
  return randomHex(6).toUpperCase();
}

function randomSlug(): string {
  const buf = new Uint8Array(SLUG_LENGTH);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  }
  return out;
}

/**
 * Count current decks owned by this account.
 */
export async function countDecksForAccount(env: Env, accountId: string): Promise<number> {
  const row = await env.DB
    .prepare('SELECT COUNT(*) AS c FROM decks WHERE owner_account_id = ?')
    .bind(accountId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * List summaries (no words) for the given owner. Sorted newest-first.
 */
export async function listDecksForAccount(env: Env, accountId: string): Promise<DeckSummary[]> {
  const res = await env.DB
    .prepare(
      `SELECT d.slug, d.owner_account_id, d.name, d.created_at, d.updated_at,
              COALESCE((SELECT COUNT(*) FROM deck_words w WHERE w.deck_slug = d.slug), 0) AS word_count
       FROM decks d
       WHERE d.owner_account_id = ?
       ORDER BY d.updated_at DESC`
    )
    .bind(accountId)
    .all<DeckSummary>();
  return res.results ?? [];
}

/**
 * Fetch a full deck with its words, in stored order. Returns null if
 * the slug doesn't exist.
 */
export async function getDeckWithWords(env: Env, slug: string): Promise<DeckWithWords | null> {
  const deck = await env.DB
    .prepare('SELECT slug, owner_account_id, name, created_at, updated_at FROM decks WHERE slug = ?')
    .bind(slug)
    .first<DeckRow>();
  if (!deck) return null;

  const wordsRes = await env.DB
    .prepare('SELECT word FROM deck_words WHERE deck_slug = ? ORDER BY position ASC')
    .bind(slug)
    .all<{ word: string }>();

  return { ...deck, words: (wordsRes.results ?? []).map(r => r.word) };
}

/**
 * Create a deck, plus bulk-insert its words in one batched statement.
 */
export async function createDeck(
  env: Env,
  accountId: string,
  input: DeckInput
): Promise<DeckWithWords> {
  const slug = await generateUniqueSlug(env);
  const now = Date.now();

  const stmts: D1PreparedStatement[] = [
    env.DB
      .prepare(
        'INSERT INTO decks (slug, owner_account_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(slug, accountId, input.name, now, now),
    ...input.words.map((word, i) =>
      env.DB
        .prepare('INSERT INTO deck_words (deck_slug, position, word) VALUES (?, ?, ?)')
        .bind(slug, i, word)
    )
  ];
  await env.DB.batch(stmts);

  return {
    slug,
    owner_account_id: accountId,
    name: input.name,
    created_at: now,
    updated_at: now,
    words: input.words
  };
}

/**
 * Replace a deck's content. Owner-only; returns false if the deck
 * doesn't exist or isn't owned by this account.
 */
export async function updateDeck(
  env: Env,
  accountId: string,
  slug: string,
  input: DeckInput
): Promise<boolean> {
  const existing = await env.DB
    .prepare('SELECT owner_account_id FROM decks WHERE slug = ?')
    .bind(slug)
    .first<{ owner_account_id: string }>();
  if (!existing || existing.owner_account_id !== accountId) return false;

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    env.DB
      .prepare('UPDATE decks SET name = ?, updated_at = ? WHERE slug = ?')
      .bind(input.name, now, slug),
    env.DB.prepare('DELETE FROM deck_words WHERE deck_slug = ?').bind(slug),
    ...input.words.map((word, i) =>
      env.DB
        .prepare('INSERT INTO deck_words (deck_slug, position, word) VALUES (?, ?, ?)')
        .bind(slug, i, word)
    )
  ];
  await env.DB.batch(stmts);
  return true;
}

/**
 * Delete a deck. Owner-only; returns false if the deck doesn't exist
 * or isn't owned by this account.
 */
export async function deleteDeck(env: Env, accountId: string, slug: string): Promise<boolean> {
  const res = await env.DB
    .prepare('DELETE FROM decks WHERE slug = ? AND owner_account_id = ?')
    .bind(slug, accountId)
    .run();
  const changes = (res.meta as { changes?: number } | undefined)?.changes ?? 0;
  return changes > 0;
}

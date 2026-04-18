import { writable } from 'svelte/store';

export interface DeckSummary {
  slug: string;
  name: string;
  word_count: number;
  created_at: number;
  updated_at: number;
}

export interface Deck {
  slug: string;
  name: string;
  words: string[];
  created_at: number;
  updated_at: number;
}

export const myDecks = writable<DeckSummary[] | null>(null);
let inFlight: Promise<void> | null = null;

export async function refreshMyDecks(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/decks', { credentials: 'same-origin' });
      if (res.status === 401) {
        myDecks.set(null);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { decks: DeckSummary[] };
      myDecks.set(body.decks ?? []);
    } catch {
      /* ignore; leave prior state */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function createDeck(input: { name: string; words: string[] }): Promise<
  { ok: true; deck: Deck } | { ok: false; error: string; field?: string }
> {
  const res = await fetch('/api/decks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin'
  });
  const body = (await res.json().catch(() => ({}))) as {
    deck?: Deck;
    error?: string;
    field?: string;
  };
  if (!res.ok || !body.deck) {
    return { ok: false, error: body.error ?? 'Failed to create deck', field: body.field };
  }
  refreshMyDecks();
  return { ok: true, deck: body.deck };
}

export async function fetchDeck(slug: string): Promise<{
  ok: true;
  deck: Deck;
  isOwner: boolean;
} | { ok: false; error: string; status: number }> {
  const res = await fetch(`/api/decks/${encodeURIComponent(slug)}`, {
    credentials: 'same-origin'
  });
  const body = (await res.json().catch(() => ({}))) as {
    deck?: Deck;
    isOwner?: boolean;
    error?: string;
  };
  if (!res.ok || !body.deck) {
    return {
      ok: false,
      error: body.error ?? 'Failed to load deck',
      status: res.status
    };
  }
  return { ok: true, deck: body.deck, isOwner: !!body.isOwner };
}

export async function updateDeck(
  slug: string,
  input: { name: string; words: string[] }
): Promise<{ ok: true; deck: Deck } | { ok: false; error: string; field?: string }> {
  const res = await fetch(`/api/decks/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin'
  });
  const body = (await res.json().catch(() => ({}))) as {
    deck?: Deck;
    error?: string;
    field?: string;
  };
  if (!res.ok || !body.deck) {
    return { ok: false, error: body.error ?? 'Failed to save deck', field: body.field };
  }
  refreshMyDecks();
  return { ok: true, deck: body.deck };
}

export async function deleteDeck(slug: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/decks/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? 'Failed to delete deck' };
  }
  refreshMyDecks();
  return { ok: true };
}

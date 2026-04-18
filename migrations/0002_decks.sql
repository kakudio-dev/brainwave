-- Phase 3 deck schema. Decks belong to accounts; their slug is
-- shareable (anyone with the slug who is authenticated can play with
-- the deck), so the slug doubles as an unguessable share code.

CREATE TABLE decks (
  slug TEXT PRIMARY KEY,
  owner_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_decks_owner ON decks(owner_account_id);

-- Words live in a separate table so deck-wide operations (word-count,
-- bulk replace on edit, cascade delete) stay simple and cheap. Position
-- is preserved so edits that rearrange or reshuffle survive a round
-- trip.
CREATE TABLE deck_words (
  deck_slug TEXT NOT NULL REFERENCES decks(slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  word TEXT NOT NULL,
  PRIMARY KEY (deck_slug, position)
);

CREATE INDEX idx_deck_words_slug ON deck_words(deck_slug);

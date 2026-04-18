-- Phase 2 auth schema.
-- One row per signed-up email.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,                -- UUID
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL         -- unix ms
);

-- At most one row per account. When a new login succeeds we replace any
-- prior row for the same account, invalidating whatever device held the
-- previous token. A UNIQUE constraint on account_id enforces that.
CREATE TABLE sessions (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,         -- opaque random hex, ~32 bytes
  device_label TEXT,                  -- friendly UA-derived label
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_token ON sessions(token);

-- Short-lived magic links. Deleted on consume or expiry.
CREATE TABLE magic_links (
  token TEXT PRIMARY KEY,             -- opaque random hex
  email TEXT NOT NULL,
  device_label TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER                 -- non-null once used; kept briefly for audit then cleaned
);

CREATE INDEX idx_magic_links_email ON magic_links(email);
CREATE INDEX idx_magic_links_expires_at ON magic_links(expires_at);

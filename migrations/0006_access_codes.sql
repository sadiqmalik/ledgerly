-- Access codes: named, revocable, viewer-only sign-in for chosen books.
-- Only the SHA-256 of the code is stored; the code itself is shown once when it is created.
CREATE TABLE IF NOT EXISTS access_codes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  book_ids       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(book_ids)),
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  revoked_at    TEXT,
  last_used_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS access_codes_hash_uq ON access_codes (code_hash);

-- Failed access-code guesses per client (and one overall counter), for throttling.
CREATE TABLE IF NOT EXISTS access_code_attempts (
  key             TEXT PRIMARY KEY,
  failures        INTEGER NOT NULL DEFAULT 0,
  window_started  TEXT NOT NULL,
  locked_until    TEXT
);

-- A session started with an access code points at its code, so revoking the code ends the session.
ALTER TABLE sessions ADD COLUMN access_code_id TEXT;
CREATE INDEX IF NOT EXISTS sessions_access_code_id ON sessions (access_code_id);

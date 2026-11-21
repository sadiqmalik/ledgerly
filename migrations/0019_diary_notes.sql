-- The diary: dated notes and important messages kept per ledger, with who it came from and who it is for,
-- an optional link to a project of the ledger, an important flag, and an on/off switch (a disabled note is hidden
-- from the default list but kept). Additive: a new table only.
CREATE TABLE IF NOT EXISTS diary_notes (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT,
  from_name  TEXT,
  to_name    TEXT,
  project_id TEXT,
  important  INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS diary_notes_book_idx ON diary_notes (book_id, date);

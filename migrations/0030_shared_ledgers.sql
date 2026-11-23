-- A notebook, a loan register and an item can be shared with more ledgers than the one they belong to (their `book_id`,
-- the main ledger). These tables hold the EXTRA ledgers only; no rows = shared with nobody, exactly as before.
-- Someone can open the thing through any ledger where they have the role and the page (and any notebook rules).
-- Additive: three small tables.
CREATE TABLE IF NOT EXISTS diary_notebook_ledgers (
  notebook_id TEXT NOT NULL,
  book_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (notebook_id, book_id)
);
CREATE INDEX IF NOT EXISTS diary_notebook_ledgers_book_idx ON diary_notebook_ledgers (book_id);

CREATE TABLE IF NOT EXISTS loan_register_ledgers (
  register_id TEXT NOT NULL,
  book_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (register_id, book_id)
);
CREATE INDEX IF NOT EXISTS loan_register_ledgers_book_idx ON loan_register_ledgers (book_id);

CREATE TABLE IF NOT EXISTS item_ledgers (
  item_id    TEXT NOT NULL,
  book_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, book_id)
);
CREATE INDEX IF NOT EXISTS item_ledgers_book_idx ON item_ledgers (book_id);

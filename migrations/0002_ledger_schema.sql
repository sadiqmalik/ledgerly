-- 0002_ledger_schema.sql
-- Ledger domain schema for the family ledger (Cloudflare D1 / SQLite).
-- Design: docs/ARCHITECTURE.md.
-- Conventions:
--   * Money is INTEGER minor units (paisa / cents).
--   * Dates are TEXT 'YYYY-MM-DD'; timestamps are TEXT ISO-8601.
--   * Booleans are INTEGER 0/1.
--   * JSON is TEXT, validated with json_valid().
--   * No FOREIGN KEY clauses: the app enforces referential integrity.
-- Auth tables (accounts, sessions, account_log) live in 0001_auth.sql.

-- Ledger books. One row per organization (the "family" book).
CREATE TABLE IF NOT EXISTS books (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'PKR',
  created_at    TEXT NOT NULL
);

-- Places money lives: bank accounts, cash, wallets.
CREATE TABLE IF NOT EXISTS holders (
  id       TEXT PRIMARY KEY,
  book_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  kind     TEXT NOT NULL CHECK (kind IN ('bank','cash','wallet')),
  active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS holders_book_name_uq ON holders (book_id, name);

-- Funds: named pots of money inside a book (general, reserved, custodial, investment).
CREATE TABLE IF NOT EXISTS funds (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT,
  is_reserved INTEGER NOT NULL DEFAULT 0 CHECK (is_reserved IN (0,1)),
  holder_id   TEXT,
  currency    TEXT NOT NULL DEFAULT 'PKR',
  kind        TEXT NOT NULL CHECK (kind IN ('general','reserved','custodial','investment')),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS funds_book_name_uq ON funds (book_id, name);

-- People (and relations) that money goes to or comes from.
CREATE TABLE IF NOT EXISTS parties (
  id       TEXT PRIMARY KEY,
  book_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  relation TEXT,
  aliases  TEXT CHECK (aliases IS NULL OR json_valid(aliases)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS parties_book_name_uq ON parties (book_id, name);

-- Entry categories, with the direction an entry usually takes ('cr' or 'dr').
CREATE TABLE IF NOT EXISTS categories (
  id                TEXT PRIMARY KEY,
  book_id           TEXT NOT NULL,
  name              TEXT NOT NULL,
  parent_id         TEXT,
  default_direction TEXT NOT NULL CHECK (default_direction IN ('cr','dr'))
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_book_name_uq ON categories (book_id, name);

-- Projects: trips, medical cases, events and other grouped spending.
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('trip','medical','event','other')),
  fund_id     TEXT,
  starts_on   TEXT,
  ends_on     TEXT,
  budget      INTEGER,
  meta_schema TEXT CHECK (meta_schema IS NULL OR json_valid(meta_schema)),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);

-- Ledger entries: one row per money movement on a fund.
-- Transfers and FX conversions are two rows sharing a link_id.
-- Soft delete via deleted_at.
CREATE TABLE IF NOT EXISTS entries (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  date        TEXT NOT NULL,
  fund_id     TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('cr','dr')),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'PKR',
  party_id    TEXT,
  category_id TEXT,
  project_id  TEXT,
  comment     TEXT,
  rate        REAL,
  link_id     TEXT,
  fx_amount   INTEGER,
  fx_currency TEXT,
  paid_date   TEXT,
  status      TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending')),
  exclude     INTEGER NOT NULL DEFAULT 0 CHECK (exclude IN (0,1)),
  meta        TEXT CHECK (meta IS NULL OR json_valid(meta)),
  source_ref  TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS entries_book_date_idx       ON entries (book_id, date);
CREATE INDEX IF NOT EXISTS entries_book_fund_date_idx  ON entries (book_id, fund_id, date);
CREATE INDEX IF NOT EXISTS entries_book_project_idx    ON entries (book_id, project_id);
CREATE INDEX IF NOT EXISTS entries_link_idx            ON entries (link_id);
CREATE INDEX IF NOT EXISTS entries_book_party_idx      ON entries (book_id, party_id);

-- Year-end closes. Composite primary key; snapshot holds {fund_id: balance} as JSON.
CREATE TABLE IF NOT EXISTS year_closes (
  book_id   TEXT NOT NULL,
  year      INTEGER NOT NULL,
  closed_at TEXT NOT NULL,
  closed_by TEXT NOT NULL,
  snapshot  TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
  PRIMARY KEY (book_id, year)
);

-- Documents attached to projects, parties or medical cases (phase 2 file storage via r2_key).
CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  project_id  TEXT,
  party_id    TEXT,
  date        TEXT,
  received_on TEXT,
  doctor      TEXT,
  hospital    TEXT,
  type        TEXT,
  title       TEXT,
  comment     TEXT,
  r2_key      TEXT
);

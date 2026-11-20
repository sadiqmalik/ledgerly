-- 0001_auth.sql: sign-in tables.
-- Memberships (JSON in accounts.memberships) refer to book ids: [{"bookId":"family","role":"editor"}].

-- accounts (id = 24-hex string)
CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  is_super_admin  INTEGER NOT NULL DEFAULT 0 CHECK (is_super_admin IN (0, 1)),
  memberships     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(memberships)),
  disabled        INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_uq ON accounts (email);

-- sessions: id = sha256 hex of the cookie value. expired rows are purged by the nightly job (later module).
CREATE TABLE IF NOT EXISTS sessions (
  id                   TEXT PRIMARY KEY,
  account_id           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  last_seen_at         TEXT NOT NULL,
  expires_at           TEXT NOT NULL,
  absolute_expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_absolute_expires_at ON sessions (absolute_expires_at);
CREATE INDEX IF NOT EXISTS sessions_account_id ON sessions (account_id);

-- account_log: super-administrator audit trail
CREATE TABLE IF NOT EXISTS account_log (
  id       TEXT PRIMARY KEY,
  actor    TEXT NOT NULL CHECK (json_valid(actor)),
  action   TEXT NOT NULL,
  target   TEXT NOT NULL,
  detail   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail)),
  at       TEXT NOT NULL
);

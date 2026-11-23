-- Sign in with a username or an email. accounts gets `username` (unique, lower case, required) and `email` becomes
-- optional (unique when present). SQLite cannot drop NOT NULL in place, so the table is rebuilt; nothing references it
-- by foreign key (sessions and memberships hold the id as plain text).
-- Existing accounts get the part of their email before the "@" as username ("+" and spaces become "-"); a clash
-- gets a number (2, 3, ...), a very short one becomes "user".
CREATE TABLE accounts_new (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  email           TEXT,
  name            TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  is_super_admin  INTEGER NOT NULL DEFAULT 0 CHECK (is_super_admin IN (0, 1)),
  memberships     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(memberships)),
  disabled        INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT,
  resources       TEXT,
  loan_memberships TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(loan_memberships))
);

INSERT INTO accounts_new (id, username, email, name, password_hash, is_super_admin, memberships, disabled, failed_logins,
  locked_until, last_login_at, created_at, updated_at, resources, loan_memberships)
WITH base AS (
  SELECT a.*, substr(CASE WHEN length(replace(replace(lower(substr(email, 1, instr(email, '@') - 1)), '+', '-'), ' ', '-')) >= 2
      THEN replace(replace(lower(substr(email, 1, instr(email, '@') - 1)), '+', '-'), ' ', '-') ELSE 'user' END, 1, 36) AS b
  FROM accounts a
), numbered AS (
  SELECT base.*, row_number() OVER (PARTITION BY b ORDER BY created_at, id) AS rn FROM base
)
SELECT id, b || CASE WHEN rn > 1 THEN CAST(rn AS TEXT) ELSE '' END, email, name, password_hash, is_super_admin, memberships,
  disabled, failed_logins, locked_until, last_login_at, created_at, updated_at, resources, loan_memberships
FROM numbered;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;
CREATE UNIQUE INDEX accounts_username_uq ON accounts (username);
CREATE UNIQUE INDEX accounts_email_uq ON accounts (email);

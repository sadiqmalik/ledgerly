-- Loan registers: who borrowed from whom, with taken/returned entries. Access per register lives in accounts.loan_memberships.
CREATE TABLE IF NOT EXISTS loan_registers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  borrower    TEXT NOT NULL,
  lender      TEXT NOT NULL,
  description TEXT,
  currency    TEXT NOT NULL DEFAULT 'PKR',
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_entries (
  id          TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('taken','returned')),
  amount      INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000000000),
  date        TEXT NOT NULL,
  receiver    TEXT,
  comment     TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_loan_entries_register ON loan_entries (register_id, date);

ALTER TABLE accounts ADD COLUMN loan_memberships TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(loan_memberships));

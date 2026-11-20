-- Loans shared with access codes: which loan registers each access code may view (view-only).
-- Additive: one new table, no existing data is touched. Rows go away when the code or the register is deleted.
CREATE TABLE IF NOT EXISTS access_code_loans (
  code_id     TEXT NOT NULL,
  register_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (code_id, register_id)
);
CREATE INDEX IF NOT EXISTS access_code_loans_register_idx ON access_code_loans (register_id);

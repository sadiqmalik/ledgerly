-- Managed currency list (one global list). Stored values elsewhere stay the 3-letter code.
-- D1 limits the terms of one compound statement, so the seed is written as small INSERTs.
CREATE TABLE IF NOT EXISTS currencies (
  code       TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),
  name       TEXT NOT NULL,
  alias      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at) VALUES
  ('PKR', 'Pakistani rupee', datetime('now'), datetime('now')),
  ('USD', 'US dollar', datetime('now'), datetime('now')),
  ('EUR', 'Euro', datetime('now'), datetime('now')),
  ('GBP', 'British pound', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at) VALUES
  ('SEK', 'Swedish krona', datetime('now'), datetime('now')),
  ('NOK', 'Norwegian krone', datetime('now'), datetime('now')),
  ('DKK', 'Danish krone', datetime('now'), datetime('now')),
  ('AED', 'UAE dirham', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at) VALUES
  ('SAR', 'Saudi riyal', datetime('now'), datetime('now')),
  ('QAR', 'Qatari riyal', datetime('now'), datetime('now')),
  ('KWD', 'Kuwaiti dinar', datetime('now'), datetime('now')),
  ('OMR', 'Omani rial', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at) VALUES
  ('BHD', 'Bahraini dinar', datetime('now'), datetime('now')),
  ('TRY', 'Turkish lira', datetime('now'), datetime('now')),
  ('INR', 'Indian rupee', datetime('now'), datetime('now')),
  ('CAD', 'Canadian dollar', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at) VALUES
  ('AUD', 'Australian dollar', datetime('now'), datetime('now')),
  ('CHF', 'Swiss franc', datetime('now'), datetime('now')),
  ('JPY', 'Japanese yen', datetime('now'), datetime('now')),
  ('CNY', 'Chinese yuan', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at) VALUES
  ('MYR', 'Malaysian ringgit', datetime('now'), datetime('now')),
  ('SGD', 'Singapore dollar', datetime('now'), datetime('now'));

-- Every other code already in use, so nothing existing becomes invalid (name = the code).
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at)
SELECT DISTINCT upper(trim(base_currency)), upper(trim(base_currency)), datetime('now'), datetime('now') FROM books WHERE base_currency IS NOT NULL AND length(trim(base_currency)) = 3;
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at)
SELECT DISTINCT upper(trim(currency)), upper(trim(currency)), datetime('now'), datetime('now') FROM funds WHERE currency IS NOT NULL AND length(trim(currency)) = 3;
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at)
SELECT DISTINCT upper(trim(currency)), upper(trim(currency)), datetime('now'), datetime('now') FROM holders WHERE currency IS NOT NULL AND length(trim(currency)) = 3;
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at)
SELECT DISTINCT upper(trim(currency)), upper(trim(currency)), datetime('now'), datetime('now') FROM loan_registers WHERE currency IS NOT NULL AND length(trim(currency)) = 3;
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at)
SELECT DISTINCT upper(trim(currency)), upper(trim(currency)), datetime('now'), datetime('now') FROM entries WHERE currency IS NOT NULL AND length(trim(currency)) = 3;
INSERT OR IGNORE INTO currencies (code, name, created_at, updated_at)
SELECT DISTINCT upper(trim(fx_currency)), upper(trim(fx_currency)), datetime('now'), datetime('now') FROM entries WHERE fx_currency IS NOT NULL AND length(trim(fx_currency)) = 3;

-- Per-book settings (key/value) and the monthly profit rates table.
CREATE TABLE IF NOT EXISTS book_settings (
  book_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (book_id, key)
);

-- Annual profit rate (percent) declared for a calendar month ('YYYY-MM').
CREATE TABLE IF NOT EXISTS profit_rates (
  book_id    TEXT NOT NULL,
  month      TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  rate       REAL NOT NULL CHECK (rate >= 0 AND rate <= 100),
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (book_id, month)
);

-- 0004_memo_funds.sql
-- Adds the 'memo' fund kind: money that is tracked but never counted in total or usable
-- (custodial sheets, medical detail sheets that are not rolled up). SQLite cannot alter a CHECK
-- constraint, so the funds table is rebuilt. There are no foreign keys, so the rebuild is safe.

CREATE TABLE funds_new (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT,
  is_reserved INTEGER NOT NULL DEFAULT 0 CHECK (is_reserved IN (0,1)),
  holder_id   TEXT,
  currency    TEXT NOT NULL DEFAULT 'PKR',
  kind        TEXT NOT NULL CHECK (kind IN ('general','reserved','custodial','investment','memo')),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1))
);

INSERT INTO funds_new (id, book_id, name, color, is_reserved, holder_id, currency, kind, archived)
SELECT id, book_id, name, color, is_reserved, holder_id, currency, kind, archived FROM funds;

DROP TABLE funds;
ALTER TABLE funds_new RENAME TO funds;
CREATE UNIQUE INDEX IF NOT EXISTS funds_book_name_uq ON funds (book_id, name);

-- Diary categories (a person or a topic such as "Family" or "Car") and important dates. A note can belong to one
-- category, be a plain note or an important date, and an important date can repeat every year (anniversaries).
-- Additive: one new table and three new columns with safe defaults.
CREATE TABLE IF NOT EXISTS diary_categories (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS diary_categories_book_idx ON diary_categories (book_id);
ALTER TABLE diary_notes ADD COLUMN category_id TEXT;
ALTER TABLE diary_notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
ALTER TABLE diary_notes ADD COLUMN repeat_yearly INTEGER NOT NULL DEFAULT 0;

-- The diary is private: every note (created_by) and now every category belongs to the account that made it, and only
-- that account can read it. Additive: one new column. Existing categories (none live yet) stay hidden until claimed.
ALTER TABLE diary_categories ADD COLUMN owner_id TEXT;
CREATE INDEX IF NOT EXISTS diary_categories_owner_idx ON diary_categories (book_id, owner_id);
CREATE INDEX IF NOT EXISTS diary_notes_owner_idx ON diary_notes (book_id, created_by);

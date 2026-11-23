-- Optional colour per notebook entry (NULL = none) and a layout per category (rows or columns).
ALTER TABLE diary_notes ADD COLUMN color TEXT;
ALTER TABLE diary_categories ADD COLUMN layout TEXT NOT NULL DEFAULT 'rows';

-- A whole notebook or a single category can be locked: everything inside becomes read only until it is unlocked.
ALTER TABLE diary_notebooks ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE diary_categories ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

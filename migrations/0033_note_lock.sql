-- A locked notebook entry cannot be edited, disabled or deleted until it is unlocked (1 = locked).
ALTER TABLE diary_notes ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

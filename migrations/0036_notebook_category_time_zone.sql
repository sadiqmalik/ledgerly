-- Optional IANA time zone for a whole notebook or category. NULL inherits: an entry reads its own zone, else its
-- category's, else its notebook's, else the ledger's application time zone.
ALTER TABLE diary_notebooks ADD COLUMN time_zone TEXT;
ALTER TABLE diary_categories ADD COLUMN time_zone TEXT;

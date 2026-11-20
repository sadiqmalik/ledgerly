-- 0007_item_tracker.sql
-- Item tracker: reusable locations (with the country or place they are in) and the items kept in them.
-- Both are scoped to a book. Items point at a location by id; the owner is free text.
CREATE TABLE IF NOT EXISTS item_locations (
  id      TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  name    TEXT NOT NULL,
  place   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS item_locations_book_name_uq ON item_locations (book_id, name);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  comment     TEXT,
  location_id TEXT,
  owner       TEXT,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_book_idx ON items (book_id, name);
CREATE INDEX IF NOT EXISTS items_location_idx ON items (location_id);

-- Design rule: every table has created_at and updated_at (docs/TECH_SPECS.md). This adds the missing columns to the
-- older tables. Existing rows stay empty (their real time is unknown, screens show nothing for them). From now on the
-- database itself fills them: an AFTER INSERT trigger sets whichever is empty and an AFTER UPDATE trigger refreshes
-- updated_at whenever a statement did not set it, so no code path can forget. Additive only.
-- Not covered on purpose: sessions, account_log, access_code_attempts (logs and sessions carry their own times),
-- entry_documents and access_code_loans (pure join tables).
-- NOTE: a future migration that rebuilds one of these tables must recreate its two triggers.

ALTER TABLE books ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS books_ts_insert AFTER INSERT ON books WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE books SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS books_ts_update AFTER UPDATE ON books WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE books SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE holders ADD COLUMN created_at TEXT;
ALTER TABLE holders ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS holders_ts_insert AFTER INSERT ON holders WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE holders SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS holders_ts_update AFTER UPDATE ON holders WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE holders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE funds ADD COLUMN created_at TEXT;
ALTER TABLE funds ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS funds_ts_insert AFTER INSERT ON funds WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE funds SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS funds_ts_update AFTER UPDATE ON funds WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE funds SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE parties ADD COLUMN created_at TEXT;
ALTER TABLE parties ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS parties_ts_insert AFTER INSERT ON parties WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE parties SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS parties_ts_update AFTER UPDATE ON parties WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE parties SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE categories ADD COLUMN created_at TEXT;
ALTER TABLE categories ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS categories_ts_insert AFTER INSERT ON categories WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE categories SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS categories_ts_update AFTER UPDATE ON categories WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE categories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE projects ADD COLUMN created_at TEXT;
ALTER TABLE projects ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS projects_ts_insert AFTER INSERT ON projects WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE projects SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS projects_ts_update AFTER UPDATE ON projects WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE projects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE year_closes ADD COLUMN created_at TEXT;
ALTER TABLE year_closes ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS year_closes_ts_insert AFTER INSERT ON year_closes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE year_closes SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS year_closes_ts_update AFTER UPDATE ON year_closes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE year_closes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE item_locations ADD COLUMN created_at TEXT;
ALTER TABLE item_locations ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS item_locations_ts_insert AFTER INSERT ON item_locations WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE item_locations SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS item_locations_ts_update AFTER UPDATE ON item_locations WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE item_locations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE items ADD COLUMN created_at TEXT;
CREATE TRIGGER IF NOT EXISTS items_ts_insert AFTER INSERT ON items WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE items SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS items_ts_update AFTER UPDATE ON items WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE book_settings ADD COLUMN created_at TEXT;
ALTER TABLE book_settings ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS book_settings_ts_insert AFTER INSERT ON book_settings WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE book_settings SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS book_settings_ts_update AFTER UPDATE ON book_settings WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE book_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE profit_rates ADD COLUMN created_at TEXT;
CREATE TRIGGER IF NOT EXISTS profit_rates_ts_insert AFTER INSERT ON profit_rates WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE profit_rates SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS profit_rates_ts_update AFTER UPDATE ON profit_rates WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE profit_rates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

ALTER TABLE access_codes ADD COLUMN updated_at TEXT;
CREATE TRIGGER IF NOT EXISTS access_codes_ts_insert AFTER INSERT ON access_codes WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE access_codes SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS access_codes_ts_update AFTER UPDATE ON access_codes WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE access_codes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

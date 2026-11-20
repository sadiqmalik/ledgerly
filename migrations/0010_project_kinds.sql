-- Project kinds become free text (trip, medical, event, other stay as the defaults).
-- SQLite cannot drop a CHECK, so the table is rebuilt. Nothing references projects by foreign key.
CREATE TABLE projects_new (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (length(trim(kind)) BETWEEN 1 AND 40),
  fund_id     TEXT,
  starts_on   TEXT,
  ends_on     TEXT,
  budget      INTEGER,
  meta_schema TEXT CHECK (meta_schema IS NULL OR json_valid(meta_schema)),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
INSERT INTO projects_new SELECT id, book_id, name, kind, fund_id, starts_on, ends_on, budget, meta_schema, status FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

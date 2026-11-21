-- Several notebooks. A notebook has a name and can be linked to one ledger (book_id) or to none. Entries and categories
-- now belong to a notebook. A linked notebook follows the ledger's access: admins with the Notebook page and a role in
-- that ledger can use it (Viewer reads, Editor and Admin change). An unlinked notebook (book_id NULL) is only for the
-- super administrator who owns it. Existing entries and categories move into a notebook called General per owner and
-- ledger. Additive: a new table and two new columns.
CREATE TABLE IF NOT EXISTS diary_notebooks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  book_id     TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS diary_notebooks_book_idx ON diary_notebooks (book_id);
CREATE INDEX IF NOT EXISTS diary_notebooks_owner_idx ON diary_notebooks (owner_id);
ALTER TABLE diary_notes ADD COLUMN notebook_id TEXT;
ALTER TABLE diary_categories ADD COLUMN notebook_id TEXT;

INSERT INTO diary_notebooks (id, owner_id, book_id, name, description, created_at, updated_at)
SELECT lower(hex(randomblob(16))), owner, book, 'General', NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (SELECT created_by AS owner, book_id AS book FROM diary_notes WHERE created_by IS NOT NULL AND created_by <> ''
      UNION SELECT owner_id, book_id FROM diary_categories WHERE owner_id IS NOT NULL AND owner_id <> '');

UPDATE diary_notes SET notebook_id = (SELECT nb.id FROM diary_notebooks nb WHERE nb.owner_id = diary_notes.created_by AND nb.book_id = diary_notes.book_id)
WHERE created_by IS NOT NULL;
UPDATE diary_categories SET notebook_id = (SELECT nb.id FROM diary_notebooks nb WHERE nb.owner_id = diary_categories.owner_id AND nb.book_id = diary_categories.book_id)
WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS diary_notes_notebook_idx ON diary_notes (notebook_id, date);
CREATE INDEX IF NOT EXISTS diary_categories_notebook_idx ON diary_categories (notebook_id);

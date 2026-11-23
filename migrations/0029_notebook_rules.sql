-- Per-notebook access for access codes: JSON object { "<bookId>": { "only": ["<notebookId>", ...] } or { "exclude": [...] } }.
-- No entry for a ledger = every notebook the owner may open. For admins the same idea lives in the membership
-- (memberships[].notebooksExcluded), so only access codes need a column. Additive: one nullable column.
ALTER TABLE access_codes ADD COLUMN notebook_rules TEXT;

-- Per-ledger pages for an access code: JSON object { "<bookId>": ["items", ...] }. A ledger without an entry uses the
-- code's global pages (access_codes.resources). Accounts keep theirs inside the memberships JSON ({ bookId, role, resources? }).
-- Additive: one nullable column.
ALTER TABLE access_codes ADD COLUMN book_resources TEXT;

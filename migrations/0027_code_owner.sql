-- An access code belongs to an admin account (account_id). The code is view only and shows at most what its owner can see;
-- codes made before this have no owner (NULL) and keep working until a super administrator links them to one.
-- Deleting an admin deletes the codes they own. Additive: one nullable column and an index.
ALTER TABLE access_codes ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS access_codes_account_idx ON access_codes (account_id);

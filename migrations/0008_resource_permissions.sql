-- Page-level permissions (resources): a global allowlist per account and per access code.
-- accounts.resources: JSON array, or NULL = not set (a regular account keeps full access).
ALTER TABLE accounts ADD COLUMN resources TEXT;

-- access_codes.resources: JSON array. Existing codes get the default pages (no Settings, Projects or Documents).
ALTER TABLE access_codes ADD COLUMN resources TEXT NOT NULL DEFAULT '["dashboard","ledger","reports","items"]';

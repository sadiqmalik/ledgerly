-- A super administrator can show an access code again: the code is kept encrypted (AES-GCM, key from the ACCESS_CODE_KEY
-- secret), never in clear text. Codes made before this have no stored secret and must be reset once to become viewable.
-- Additive: one nullable column.
ALTER TABLE access_codes ADD COLUMN code_secret TEXT;

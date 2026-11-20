ALTER TABLE entries ADD COLUMN quantity REAL NOT NULL DEFAULT 1
  CHECK (quantity > 0 AND quantity <= 1000000000);
ALTER TABLE entries ADD COLUMN unit_price INTEGER
  CHECK (unit_price IS NULL OR (unit_price > 0 AND unit_price <= 10000000000000 AND unit_price = CAST(unit_price AS INTEGER)));

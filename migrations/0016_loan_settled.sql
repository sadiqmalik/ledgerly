-- A loan register can be marked settled (everything paid back). NULL means active. Entries are never changed by this.
ALTER TABLE loan_registers ADD COLUMN settled_at TEXT;

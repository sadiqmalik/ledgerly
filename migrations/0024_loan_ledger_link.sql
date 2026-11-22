-- A loan can be linked to a ledger (book_id). The sidebar and the Loans page then show it only under that ledger. A loan
-- with no ledger (all existing ones until someone links them) is shown under every ledger. Access stays per loan.
-- Additive: one nullable column.
ALTER TABLE loan_registers ADD COLUMN book_id TEXT;
CREATE INDEX IF NOT EXISTS loan_registers_book_idx ON loan_registers (book_id);

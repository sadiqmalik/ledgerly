-- Which lender a loan entry belongs to (for loans with several lenders). NULL = not assigned.
ALTER TABLE loan_entries ADD COLUMN lender TEXT;

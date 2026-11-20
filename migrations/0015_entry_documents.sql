-- Many-to-many links between ledger entries and documents. Rows of soft-deleted entries stay (hidden by reads).
CREATE TABLE IF NOT EXISTS entry_documents (
  entry_id    TEXT NOT NULL,
  document_id TEXT NOT NULL,
  book_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (entry_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_entry_documents_document ON entry_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_entry_documents_book ON entry_documents (book_id);

-- Documents get optional file metadata (the file itself lives in R2 under docs/<book>/<id>) and timestamps.
ALTER TABLE documents ADD COLUMN file_name TEXT;
ALTER TABLE documents ADD COLUMN file_type TEXT;
ALTER TABLE documents ADD COLUMN file_size INTEGER;
ALTER TABLE documents ADD COLUMN created_at TEXT;
ALTER TABLE documents ADD COLUMN updated_at TEXT;

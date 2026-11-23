-- Optional IANA time zone for a notebook entry's start and end time (for example 'Europe/Stockholm'). NULL means the
-- ledger's application time zone (stored in book_settings under the key 'timeZone', no migration needed for that).
ALTER TABLE diary_notes ADD COLUMN time_zone TEXT;

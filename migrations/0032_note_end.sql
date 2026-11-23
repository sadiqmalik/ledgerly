-- Optional end of a notebook entry (a duration): end_date is YYYY-MM-DD, end_time is 'HH:MM'. Both nullable; existing rows
-- stay NULL. An end time without an end date means the start day (resolved when read).
ALTER TABLE diary_notes ADD COLUMN end_date TEXT;
ALTER TABLE diary_notes ADD COLUMN end_time TEXT;

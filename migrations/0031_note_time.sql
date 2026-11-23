-- Optional exact time of day for a notebook entry: 'HH:MM', 24-hour wall-clock, no time zone. Nullable; existing rows
-- stay NULL. (The end date and end time are in 0032.)
ALTER TABLE diary_notes ADD COLUMN note_time TEXT;

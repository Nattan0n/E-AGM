-- Advance-entry mode: staff may key votes before the agenda is opened (pre-meeting preparation day).
ALTER TABLE master ADD COLUMN advance_entry TINYINT NOT NULL DEFAULT 0 AFTER online_enabled;

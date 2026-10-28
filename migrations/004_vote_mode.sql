-- Online holders choose who votes: themselves (self) or the on-site staff on their behalf (staff).
ALTER TABLE online_registration ADD COLUMN vote_mode ENUM('self','staff') NOT NULL DEFAULT 'self' AFTER status;

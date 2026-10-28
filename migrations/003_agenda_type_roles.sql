ALTER TABLE termpartner
  ADD COLUMN vote_type ENUM('ordinary','special','unanimous','info') NOT NULL DEFAULT 'ordinary' AFTER status;
ALTER TABLE useradmin MODIFY role ENUM('admin','staff','viewer') NOT NULL DEFAULT 'staff';

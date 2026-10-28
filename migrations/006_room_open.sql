-- Online meeting room: holders wait in a lobby until an admin opens it; only then are the agendas visible.
ALTER TABLE master ADD COLUMN room_open TINYINT NOT NULL DEFAULT 0 AFTER advance_entry;

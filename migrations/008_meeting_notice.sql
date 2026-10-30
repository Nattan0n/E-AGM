-- Documents link and short announcement that admins publish to online holders.
ALTER TABLE master ADD COLUMN documents_url VARCHAR(500) NULL, ADD COLUMN announcement VARCHAR(500) NULL;

-- Voting state + convert support
ALTER TABLE termpartner
  ADD COLUMN status ENUM('pending','open','closed') NOT NULL DEFAULT 'pending' AFTER open;

ALTER TABLE regissub
  ADD COLUMN voted TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN voted_at DATETIME NULL,
  ADD COLUMN voted_by VARCHAR(50) NULL;

ALTER TABLE regismaim
  ADD COLUMN proxy_name VARCHAR(255) NULL,
  ADD COLUMN source ENUM('onsite','converted') NOT NULL DEFAULT 'onsite';

ALTER TABLE regisgroup
  ADD COLUMN group_code VARCHAR(10) NULL;

CREATE TABLE regisgroup_member (
  id_group     INT NOT NULL,
  id_acc       VARCHAR(25) NOT NULL,
  shares       INT NOT NULL,
  PRIMARY KEY (id_group, id_acc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE useradmin ADD COLUMN active TINYINT NOT NULL DEFAULT 1;
ALTER TABLE master ADD COLUMN online_enabled TINYINT NOT NULL DEFAULT 1,
                   ADD COLUMN quorum_pct DECIMAL(5,2) NOT NULL DEFAULT 33.33;

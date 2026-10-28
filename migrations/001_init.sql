-- E-AGM initial schema (MySQL 8, InnoDB, utf8mb4)
-- Based on Eregist DATA_STRUCTURE.md; transactional tables carry meeting_year.

CREATE TABLE master (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  codemaster   VARCHAR(4) NOT NULL UNIQUE,
  detailmaster VARCHAR(255),
  datemaster   VARCHAR(80),
  updmaster    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at    DATETIME NULL            -- NULL = active, set = locked (read-only)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE holder (
  Account_id   VARCHAR(15) NOT NULL PRIMARY KEY,
  security     VARCHAR(5),
  Holder_type  VARCHAR(1),
  Q_share      INT,
  I_title      VARCHAR(3),
  N_title      VARCHAR(50),
  N_first      VARCHAR(150),
  N_last       VARCHAR(255),
  A_holder     VARCHAR(255),
  I_zip        VARCHAR(7),
  H_phone      VARCHAR(100),
  W_phone      VARCHAR(50),
  M_phone      VARCHAR(50),
  I_Fax        VARCHAR(29),
  I_Email      VARCHAR(100),
  C_tax        VARCHAR(1),
  I_tax        VARCHAR(50),
  Tax_rate     VARCHAR(9),
  I_natve      VARCHAR(5),
  I_occupation VARCHAR(50),
  Codebank     VARCHAR(5),
  Account      VARCHAR(50),
  Parti        VARCHAR(5),
  Reftype      VARCHAR(3),
  I_ref        VARCHAR(50),
  S_mail       VARCHAR(50),
  Year_do      VARCHAR(5),
  INDEX idx_name (N_first)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE termpartner (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  meeting_year  VARCHAR(4) NOT NULL,
  term_id       VARCHAR(5) NOT NULL,
  term_name     VARCHAR(255),
  term_name_en  VARCHAR(255),
  closevote     DATETIME NULL,
  watermark     VARCHAR(1) DEFAULT '0',
  relateshare   INT DEFAULT 0,
  countshare    INT DEFAULT 0,
  open          VARCHAR(1) DEFAULT '0',
  statusprint   ENUM('on','off') DEFAULT 'off',
  UNIQUE KEY uq_year_term (meeting_year, term_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE regisgroup (
  id_group     INT AUTO_INCREMENT PRIMARY KEY,
  meeting_year VARCHAR(4) NOT NULL,
  id_acc       VARCHAR(15) NOT NULL,
  name_group   VARCHAR(255),
  totle_regis  INT,
  upd_addgroup TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE regismaim (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  meeting_year VARCHAR(4) NOT NULL,
  id_acc       VARCHAR(25) NOT NULL,
  name_regis   VARCHAR(255),
  mq_share     INT,
  group_regis  VARCHAR(50),
  group_type   VARCHAR(100),            -- '0' person, '1' proxy, or group name
  admin_regist VARCHAR(50),
  upd_regis    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_year_acc (meeting_year, id_acc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- onsite votes. NOTE: disagree_term = shares voting AGAINST (legacy column was agree_term)
CREATE TABLE regissub (
  meeting_year  VARCHAR(4) NOT NULL,
  id_term       INT NOT NULL,
  id_acc        VARCHAR(25) NOT NULL,
  disagree_term INT DEFAULT 0,
  noc_term      INT DEFAULT 0,
  full_term     INT DEFAULT 0,
  fail_term     INT DEFAULT 0,
  time_regis    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_term, id_acc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE novote (
  id_novote    INT AUTO_INCREMENT PRIMARY KEY,
  meeting_year VARCHAR(4) NOT NULL,
  id_term      VARCHAR(5),
  acc_novote   VARCHAR(30),
  name_novote  VARCHAR(100),
  share_novote INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE holderlate (
  HLKey        INT AUTO_INCREMENT PRIMARY KEY,
  meeting_year VARCHAR(4) NOT NULL,
  AccID        VARCHAR(29) NOT NULL,
  TermID       VARCHAR(5),
  CoopQty      DOUBLE,
  LastDate     DATETIME,
  UNIQUE KEY uq_year_acc (meeting_year, AccID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE useradmin (
  ida      INT AUTO_INCREMENT PRIMARY KEY,
  Fullname VARCHAR(80),
  usr      VARCHAR(20) NOT NULL UNIQUE,
  pws_hash VARCHAR(100) NOT NULL,       -- bcrypt
  Part     VARCHAR(100),
  role     ENUM('admin','staff') NOT NULL DEFAULT 'staff'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE online_registration (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  acc_id           VARCHAR(15) NOT NULL,
  meeting_year     VARCHAR(4) NOT NULL,
  id_card_hash     VARCHAR(64) NOT NULL,
  phone            VARCHAR(50),
  email            VARCHAR(100),
  otp_code         VARCHAR(64),
  otp_expires_at   DATETIME,
  otp_verified     TINYINT DEFAULT 0,
  token            VARCHAR(64),
  token_expires_at DATETIME,
  ip_address       VARCHAR(45),
  registered_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  status           ENUM('pending','verified','voted','cancelled') DEFAULT 'pending',
  INDEX idx_acc (acc_id), INDEX idx_token (token), INDEX idx_year (meeting_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE votes_online (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  online_reg_id INT NOT NULL,
  acc_id        VARCHAR(15) NOT NULL,
  term_id       VARCHAR(5) NOT NULL,
  vote_choice   ENUM('agree','disagree','abstain','spoiled') NOT NULL,
  voted_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address    VARCHAR(45),
  meeting_year  VARCHAR(4) NOT NULL,
  UNIQUE KEY uq_year_acc_term (meeting_year, acc_id, term_id),
  INDEX idx_term (term_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  acc_id       VARCHAR(15),
  action       VARCHAR(50) NOT NULL,
  detail       TEXT,
  ip_address   VARCHAR(45),
  user_agent   VARCHAR(255),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  meeting_year VARCHAR(4),
  INDEX idx_acc (acc_id), INDEX idx_action (action), INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

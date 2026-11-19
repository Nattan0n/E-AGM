-- New shareholder flow: log in with the User (Account ID) + an OTP sent to the contacts on file; PDPA consent and the
-- vote method are given after the first login of the year. Requests for a User that need checking go to OMD.

-- Login no longer asks for the ID card, so the hash is optional. consent_at = PDPA accepted (registration done).
ALTER TABLE online_registration MODIFY id_card_hash VARCHAR(64) NULL;
ALTER TABLE online_registration ADD COLUMN consent_at DATETIME NULL AFTER vote_mode;
UPDATE online_registration SET consent_at = registered_at WHERE consent_at IS NULL AND status IN ('verified','voted');

-- Requests for a User that OMD must review (flow page 1 / 17):
--   contact   = found in the register but no e-mail / mobile on file; the holder entered one and confirmed it by OTP
--   not_found = ID card not in the register (not on the book-closing list); documents attached for OMD to check with STC
CREATE TABLE user_request (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  meeting_year     VARCHAR(4),
  kind             ENUM('contact','not_found') NOT NULL,
  acc_ids          VARCHAR(255) NULL,          -- matched account ids (comma separated), empty for not_found
  id_card          VARCHAR(50) NOT NULL,       -- as typed (digits); OMD needs it to check with STC. PDPA-sensitive.
  full_name        VARCHAR(255) NULL,
  phone            VARCHAR(50) NULL,
  email            VARCHAR(100) NULL,
  otp_channel      ENUM('sms','email') NULL,
  otp_code         VARCHAR(64) NULL,
  otp_expires_at   DATETIME NULL,
  otp_attempts     TINYINT NOT NULL DEFAULT 0,
  note             VARCHAR(500) NULL,
  ticket_hash      VARCHAR(64) NOT NULL,       -- the browser holds the ticket that lets it continue this request
  status           ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
  reason           VARCHAR(255) NULL,
  reviewed_by      VARCHAR(50) NULL,
  reviewed_at      DATETIME NULL,
  ip_address       VARCHAR(45),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at     DATETIME NULL,
  INDEX idx_status (status), INDEX idx_card (id_card)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_request_file (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  request_id   INT NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size         INT NOT NULL,
  data         MEDIUMBLOB NOT NULL,
  uploaded_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_req (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

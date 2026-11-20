-- OMD Review of User requests (flow page 17): OMD checks the request, calls the holder back, then approves (the
-- confirmed contact becomes the holder's channel for the OTP) or rejects with a reason.

-- Holders whose total shares reach this need a second approver (a different staff member). 0 = off.
ALTER TABLE master ADD COLUMN review_dual_shares BIGINT NOT NULL DEFAULT 0;

ALTER TABLE user_request
  ADD COLUMN call_note   VARCHAR(500) NULL,
  ADD COLUMN called_by   VARCHAR(100) NULL,
  ADD COLUMN called_at   DATETIME NULL,
  ADD COLUMN approve_acc VARCHAR(255) NULL,   -- accounts the User is bound to (chosen by OMD)
  ADD COLUMN first_by_id INT NULL,            -- first approver when two are needed
  ADD COLUMN first_by    VARCHAR(100) NULL,
  ADD COLUMN first_at    DATETIME NULL,
  ADD COLUMN notified_at DATETIME NULL,
  MODIFY reviewed_by VARCHAR(100) NULL;

-- Contacts approved by OMD. The register (holder) is never overwritten: login reads the register first and falls back
-- to these (ID card that differs from the register, or no e-mail / mobile on file).
CREATE TABLE holder_contact (
  account_id  VARCHAR(15) NOT NULL PRIMARY KEY,
  id_card     VARCHAR(50) NOT NULL,             -- digits
  phone       VARCHAR(50) NULL,
  email       VARCHAR(100) NULL,
  request_id  INT NOT NULL,
  approved_by VARCHAR(255) NULL,
  approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_card (id_card)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

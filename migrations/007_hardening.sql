-- Atomic OTP attempt counter (replaces counting otp_fail rows in audit_log).
ALTER TABLE online_registration ADD COLUMN otp_attempts TINYINT NOT NULL DEFAULT 0 AFTER otp_verified;

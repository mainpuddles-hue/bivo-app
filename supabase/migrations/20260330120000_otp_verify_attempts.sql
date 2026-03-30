-- Add verify_attempts column to otp_codes for brute-force protection
-- Tracks how many times verification was attempted against each OTP record
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS verify_attempts integer NOT NULL DEFAULT 0;

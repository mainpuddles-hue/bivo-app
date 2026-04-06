-- Applied to production 2026-04-06
-- Automatic data cleanup via pg_cron

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Deactivate expired posts every 15 minutes
CREATE OR REPLACE FUNCTION deactivate_expired_posts()
RETURNS void AS $$
BEGIN
  UPDATE posts SET is_active = false
  WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule('deactivate-expired-posts', '*/15 * * * *', 'SELECT deactivate_expired_posts()');

-- Clean up expired OTP codes every hour
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule('cleanup-expired-otps', '0 * * * *', 'SELECT cleanup_expired_otps()');

-- Applied to production 2026-04-06
-- Fixes from Supabase Database Advisors

-- ERROR: steep_targets missing RLS
ALTER TABLE steep_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS select_steep_targets ON steep_targets FOR SELECT USING (true);

-- WARN: duplicate indexes
DROP INDEX IF EXISTS idx_notifications_user_read;
DROP INDEX IF EXISTS user_interactions_user_idx;

-- WARN: function search_path mutable (security)
ALTER FUNCTION deactivate_expired_posts() SET search_path = public;
ALTER FUNCTION cleanup_expired_otps() SET search_path = public;
ALTER FUNCTION increment_points(UUID, INT) SET search_path = public;
ALTER FUNCTION increment_field(TEXT, TEXT, UUID, INT) SET search_path = public;
ALTER FUNCTION decrement_boost_balance(UUID) SET search_path = public;
ALTER FUNCTION check_event_capacity() SET search_path = public;
ALTER FUNCTION check_booking_overlap() SET search_path = public;
ALTER FUNCTION get_monthly_leaderboard(TIMESTAMPTZ, TEXT, INT) SET search_path = public;

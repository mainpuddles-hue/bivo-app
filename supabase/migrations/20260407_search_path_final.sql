-- Applied to production 2026-04-07
-- Fix remaining function search_path warnings + mv access

ALTER FUNCTION cleanup_old_city_events() SET search_path = public;
ALTER FUNCTION delete_user_account() SET search_path = public;
ALTER FUNCTION match_posts(vector, double precision, integer, text) SET search_path = public;
ALTER FUNCTION calculate_trust_score(uuid) SET search_path = public;
ALTER FUNCTION check_post_rate_limit() SET search_path = public;
ALTER FUNCTION check_message_rate_limit() SET search_path = public;
ALTER FUNCTION check_review_rate_limit() SET search_path = public;
ALTER FUNCTION handle_new_user() SET search_path = public;
ALTER FUNCTION update_updated_at() SET search_path = public;
ALTER FUNCTION get_personalized_feed(uuid, integer, integer) SET search_path = public;
ALTER FUNCTION get_conversations_with_details(uuid) SET search_path = public;
ALTER FUNCTION activate_stuck_posts() SET search_path = public;
ALTER FUNCTION retry_failed_webhooks() SET search_path = public;
ALTER FUNCTION refresh_materialized_views() SET search_path = public;
ALTER FUNCTION cleanup_old_analytics() SET search_path = public;
ALTER FUNCTION audit_critical_changes() SET search_path = public;

-- Restrict materialized view access
REVOKE SELECT ON mv_leaderboard FROM anon;

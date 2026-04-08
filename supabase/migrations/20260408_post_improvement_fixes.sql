-- Applied to production 2026-04-08
-- Post-improvement audit fixes

-- INSERT policies for service-role tables
CREATE POLICY IF NOT EXISTS "insert_audit" ON audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');
CREATE POLICY IF NOT EXISTS "insert_ef_errors" ON edge_function_errors FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY IF NOT EXISTS "insert_scheduled" ON scheduled_notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');
CREATE POLICY IF NOT EXISTS "insert_webhooks" ON webhook_events FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Restrict materialized views from anon
REVOKE SELECT ON mv_revenue_monthly FROM anon;
REVOKE SELECT ON mv_user_growth FROM anon;

-- Fix function search_paths for new functions
ALTER FUNCTION auto_escalate_reports() SET search_path = public;
ALTER FUNCTION schedule_booking_reminder() SET search_path = public;
ALTER FUNCTION schedule_event_reminder() SET search_path = public;
ALTER FUNCTION process_scheduled_notifications() SET search_path = public;
ALTER FUNCTION schedule_reengagement_notifications() SET search_path = public;
ALTER FUNCTION cleanup_old_ef_errors() SET search_path = public;
ALTER FUNCTION find_neighborhood(double precision, double precision) SET search_path = public;

-- Applied to production 2026-04-07
-- Database improvements: search, audit, webhooks, views, cleanup

-- 1. FULL-TEXT SEARCH (pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm ON posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_description_trgm ON posts USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON profiles USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_forum_posts_title_trgm ON forum_posts USING gin (title gin_trgm_ops);

-- 2. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_audit" ON audit_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_read_own_audit" ON audit_log FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION audit_critical_changes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_critical_changes();
CREATE TRIGGER audit_profiles_ban AFTER UPDATE ON profiles
  FOR EACH ROW WHEN (OLD.is_banned IS DISTINCT FROM NEW.is_banned)
  EXECUTE FUNCTION audit_critical_changes();

-- 3. WEBHOOK RETRY QUEUE
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_webhooks" ON webhook_events FOR ALL USING (auth.role() = 'service_role');

SELECT cron.schedule('retry-webhooks', '*/5 * * * *', 'SELECT retry_failed_webhooks()');

-- 4. MATERIALIZED VIEW: Leaderboard
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leaderboard AS
SELECT p.id, p.name, p.avatar_url, p.naapurusto, p.total_points,
  RANK() OVER (ORDER BY p.total_points DESC) as rank
FROM profiles p WHERE p.total_points > 0
ORDER BY p.total_points DESC LIMIT 100;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_leaderboard_id ON mv_leaderboard(id);

SELECT cron.schedule('refresh-views', '*/15 * * * *', 'SELECT refresh_materialized_views()');

-- 5. ANALYTICS CLEANUP
CREATE INDEX IF NOT EXISTS idx_analytics_events_date ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_date ON notifications(created_at DESC);

SELECT cron.schedule('cleanup-analytics', '0 3 * * 0', 'SELECT cleanup_old_analytics()');

-- 6. HTTP extension for embedding generation
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

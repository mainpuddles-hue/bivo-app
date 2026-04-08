-- Report escalation: add tracking columns
ALTER TABLE reports ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'low';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Auto-escalate: if same post gets 3+ reports, auto-hide
CREATE OR REPLACE FUNCTION auto_escalate_reports()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM reports
  WHERE post_id = NEW.post_id AND status = 'pending';

  IF v_count >= 3 THEN
    -- Auto-hide the post
    UPDATE posts SET is_active = false WHERE id = NEW.post_id;
    -- Escalate severity
    UPDATE reports SET severity = 'high' WHERE post_id = NEW.post_id AND status = 'pending';
    -- Create notification for admin
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT id, 'admin_alert', 'Post auto-hidden (3+ reports)',
      'A post was automatically hidden due to multiple reports.',
      jsonb_build_object('post_id', NEW.post_id)
    FROM profiles WHERE is_admin = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS report_escalation ON reports;
CREATE TRIGGER report_escalation
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION auto_escalate_reports();

-- Monthly revenue view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_revenue_monthly AS
SELECT
  date_trunc('month', created_at) as month,
  count(*) as transactions,
  sum(amount) as total_revenue,
  avg(amount) as avg_transaction
FROM payments
WHERE status IN ('completed', 'paid')
GROUP BY date_trunc('month', created_at)
ORDER BY month DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_revenue_month ON mv_revenue_monthly(month);

-- User growth view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_growth AS
SELECT
  date_trunc('week', created_at) as week,
  count(*) as new_users,
  sum(count(*)) OVER (ORDER BY date_trunc('week', created_at)) as cumulative_users
FROM profiles
GROUP BY date_trunc('week', created_at)
ORDER BY week DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_growth_week ON mv_user_growth(week);

-- Update refresh function to include new views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_monthly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_growth;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

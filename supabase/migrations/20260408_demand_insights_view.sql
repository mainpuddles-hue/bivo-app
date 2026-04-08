-- Most needed categories based on "tarvitsen" posts
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_demand_insights AS
SELECT
  unnest(tags) as tag,
  count(*) as demand_count,
  max(created_at) as latest
FROM posts
WHERE type = 'tarvitsen'
  AND is_active = true
  AND created_at > now() - interval '30 days'
GROUP BY unnest(tags)
ORDER BY demand_count DESC
LIMIT 20;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_demand_tag ON mv_demand_insights(tag);

-- Update refresh_materialized_views() to include demand insights
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_monthly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_growth;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demand_insights;
EXCEPTION WHEN OTHERS THEN
  -- If any individual view fails (e.g. doesn't exist yet), log and continue
  RAISE WARNING 'refresh_materialized_views: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant read access for anonymous and authenticated users
GRANT SELECT ON mv_demand_insights TO anon, authenticated;

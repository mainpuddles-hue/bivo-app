-- Applied to production 2026-04-06
-- Monthly leaderboard RPC (was missing — code had fallback to all-time)

CREATE OR REPLACE FUNCTION get_monthly_leaderboard(
  p_month_start TIMESTAMPTZ,
  p_neighborhood TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(user_id UUID, name TEXT, avatar_url TEXT, naapurusto TEXT, month_points BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.user_id,
    p.name,
    p.avatar_url,
    p.naapurusto,
    SUM(up.points)::BIGINT as month_points
  FROM user_points up
  JOIN profiles p ON p.id = up.user_id
  WHERE up.created_at >= p_month_start
    AND (p_neighborhood IS NULL OR p.naapurusto = p_neighborhood)
  GROUP BY up.user_id, p.name, p.avatar_url, p.naapurusto
  ORDER BY month_points DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

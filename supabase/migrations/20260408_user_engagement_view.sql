-- Engagement score per user (auto-refreshed with leaderboard)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_engagement AS
SELECT
  p.id as user_id,
  p.name,
  p.naapurusto,
  coalesce(posts.cnt, 0) as post_count,
  coalesce(likes.cnt, 0) as likes_received,
  coalesce(comments.cnt, 0) as comments_received,
  coalesce(helps.cnt, 0) as helps_given,
  (coalesce(posts.cnt, 0) * 2 + coalesce(likes.cnt, 0) + coalesce(comments.cnt, 0) * 3 + coalesce(helps.cnt, 0) * 5) as engagement_score
FROM profiles p
LEFT JOIN (SELECT user_id, count(*) as cnt FROM posts WHERE is_active = true GROUP BY user_id) posts ON posts.user_id = p.id
LEFT JOIN (SELECT p2.user_id, count(*) as cnt FROM post_likes pl JOIN posts p2 ON pl.post_id = p2.id GROUP BY p2.user_id) likes ON likes.user_id = p.id
LEFT JOIN (SELECT p3.user_id, count(*) as cnt FROM post_comments pc JOIN posts p3 ON pc.post_id = p3.id GROUP BY p3.user_id) comments ON comments.user_id = p.id
LEFT JOIN (SELECT from_user_id as user_id, count(*) as cnt FROM thanks GROUP BY from_user_id) helps ON helps.user_id = p.id
WHERE coalesce(posts.cnt, 0) + coalesce(likes.cnt, 0) + coalesce(comments.cnt, 0) + coalesce(helps.cnt, 0) > 0
ORDER BY engagement_score DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_engagement_user ON mv_user_engagement(user_id);

-- Update refresh function to include mv_user_engagement
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_monthly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_growth;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demand_insights;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_engagement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

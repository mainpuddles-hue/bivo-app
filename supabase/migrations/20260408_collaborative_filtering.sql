-- Collaborative filtering: "Users who liked similar posts" recommendation function
CREATE OR REPLACE FUNCTION get_collaborative_recommendations(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(post_id UUID, score FLOAT) AS $$
BEGIN
  RETURN QUERY
  -- Find posts liked by users who liked the same posts as p_user_id
  WITH my_likes AS (
    SELECT pl.post_id FROM post_likes pl WHERE pl.user_id = p_user_id
  ),
  similar_users AS (
    SELECT pl.user_id, count(*) as overlap
    FROM post_likes pl
    JOIN my_likes ml ON pl.post_id = ml.post_id
    WHERE pl.user_id != p_user_id
    GROUP BY pl.user_id
    HAVING count(*) >= 2
    ORDER BY overlap DESC
    LIMIT 20
  ),
  recommended AS (
    SELECT pl.post_id, sum(su.overlap)::float as score
    FROM post_likes pl
    JOIN similar_users su ON pl.user_id = su.user_id
    WHERE pl.post_id NOT IN (SELECT post_id FROM my_likes)
    GROUP BY pl.post_id
  )
  SELECT r.post_id, r.score
  FROM recommended r
  JOIN posts p ON p.id = r.post_id
  WHERE p.is_active = true AND (p.expires_at IS NULL OR p.expires_at > now())
  ORDER BY r.score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

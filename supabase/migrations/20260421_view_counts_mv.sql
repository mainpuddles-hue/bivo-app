-- Materialized view for post view counts (7-day window)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_post_view_counts AS
SELECT post_id, COUNT(DISTINCT user_id)::INT as unique_views
FROM post_views
WHERE viewed_at > now() - interval '7 days'
GROUP BY post_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_post_view_counts_post
  ON mv_post_view_counts(post_id);

-- Batch RPC: get view counts for multiple posts at once
CREATE OR REPLACE FUNCTION get_post_view_counts_batch(p_post_ids UUID[])
RETURNS TABLE(post_id UUID, view_count INT) AS $$
  SELECT post_id, unique_views as view_count
  FROM mv_post_view_counts
  WHERE post_id = ANY(p_post_ids)
    AND unique_views > 2;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_post_view_counts_batch(UUID[]) TO authenticated;

-- Update refresh function to include new MV
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_post_view_counts;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'refresh_materialized_views: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add match_count to saved_searches if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_searches' AND column_name = 'match_count'
  ) THEN
    ALTER TABLE saved_searches ADD COLUMN match_count INT DEFAULT 0;
  END IF;
END $$;

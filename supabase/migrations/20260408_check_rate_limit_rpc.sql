-- DB-level rate limiting RPC
-- Checks user_points table for recent actions within a sliding window.
-- Returns TRUE if the user is under the limit, FALSE if rate-limited.

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_count INT DEFAULT 5,
  p_window_minutes INT DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM user_points
  WHERE user_id = p_user_id
    AND action = p_action
    AND created_at > now() - (p_window_minutes || ' minutes')::interval;

  RETURN v_count < p_max_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

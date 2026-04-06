-- Applied to production 2026-04-06
-- Prevents double-submit: same user + same title within 60 seconds

CREATE OR REPLACE FUNCTION check_duplicate_post()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM posts
  WHERE user_id = NEW.user_id
    AND title = NEW.title
    AND is_active = true
    AND created_at > now() - interval '60 seconds';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Duplicate post detected (same title within 60 seconds)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS prevent_duplicate_post ON posts;
CREATE TRIGGER prevent_duplicate_post
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION check_duplicate_post();

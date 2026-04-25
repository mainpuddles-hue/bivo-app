-- Follower notification trigger
-- When a user creates a new post, notify all their followers
-- Skips seed posts (is_seed = true) and inactive posts

CREATE OR REPLACE FUNCTION notify_followers()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, from_user_id, type, title, body, link_type, link_id)
  SELECT
    uf.follower_id,
    NEW.user_id,
    'new_post',
    'Uusi ilmoitus seuraamaltasi',
    COALESCE(LEFT(NEW.title, 100), ''),
    'post',
    NEW.id
  FROM user_follows uf
  WHERE uf.following_id = NEW.user_id
    -- Don't notify yourself
    AND uf.follower_id != NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_post_created_notify_followers
AFTER INSERT ON posts
FOR EACH ROW
WHEN (NEW.is_active = true AND NEW.is_seed IS NOT TRUE)
EXECUTE FUNCTION notify_followers();

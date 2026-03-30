-- ============================================================
-- Server-side rate limiting triggers + disposable email blocklist
-- Replaces client-side-only AsyncStorage rate limits
-- ============================================================

-- Post creation rate limit: max 10 per hour
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM posts WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 10 posts per hour';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER post_rate_limit_trigger
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION check_post_rate_limit();

-- Message rate limit: max 100 per hour
CREATE OR REPLACE FUNCTION check_message_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM messages WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 hour') >= 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 100 messages per hour';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER message_rate_limit_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION check_message_rate_limit();

-- Review rate limit: max 5 per day
CREATE OR REPLACE FUNCTION check_review_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM reviews WHERE reviewer_id = NEW.reviewer_id AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 5 reviews per day';
  END IF;
  -- Prevent self-review
  IF NEW.reviewer_id = NEW.reviewed_id THEN
    RAISE EXCEPTION 'Cannot review yourself';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER review_rate_limit_trigger
  BEFORE INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION check_review_rate_limit();

-- Add unique constraint for reviews to prevent duplicates at DB level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_unique_pair'
  ) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_unique_pair UNIQUE (reviewer_id, reviewed_id);
  END IF;
EXCEPTION WHEN others THEN
  -- Constraint may already exist or table structure differs
  NULL;
END $$;

-- Disposable email domain blocklist table
CREATE TABLE IF NOT EXISTS blocked_email_domains (
  domain TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with common disposable email domains
INSERT INTO blocked_email_domains (domain) VALUES
  ('guerrillamail.com'), ('guerrillamail.de'), ('guerrillamail.net'),
  ('tempmail.com'), ('temp-mail.org'), ('throwaway.email'),
  ('mailinator.com'), ('yopmail.com'), ('sharklasers.com'),
  ('guerrillamailblock.com'), ('grr.la'), ('dispostable.com'),
  ('maildrop.cc'), ('10minutemail.com'), ('trashmail.com'),
  ('tempail.com'), ('fakeinbox.com'), ('mailnesia.com'),
  ('tempr.email'), ('discard.email'), ('discardmail.com'),
  ('mohmal.com'), ('getnada.com')
ON CONFLICT DO NOTHING;

ALTER TABLE blocked_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read blocked domains" ON blocked_email_domains FOR SELECT USING (true);

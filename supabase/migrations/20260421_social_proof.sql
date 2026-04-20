-- Sprint O: Social Proof + Offer Button
-- Tables: post_views (view tracking), offers (negotiation)

-- ═══ post_views ═══
CREATE TABLE IF NOT EXISTS post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT now()
);

-- Unique per user per post (one view record per user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_views_unique
  ON post_views(post_id, user_id);

-- Fast count query
CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);

-- RLS
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a view (including anon for future), users see own views
CREATE POLICY "insert_post_views" ON post_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "select_own_views" ON post_views
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can read all (for materialized view refresh)
-- (service_role bypasses RLS by default)

-- ═══ offers ═══
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'withdrawn')),
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One pending offer per user per post
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_active
  ON offers(post_id, from_user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_offers_post ON offers(post_id);
CREATE INDEX IF NOT EXISTS idx_offers_to_user ON offers(to_user_id);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_participants" ON offers
  FOR ALL USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Function to get view count for a post (last 7 days, distinct users)
CREATE OR REPLACE FUNCTION get_post_view_count(p_post_id UUID)
RETURNS INT AS $$
  SELECT COUNT(DISTINCT user_id)::INT
  FROM post_views
  WHERE post_id = p_post_id
    AND viewed_at > now() - interval '7 days';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

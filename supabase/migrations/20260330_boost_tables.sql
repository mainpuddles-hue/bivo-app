-- Boost credit balance per user
CREATE TABLE IF NOT EXISTS user_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'business')),
  monthly_grants_remaining INT NOT NULL DEFAULT 0,
  last_grant_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own boosts" ON user_boosts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages boosts" ON user_boosts FOR ALL USING (auth.role() = 'service_role');

-- Purchase audit log
CREATE TABLE IF NOT EXISTS boost_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'sandbox')),
  product_id TEXT NOT NULL,
  credits_granted INT NOT NULL,
  price_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  receipt_data TEXT,
  transaction_id TEXT UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE boost_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own purchases" ON boost_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages purchases" ON boost_purchases FOR ALL USING (auth.role() = 'service_role');

-- Active post boosts
CREATE TABLE IF NOT EXISTS post_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boost_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  boost_end TIMESTAMPTZ NOT NULL,
  boost_type TEXT NOT NULL DEFAULT 'standard' CHECK (boost_type IN ('standard', 'extended')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_boosts_active ON post_boosts (post_id, is_active) WHERE is_active = true;
CREATE INDEX idx_post_boosts_end ON post_boosts (boost_end) WHERE is_active = true;

ALTER TABLE post_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active boosts" ON post_boosts FOR SELECT USING (is_active = true);
CREATE POLICY "Users read own boosts" ON post_boosts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages post_boosts" ON post_boosts FOR ALL USING (auth.role() = 'service_role');

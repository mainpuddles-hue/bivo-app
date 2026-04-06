-- Applied to production 2026-04-06
-- Final sweep: missing DELETE/INSERT policies + feature flag seeds

-- post_boosts: missing all write policies
CREATE POLICY IF NOT EXISTS insert_post_boosts ON post_boosts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS delete_post_boosts ON post_boosts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS update_post_boosts ON post_boosts FOR UPDATE USING (auth.uid() = user_id);

-- user_boosts: missing DELETE (account deletion)
CREATE POLICY IF NOT EXISTS delete_user_boosts ON user_boosts FOR DELETE USING (auth.uid() = user_id);

-- user_points: missing DELETE (account deletion)
CREATE POLICY IF NOT EXISTS delete_user_points ON user_points FOR DELETE USING (auth.uid() = user_id);

-- Seed feature flags with app defaults
INSERT INTO feature_flags (key, enabled) VALUES
  ('LENDING', false),
  ('GRAB', true),
  ('PAYMENTS', false),
  ('PRO_SUBSCRIPTION', false),
  ('BUSINESS_ACCOUNT', false),
  ('AD_CAMPAIGNS', false),
  ('IDENTITY_VERIFICATION', false),
  ('EVENTS_TAPAHTUMA_TYPE', true),
  ('BOOSTS', true)
ON CONFLICT (key) DO NOTHING;

-- Applied to production 2026-04-06
-- Fix: user_follows INSERT policy used wrong column name

-- OLD: WITH CHECK (auth.uid() = follower_id AND auth.uid() <> following_id)
-- Code inserts followed_id, NOT following_id → policy always rejected!
-- Follow feature was completely broken.

DROP POLICY IF EXISTS "Users can follow others" ON user_follows;
CREATE POLICY "Users can follow others" ON user_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id AND auth.uid() <> followed_id);

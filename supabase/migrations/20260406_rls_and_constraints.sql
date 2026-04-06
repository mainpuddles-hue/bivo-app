-- Applied to production 2026-04-06
-- Fixes: unique constraints, RLS policy gaps

-- user_follows: add correct unique constraint (code uses followed_id, not following_id)
ALTER TABLE user_follows ADD CONSTRAINT IF NOT EXISTS
  user_follows_follower_followed_unique UNIQUE (follower_id, followed_id);

-- payments: restrict SELECT to buyer/seller only (was public!)
DROP POLICY IF EXISTS read_payments ON payments;
CREATE POLICY read_own_payments ON payments FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS update_payments ON payments;
CREATE POLICY update_own_payments ON payments FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR auth.uid() = user_id);

-- notifications: allow INSERT (was missing — notifications couldn't be created!)
CREATE POLICY insert_notifications ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY delete_own_notifications ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TackBird Security & Data Integrity Migration
-- 2026-04-06
-- Fixes: event overbooking, points race condition, booking overlap,
--        forum RLS, conversations RLS, boost balance RPC
-- ============================================================

-- 1. EVENT OVERBOOKING PREVENTION (trigger-based)
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
  v_max INT;
BEGIN
  SELECT max_participants INTO v_max
  FROM community_events WHERE id = NEW.event_id;

  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
  FROM community_event_participants
  WHERE event_id = NEW.event_id AND status IN ('joined', 'approved');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Event is at capacity (% / %)', v_count, v_max;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS event_capacity_check ON community_event_participants;
CREATE TRIGGER event_capacity_check
  BEFORE INSERT ON community_event_participants
  FOR EACH ROW EXECUTE FUNCTION check_event_capacity();


-- 2. ATOMIC POINTS INCREMENT (prevents race condition)
CREATE OR REPLACE FUNCTION increment_points(user_id_param UUID, points_param INT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET total_points = COALESCE(total_points, 0) + points_param
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_field(
  table_name TEXT, field_name TEXT, row_id UUID, amount INT
)
RETURNS VOID AS $$
BEGIN
  IF table_name NOT IN ('profiles', 'user_boosts', 'posts', 'forum_posts', 'group_posts') THEN
    RAISE EXCEPTION 'Table % not allowed', table_name;
  END IF;
  IF field_name NOT IN ('total_points', 'balance', 'invite_count', 'like_count', 'comment_count', 'upvote_count', 'member_count') THEN
    RAISE EXCEPTION 'Field % not allowed', field_name;
  END IF;
  EXECUTE format(
    'UPDATE %I SET %I = COALESCE(%I, 0) + $1 WHERE id = $2',
    table_name, field_name, field_name
  ) USING amount, row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. BOOST BALANCE DECREMENT (atomic)
CREATE OR REPLACE FUNCTION decrement_boost_balance(p_user_id UUID)
RETURNS INT AS $$
DECLARE
  v_balance INT;
BEGIN
  UPDATE user_boosts
  SET balance = balance - 1, updated_at = now()
  WHERE user_id = p_user_id AND balance > 0
  RETURNING balance INTO v_balance;
  RETURN COALESCE(v_balance, -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. BOOKING DATE OVERLAP PREVENTION
CREATE OR REPLACE FUNCTION check_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_overlap INT;
BEGIN
  SELECT COUNT(*) INTO v_overlap
  FROM rental_bookings
  WHERE post_id = NEW.post_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status NOT IN ('cancelled', 'disputed', 'refunded')
    AND start_date < NEW.end_date
    AND end_date > NEW.start_date;

  IF v_overlap > 0 THEN
    RAISE EXCEPTION 'Booking dates overlap with existing rental';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_overlap_check ON rental_bookings;
CREATE TRIGGER booking_overlap_check
  BEFORE INSERT OR UPDATE ON rental_bookings
  FOR EACH ROW EXECUTE FUNCTION check_booking_overlap();


-- 5. FORUM RLS POLICIES
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_forum_posts" ON forum_posts FOR SELECT USING (true);
CREATE POLICY "insert_own_forum_posts" ON forum_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_forum_posts" ON forum_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own_forum_posts" ON forum_posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "service_role_forum_posts" ON forum_posts FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_forum_replies" ON forum_replies FOR SELECT USING (true);
CREATE POLICY "insert_own_forum_replies" ON forum_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_forum_replies" ON forum_replies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own_forum_replies" ON forum_replies FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "service_role_forum_replies" ON forum_replies FOR ALL USING (auth.role() = 'service_role');


-- 6. CONVERSATIONS & MESSAGES RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_conversations" ON conversations
  FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "insert_conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "update_own_conversations" ON conversations
  FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "service_role_conversations" ON conversations
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_messages" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );
CREATE POLICY "insert_own_messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );
CREATE POLICY "update_own_messages" ON messages
  FOR UPDATE USING (auth.uid() = sender_id);
CREATE POLICY "service_role_messages" ON messages
  FOR ALL USING (auth.role() = 'service_role');

-- Performance indexes for high-frequency query patterns
-- Addresses: rate-limit trigger scans, feed pagination, conversation loads

-- Messages — most queried table in the app
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, is_read) WHERE is_read = false;

-- Notifications — fetched on every app open
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created ON notifications(user_id, created_at DESC);

-- Post likes — batch-fetched per feed page, used in collaborative filtering
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);

-- Saved posts — checked per feed page
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_id ON saved_posts(user_id);

-- Post comments — loaded on post detail
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id, created_at ASC);

-- Posts by user — used in rate-limit trigger and profile tab
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);

-- User interactions — analytics queries
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_post ON user_interactions(user_id, post_id, interaction_type);

-- Blocked users — fetched on every feed/conversation load
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);

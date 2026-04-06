-- Applied to production 2026-04-06
-- Fixes: Realtime not enabled, email template typo

-- Enable Realtime for tables with active subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS posts;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS forum_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS group_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS community_event_participants;

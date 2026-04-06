-- Applied to production 2026-04-06

-- Messages needs FULL replica identity for Realtime UPDATE filter (is_read)
ALTER TABLE messages REPLICA IDENTITY FULL;

-- CASCADE DELETE for child tables (prevents orphan rows)
ALTER TABLE forum_votes DROP CONSTRAINT IF EXISTS forum_votes_post_id_fkey;
ALTER TABLE forum_votes ADD CONSTRAINT forum_votes_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE;

ALTER TABLE forum_votes DROP CONSTRAINT IF EXISTS forum_votes_reply_id_fkey;
ALTER TABLE forum_votes ADD CONSTRAINT forum_votes_reply_id_fkey
  FOREIGN KEY (reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE;

ALTER TABLE post_comments DROP CONSTRAINT IF EXISTS post_comments_parent_id_fkey;
ALTER TABLE post_comments ADD CONSTRAINT post_comments_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE CASCADE;

-- Applied to production 2026-04-07
-- Fix: 3 columns used in .eq() filters but missing from DB

-- groups: code filters by is_public to show only public groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- forum_posts: code filters by neighborhood for local discussions
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS neighborhood TEXT;

-- content_flags: admin dashboard filters by reviewed status
ALTER TABLE content_flags ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;

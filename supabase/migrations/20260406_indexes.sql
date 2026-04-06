-- Applied to production 2026-04-06
-- Performance indexes for critical queries

-- user_follows: code queries by followed_id (was only indexed on following_id)
CREATE INDEX IF NOT EXISTS idx_follows_followed ON user_follows(followed_id);

-- posts: location-based map queries
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- community_events: date-based queries for active events
CREATE INDEX IF NOT EXISTS idx_community_events_date ON community_events(event_date)
  WHERE is_active = true;

-- rental_bookings: overlap check trigger performance
CREATE INDEX IF NOT EXISTS idx_rental_bookings_post_dates ON rental_bookings(post_id, start_date, end_date)
  WHERE status NOT IN ('cancelled', 'refunded');

-- Applied to production 2026-04-06
-- Fixes: 20 missing columns across 8 tables

-- groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- rental_bookings
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS total_price NUMERIC;

-- reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS booking_id UUID;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS content TEXT;

-- activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 0;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS schedule JSONB;

-- advertisements
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS budget_cents INT;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS cta_url TEXT;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT 7;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS target_neighborhoods TEXT[];
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

-- saved_events
ALTER TABLE saved_events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'community';

-- service_bookings
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS service_date DATE;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS total_price NUMERIC;

-- user_badges
ALTER TABLE user_badges ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

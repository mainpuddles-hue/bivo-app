-- Applied to production 2026-04-06
-- Fixes: 14 more missing columns across 7 tables

-- forum_posts
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- forum_replies
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS parent_id UUID;

-- group_members
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

-- payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES profiles(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES profiles(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS details TEXT;

-- ad_impressions
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS impression_type TEXT DEFAULT 'view';

-- boost_purchases
ALTER TABLE boost_purchases ADD COLUMN IF NOT EXISTS credits INT DEFAULT 0;
ALTER TABLE boost_purchases ADD COLUMN IF NOT EXISTS receipt_valid BOOLEAN;
ALTER TABLE boost_purchases ADD COLUMN IF NOT EXISTS validation_details JSONB;

-- event_attendees
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

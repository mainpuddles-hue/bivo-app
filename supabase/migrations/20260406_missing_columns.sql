-- Applied to production 2026-04-06
-- Fixes: 5 missing columns that code references but DB didn't have

-- community_events: missing columns causing silent failures
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'event';
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS participant_count INT DEFAULT 0;
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- profiles: missing business_address
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_address TEXT;

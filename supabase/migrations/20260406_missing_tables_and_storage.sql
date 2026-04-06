-- Applied to production 2026-04-06
-- Fixes: 3 missing tables + 3 missing storage buckets

-- conversation_members: group chat membership
CREATE TABLE IF NOT EXISTS conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- feature_flags: remote feature toggles
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- country_configs: country-level settings
CREATE TABLE IF NOT EXISTS country_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  name TEXT,
  supported BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'
);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('event-images', 'event-images', true),
  ('business-images', 'business-images', true),
  ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO NOTHING;

-- City officials role for municipal employees
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_city_official boolean NOT NULL DEFAULT false;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_profiles_city_official ON profiles(is_city_official) WHERE is_city_official = true;

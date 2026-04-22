-- Buildings: one row per unique street address
CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street_address text NOT NULL,
  postal_code text,
  city text NOT NULL DEFAULT 'Helsinki',
  neighborhood text,
  lat double precision,
  lng double precision,
  member_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(street_address, city)
);

-- Index for geo queries and neighborhood lookup
CREATE INDEX idx_buildings_city_neighborhood ON buildings(city, neighborhood);
CREATE INDEX idx_buildings_coords ON buildings(lat, lng) WHERE lat IS NOT NULL;

-- User → building link (one building per user)
CREATE TABLE IF NOT EXISTS user_buildings (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES buildings ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_buildings_building ON user_buildings(building_id);

-- Add building_id to profiles for quick access
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings;

-- RLS policies
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_buildings ENABLE ROW LEVEL SECURITY;

-- Buildings: anyone authenticated can read, insert handled via function
CREATE POLICY "buildings_select" ON buildings FOR SELECT TO authenticated USING (true);
CREATE POLICY "buildings_insert" ON buildings FOR INSERT TO authenticated WITH CHECK (true);

-- User buildings: users can read all (to see neighbors), manage own
CREATE POLICY "user_buildings_select" ON user_buildings FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_buildings_insert" ON user_buildings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_buildings_update" ON user_buildings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_buildings_delete" ON user_buildings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Function: resolve or create building from address, link user
CREATE OR REPLACE FUNCTION resolve_building(
  p_street_address text,
  p_postal_code text DEFAULT NULL,
  p_city text DEFAULT 'Helsinki',
  p_neighborhood text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_building_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Find existing building
  SELECT id INTO v_building_id
  FROM buildings
  WHERE street_address = p_street_address AND city = p_city;

  -- Create if not found
  IF v_building_id IS NULL THEN
    INSERT INTO buildings (street_address, postal_code, city, neighborhood, lat, lng, member_count)
    VALUES (p_street_address, p_postal_code, p_city, p_neighborhood, p_lat, p_lng, 1)
    RETURNING id INTO v_building_id;
  ELSE
    -- Update member count
    UPDATE buildings SET member_count = member_count + 1 WHERE id = v_building_id;
  END IF;

  -- Link user (upsert)
  INSERT INTO user_buildings (user_id, building_id)
  VALUES (v_user_id, v_building_id)
  ON CONFLICT (user_id) DO UPDATE SET building_id = v_building_id, joined_at = now();

  -- Update profile
  UPDATE profiles SET building_id = v_building_id WHERE id = v_user_id;

  RETURN v_building_id;
END;
$$;

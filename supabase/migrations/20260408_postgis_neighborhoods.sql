-- PostGIS neighborhood boundaries
-- Prerequisites: PostGIS extension must be available
-- To check: SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') as has_postgis;
-- If PostGIS is NOT available, skip this migration.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column to city_neighborhoods for precise boundaries
ALTER TABLE city_neighborhoods ADD COLUMN IF NOT EXISTS boundary geometry(Polygon, 4326);
ALTER TABLE city_neighborhoods ADD COLUMN IF NOT EXISTS center_point geometry(Point, 4326);

-- Create spatial index
CREATE INDEX IF NOT EXISTS idx_neighborhoods_boundary ON city_neighborhoods USING gist (boundary);
CREATE INDEX IF NOT EXISTS idx_neighborhoods_center ON city_neighborhoods USING gist (center_point);

-- Function to find neighborhood by coordinates
CREATE OR REPLACE FUNCTION find_neighborhood(lat double precision, lng double precision)
RETURNS TEXT AS $$
  SELECT name FROM city_neighborhoods
  WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  LIMIT 1;
$$ LANGUAGE sql STABLE SET search_path = public;

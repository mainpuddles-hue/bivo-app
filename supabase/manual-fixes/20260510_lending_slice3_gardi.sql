-- Slice 3 of the lending feature: Gardi smart-locker pickup (mock-backed).
--
-- Adds the locker registry + assignment audit trail + the rental_bookings
-- columns needed to track which locker holds the item and what PIN unlocks
-- it. All changes are additive; existing bookings carry pickup_method =
-- 'address' or 'hub' and the new locker_* columns stay null for them.
--
-- Provider = 'mock' for now (locker-assign generates PINs in-house). When
-- the Gardi partnership is signed, slice 4 flips provider = 'gardi' and
-- routes the same logic through Gardi's REST API.

-- Locker registry. One row per physical locker location, multiple bookings
-- can reference the same locker over time. The (provider, external_id)
-- pair is unique — for 'mock' rows external_id is just our own UUID-string,
-- for 'gardi' rows it's whatever vendor ID Gardi gives us.
CREATE TABLE IF NOT EXISTS lockers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider      TEXT NOT NULL CHECK (provider IN ('mock','gardi')),
  external_id   TEXT NOT NULL,
  location_name TEXT NOT NULL,
  address       TEXT NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  size          TEXT CHECK (size IN ('s','m','l','xl')) DEFAULT 'm',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_lockers_active ON lockers(is_active, provider) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_lockers_geo ON lockers(lat, lng) WHERE is_active;

ALTER TABLE lockers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lockers_select_active ON lockers;
CREATE POLICY lockers_select_active ON lockers FOR SELECT USING (is_active);
-- INSERT/UPDATE/DELETE: service_role only (no client policy).

-- Per-booking locker columns. locker_id is the active assignment (the locker
-- holding the item right now). The four PIN-related columns track issued
-- PINs for the two directions independently — both can coexist for the
-- entire booking lifecycle (pickup PIN issued at lender drop, return PIN
-- issued at end-of-rental).
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS locker_id UUID REFERENCES lockers(id) ON DELETE SET NULL;
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS locker_provider TEXT
  CHECK (locker_provider IN ('mock','gardi'));
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS locker_pickup_pin TEXT;
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS locker_pickup_pin_expires_at TIMESTAMPTZ;
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS locker_dropoff_pin TEXT;
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS locker_dropoff_pin_expires_at TIMESTAMPTZ;

-- Audit table for every PIN issuance. Even after a PIN is voided / used /
-- replaced, the row remains so we can answer "when was this booking's PIN
-- generated and used?" forensically. The PIN itself is hashed (bcrypt) at
-- write time; pin_last4 is for UI ("ends in 23").
CREATE TABLE IF NOT EXISTS locker_assignments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id  UUID NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  locker_id   UUID NOT NULL REFERENCES lockers(id),
  direction   TEXT NOT NULL CHECK (direction IN ('pickup','return')),
  pin_hash    TEXT NOT NULL,
  pin_last4   TEXT NOT NULL,
  issued_at   TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  voided_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_locker_assignments_booking
  ON locker_assignments(booking_id);
CREATE INDEX IF NOT EXISTS idx_locker_assignments_active
  ON locker_assignments(locker_id, expires_at)
  WHERE used_at IS NULL AND voided_at IS NULL;

ALTER TABLE locker_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locker_assignments_select_participant ON locker_assignments;
CREATE POLICY locker_assignments_select_participant ON locker_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rental_bookings rb
      WHERE rb.id = booking_id
        AND (rb.borrower_id = auth.uid() OR rb.lender_id = auth.uid())
    )
  );
-- INSERT / UPDATE: service_role only (locker-assign / locker-mark-used
-- Edge Functions). No client policy.

-- Mock locker seed data. Six fake Helsinki locations so the Gardi-meeting
-- demo has a believable picker. Real Gardi lockers will be inserted via
-- the partnership-day import once the API contract is live.
INSERT INTO lockers (provider, external_id, location_name, address, lat, lng, size)
VALUES
  ('mock', 'mock-kamppi-1',    'Gardi Kamppi',     'Mannerheimintie 22, Helsinki',     60.1690, 24.9314, 'm'),
  ('mock', 'mock-kallio-1',    'Gardi Kallio',     'Hämeentie 12, Helsinki',           60.1830, 24.9520, 'l'),
  ('mock', 'mock-sornainen-1', 'Gardi Sörnäinen',  'Hämeentie 78, Helsinki',           60.1875, 24.9620, 'm'),
  ('mock', 'mock-punavuori-1', 'Gardi Punavuori',  'Iso Roobertinkatu 35, Helsinki',   60.1622, 24.9410, 's'),
  ('mock', 'mock-toolo-1',     'Gardi Töölö',      'Runeberginkatu 47, Helsinki',      60.1810, 24.9215, 'm'),
  ('mock', 'mock-kruununhaka', 'Gardi Kruununhaka','Liisankatu 10, Helsinki',          60.1722, 24.9620, 'l')
ON CONFLICT (provider, external_id) DO NOTHING;

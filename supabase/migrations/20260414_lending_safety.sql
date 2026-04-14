-- ============================================================================
-- Migration: Lending Safety Infrastructure
-- Date: 2026-04-14
-- Description: Adds deposit handling, condition photos, dispute resolution,
--              overdue tracking, and category-based deposit suggestions
--              for the TackBird lending/rental feature.
-- ============================================================================

-- ============================================================================
-- 1. Add safety columns to rental_bookings
-- ============================================================================

-- Deposit hold amount (pre-authorized via Stripe)
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0;

-- Deposit lifecycle status
-- - none: no deposit required or not yet initiated
-- - authorized: Stripe PaymentIntent created, funds held
-- - captured: deposit captured (e.g., damage claim accepted)
-- - released: deposit released back to borrower after clean return
-- - forfeited: deposit forfeited due to damage/loss/no-show
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS deposit_status TEXT DEFAULT 'none';

-- Add CHECK constraint separately so IF NOT EXISTS semantics work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_bookings_deposit_status_check'
  ) THEN
    ALTER TABLE rental_bookings
      ADD CONSTRAINT rental_bookings_deposit_status_check
      CHECK (deposit_status IN ('none', 'authorized', 'captured', 'released', 'forfeited'));
  END IF;
END $$;

-- Stripe PaymentIntent ID for the deposit authorization
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS stripe_deposit_intent_id TEXT;

-- When the item was actually returned (compared to end_date for late fees)
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS actual_return_date TIMESTAMPTZ;

-- Calculated late/penalty fees
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC DEFAULT 0;

-- Timestamp when overdue notification was sent (prevents duplicate notifications)
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

-- Dispute tracking
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

-- Dispute resolution status
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS dispute_resolution TEXT DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_bookings_dispute_resolution_check'
  ) THEN
    ALTER TABLE rental_bookings
      ADD CONSTRAINT rental_bookings_dispute_resolution_check
      CHECK (dispute_resolution IN ('none', 'pending', 'refund_full', 'refund_partial', 'hold_deposit', 'closed'));
  END IF;
END $$;


-- ============================================================================
-- 2. Booking condition photos table
--    Both lender and borrower photograph item at pickup and return.
--    Each party verifies the other's photos to confirm agreement on condition.
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('pickup', 'return')),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('lender', 'borrower')),
  image_url TEXT NOT NULL,
  verified_by_other BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup of photos by booking
CREATE INDEX IF NOT EXISTS idx_booking_photos_booking_id ON booking_photos(booking_id);


-- ============================================================================
-- 3. RLS policies for booking_photos
-- ============================================================================

ALTER TABLE booking_photos ENABLE ROW LEVEL SECURITY;

-- SELECT: Booking participants can view photos for their bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'booking_photos' AND policyname = 'booking_photos_select_participant'
  ) THEN
    CREATE POLICY booking_photos_select_participant ON booking_photos
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM rental_bookings rb
          WHERE rb.id = booking_photos.booking_id
            AND (rb.renter_id = auth.uid() OR rb.owner_id = auth.uid())
        )
      );
  END IF;
END $$;

-- INSERT: Booking participants can upload photos for their bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'booking_photos' AND policyname = 'booking_photos_insert_participant'
  ) THEN
    CREATE POLICY booking_photos_insert_participant ON booking_photos
      FOR INSERT
      WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM rental_bookings rb
          WHERE rb.id = booking_photos.booking_id
            AND (rb.renter_id = auth.uid() OR rb.owner_id = auth.uid())
        )
      );
  END IF;
END $$;

-- UPDATE: The other party can set verified_by_other = true
-- (only the non-uploader can verify, and only the verified_by_other field)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'booking_photos' AND policyname = 'booking_photos_update_verify'
  ) THEN
    CREATE POLICY booking_photos_update_verify ON booking_photos
      FOR UPDATE
      USING (
        -- Must be a participant but NOT the uploader
        uploaded_by != auth.uid()
        AND EXISTS (
          SELECT 1 FROM rental_bookings rb
          WHERE rb.id = booking_photos.booking_id
            AND (rb.renter_id = auth.uid() OR rb.owner_id = auth.uid())
        )
      )
      WITH CHECK (
        -- Can only change verified_by_other to true
        verified_by_other = true
      );
  END IF;
END $$;


-- ============================================================================
-- 4. Index on rental_bookings for overdue cron job
--    Speeds up the periodic check for bookings past their end_date
--    that haven't been returned yet.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rental_bookings_overdue
  ON rental_bookings (status, end_date)
  WHERE status IN ('active', 'confirmed', 'paid') AND actual_return_date IS NULL;


-- ============================================================================
-- 5. Category-based deposit suggestions
--    Provides recommended deposit ranges per item category.
--    default_multiplier = suggested deposit as multiple of daily rental price.
-- ============================================================================

CREATE TABLE IF NOT EXISTS deposit_suggestions (
  category TEXT PRIMARY KEY,
  min_deposit NUMERIC NOT NULL DEFAULT 50,
  max_deposit NUMERIC NOT NULL DEFAULT 500,
  default_multiplier NUMERIC NOT NULL DEFAULT 3
);

-- Seed default categories (Finnish category slugs matching TackBird categories)
INSERT INTO deposit_suggestions (category, min_deposit, max_deposit, default_multiplier) VALUES
  ('tyokalut',     50,  200, 3),
  ('elektroniikka', 100, 500, 4),
  ('urheilu',       50,  300, 3),
  ('musiikki',     100, 400, 4)
ON CONFLICT (category) DO NOTHING;

-- Public read access for deposit suggestions (used by clients to show defaults)
ALTER TABLE deposit_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'deposit_suggestions' AND policyname = 'deposit_suggestions_select_all'
  ) THEN
    CREATE POLICY deposit_suggestions_select_all ON deposit_suggestions
      FOR SELECT
      USING (true);
  END IF;
END $$;

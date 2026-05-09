-- Slice 1 of the lending feature: real Stripe + return/review redesign.
--
-- All changes are additive and idempotent. Existing in-flight rental_bookings
-- rows continue to render in the address branch of app/booking/[id].tsx
-- because pickup_method defaults to 'address' and the new JSONB columns
-- default to NULL / '[]'. No backfill is required.

-- A. Pickup method discriminator. Slice 1 always sets 'address' explicitly
--    in app/post/[id].tsx#handlePayAndBook; slices 2-3 will use 'hub' /
--    'gardi'. The CHECK constraint covers all three so a future hub or
--    gardi insert during partial deploy doesn't fail.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS pickup_method TEXT
  DEFAULT 'address'
  CHECK (pickup_method IN ('address', 'hub', 'gardi'));

-- B. Deposit lifecycle. Tracked separately from rental_bookings.status
--    because a deposit can be authorized → released without the booking
--    ever leaving 'paid' / 'confirmed', and can be partially captured on
--    a damage claim while the booking is still 'completed'.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT;
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS deposit_status TEXT
  CHECK (deposit_status IN ('none','authorized','captured','released','partial_captured'));
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS deposit_captured_amount NUMERIC(10,2);

-- C. Pre-return checklist on the listing itself. Lender authors it when
--    creating the listing in app/new-listing.tsx; LoanActive and Return
--    screens read it from here. Shape: [{ key, label, optional? }].
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS pre_return_checklist JSONB
  DEFAULT '[]'::jsonb;

-- D. Return record on the booking. Single JSONB so its shape can evolve
--    (extra fields for damage claim, lender countersignature, etc.) without
--    further migrations. Shape:
--      { photos: string[],
--        checks: { [key:string]: boolean },
--        note?: string,
--        submitted_at: string }
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS return_record JSONB;

-- E. Review readiness flags. The handoff's "pending_review" state in the
--    proposed enum is replaced by these timestamps + status='completed'.
--    Lets app/booking/[id].tsx decide which review prompt to show without
--    a join into the reviews table on every render.
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS lender_review_at TIMESTAMPTZ;
ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS borrower_review_at TIMESTAMPTZ;

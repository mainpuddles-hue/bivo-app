-- Slice 2 of the lending feature: TackBird Hub pickup support.
--
-- Additive, idempotent. The hub_id column is nullable and refers to the
-- existing public.hubs table (created prior to this migration); pickup_state
-- defaults to 'pending_method' which matches the legacy "address" flow that
-- doesn't track a per-step physical-handoff state.
--
-- pickup_state lives separately from rental_bookings.status so the macro
-- lifecycle (pending → paid → confirmed → active → completed) keeps its
-- 6 branches in app/booking/[id].tsx unchanged. pickup_state only describes
-- the locker/hub micro-flow inside confirmed/active and is null/legacy for
-- the address-pickup flow.

ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS hub_id UUID
  REFERENCES hubs(id) ON DELETE SET NULL;

ALTER TABLE rental_bookings
  ADD COLUMN IF NOT EXISTS pickup_state TEXT
  DEFAULT 'pending_method'
  CHECK (pickup_state IN (
    'pending_method',          -- address flow, or method not yet chosen
    'awaiting_lender_dropoff', -- hub/gardi: lender needs to drop the item
    'awaiting_borrower_pickup',-- item is at hub/locker, borrower can collect
    'in_use',                  -- borrower has the item
    'awaiting_borrower_return',-- hub/gardi: borrower needs to return
    'awaiting_lender_collection',-- hub/gardi: item is back, lender collects
    'completed_pickup_flow'    -- physical handoff fully done
  ));

-- Index for "show me my hub's pending dropoffs / pickups" queries that the
-- hub-operator dashboard will need. Matches the typical query shape:
--   WHERE hub_id = $1 AND pickup_state IN ('awaiting_lender_dropoff', 'awaiting_borrower_pickup', 'awaiting_borrower_return', 'awaiting_lender_collection')
CREATE INDEX IF NOT EXISTS idx_rental_bookings_hub_state
  ON rental_bookings(hub_id, pickup_state)
  WHERE hub_id IS NOT NULL;

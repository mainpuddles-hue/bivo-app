-- Add stripe_event_id to webhook_events for deduplication
-- Stripe webhook retries will be caught by the unique constraint
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_stripe_event_id_unique
  ON webhook_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- Ensure payments.stripe_session_id is unique for upsert pattern
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_session_id_unique
  ON payments (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

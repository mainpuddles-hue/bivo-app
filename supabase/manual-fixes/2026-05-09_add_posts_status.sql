-- Add posts.status column to back the "Muuta tilaa" feature in
-- app/post/[id].tsx (handleStatusChange). The UI already renders
-- 'active' / 'reserved' / 'completed' badges based on this column,
-- but the column never existed on v1 — so every status update from
-- the listing-detail action sheet failed with PGRST204
-- ("could not find the 'status' column").
--
-- Defaults to 'active' so all existing posts get the same value
-- the UI already assumes for them. Idempotent.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS status TEXT
  DEFAULT 'active'
  CHECK (status IN ('active', 'reserved', 'completed', 'cancelled'));

-- Backfill any pre-existing rows where the default didn't apply
-- (DEFAULT only fires on new INSERTs without explicit status).
UPDATE posts SET status = 'active' WHERE status IS NULL;

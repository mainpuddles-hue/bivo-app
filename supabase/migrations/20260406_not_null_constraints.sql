-- Applied to production 2026-04-06
-- NOT NULL constraints on critical columns

-- posts.is_active must never be NULL (breaks feed queries)
UPDATE posts SET is_active = true WHERE is_active IS NULL;
ALTER TABLE posts ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE posts ALTER COLUMN is_active SET DEFAULT true;

-- payments.status must never be NULL (breaks payment flow)
UPDATE payments SET status = 'pending' WHERE status IS NULL;
ALTER TABLE payments ALTER COLUMN status SET NOT NULL;
ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending';

-- Ensure each transaction_id in boost_purchases is unique to prevent double-credit.
-- The verify-boost-purchase Edge Function uses this as an atomic lock:
-- INSERT with transaction_id fails with 23505 if already processed.
CREATE UNIQUE INDEX IF NOT EXISTS boost_purchases_transaction_id_unique
  ON boost_purchases (transaction_id)
  WHERE transaction_id IS NOT NULL;

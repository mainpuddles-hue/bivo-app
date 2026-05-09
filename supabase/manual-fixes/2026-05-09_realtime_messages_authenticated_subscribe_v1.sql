BEGIN;

CREATE POLICY "Authenticated can subscribe to realtime channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;

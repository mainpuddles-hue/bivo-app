-- Allow admins to insert audit_log entries from the client
-- (The existing "service_role_audit" policy only allows service_role,
--  but mobile admin panel uses the anon key with authenticated user.)
CREATE POLICY "admins_insert_audit" ON audit_log
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

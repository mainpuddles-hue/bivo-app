-- Maintenance upvotes table (was missing from initial building features migration)

CREATE TABLE IF NOT EXISTS maintenance_upvotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);

ALTER TABLE maintenance_upvotes ENABLE ROW LEVEL SECURITY;

-- Members of the org can upvote
CREATE POLICY "org_members_can_upvote" ON maintenance_upvotes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM maintenance_requests mr
      JOIN organization_members om ON om.org_id = mr.org_id
      WHERE mr.id = maintenance_upvotes.request_id AND om.user_id = auth.uid()
    )
  );

CREATE INDEX idx_maintenance_upvotes_request ON maintenance_upvotes(request_id);
CREATE INDEX idx_maintenance_upvotes_user ON maintenance_upvotes(user_id);

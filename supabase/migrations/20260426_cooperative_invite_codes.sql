-- Cooperative invite codes for taloyhtiö onboarding
-- Isännöitsijä/hallituksen pj generates codes, residents use them to join

CREATE TABLE IF NOT EXISTS cooperative_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_uses int,
  uses_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_coop_codes_org ON cooperative_invite_codes(org_id);
CREATE INDEX IF NOT EXISTS idx_coop_codes_code ON cooperative_invite_codes(code) WHERE is_active = true;

-- RLS
ALTER TABLE cooperative_invite_codes ENABLE ROW LEVEL SECURITY;

-- Admins/board can see all codes for their orgs; anyone can look up active codes
CREATE POLICY coop_codes_select ON cooperative_invite_codes FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin'))
    OR (is_active = true AND (expires_at IS NULL OR expires_at > now()) AND (max_uses IS NULL OR uses_count < max_uses))
  );

-- Only board/manager/admin can create codes
CREATE POLICY coop_codes_insert ON cooperative_invite_codes FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));

-- Only board/manager/admin can update (deactivate, etc.)
CREATE POLICY coop_codes_update ON cooperative_invite_codes FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));

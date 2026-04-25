-- ============================================================
-- Organizations: unified model for buildings, neighborhoods, cities
-- Supports: taloyhtiö, kaupunginosa, kaupunki, yhdistys
-- ============================================================

-- Organization types
CREATE TYPE org_type AS ENUM ('building', 'neighborhood', 'city', 'association');
CREATE TYPE org_role AS ENUM ('member', 'board', 'manager', 'admin');
CREATE TYPE announcement_priority AS ENUM ('normal', 'important', 'urgent');
CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE maintenance_category AS ENUM ('plumbing', 'electrical', 'heating', 'elevator', 'common_area', 'outdoor', 'security', 'other');

-- ── Organizations ──
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type org_type NOT NULL DEFAULT 'building',
  name text NOT NULL,
  description text,
  -- Address/location (for buildings)
  street_address text,
  postal_code text,
  city text DEFAULT 'Helsinki',
  neighborhood text,
  lat double precision,
  lng double precision,
  -- Link to existing buildings table (for type='building')
  building_id uuid REFERENCES buildings,
  -- Settings
  is_public boolean NOT NULL DEFAULT true,
  require_approval boolean NOT NULL DEFAULT false,
  -- Metadata
  logo_url text,
  cover_image_url text,
  rules_markdown text,
  member_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users
);

CREATE INDEX idx_org_type ON organizations(type);
CREATE INDEX idx_org_building ON organizations(building_id) WHERE building_id IS NOT NULL;
CREATE INDEX idx_org_city_neighborhood ON organizations(city, neighborhood);

-- ── Organization Members ──
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users,
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(org_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ── Announcements (tiedotteet) ──
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users,
  title text NOT NULL,
  body text NOT NULL,
  priority announcement_priority NOT NULL DEFAULT 'normal',
  pinned boolean NOT NULL DEFAULT false,
  read_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_org ON announcements(org_id, created_at DESC);

-- Track who read announcements
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id uuid NOT NULL REFERENCES announcements ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

-- ── Maintenance Requests (vikailmoitukset) ──
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users,
  title text NOT NULL,
  description text,
  category maintenance_category NOT NULL DEFAULT 'other',
  status maintenance_status NOT NULL DEFAULT 'open',
  priority announcement_priority NOT NULL DEFAULT 'normal',
  image_urls text[] DEFAULT '{}',
  assigned_to uuid REFERENCES auth.users,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users,
  resolution_note text,
  upvote_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_org ON maintenance_requests(org_id, status, created_at DESC);

-- Maintenance request comments
CREATE TABLE IF NOT EXISTS maintenance_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES maintenance_requests ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users,
  body text NOT NULL,
  is_official boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_comments ON maintenance_comments(request_id, created_at);

-- ── Polls / Äänestykset ──
-- (Reuse existing polls table if it exists, or create organization-scoped polls)
CREATE TABLE IF NOT EXISTS org_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  results jsonb NOT NULL DEFAULT '{}',
  vote_count int NOT NULL DEFAULT 0,
  multiple_choice boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_polls ON org_polls(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS org_poll_votes (
  poll_id uuid NOT NULL REFERENCES org_polls ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  option_index int NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id, option_index)
);

-- ── Organization Chat ──
-- Link a conversation to an organization (reuse existing conversations table)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations;
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(org_id) WHERE org_id IS NOT NULL;

-- ── RLS Policies ──
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_poll_votes ENABLE ROW LEVEL SECURITY;

-- Organizations: public ones visible to all, private to members
CREATE POLICY "org_select" ON organizations FOR SELECT TO authenticated
  USING (is_public OR id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_insert" ON organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "org_update" ON organizations FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));

-- Members: visible to org members, self-manage
CREATE POLICY "org_members_select" ON organization_members FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_members_insert" ON organization_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "org_members_delete" ON organization_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));

-- Announcements: readable by org members, writable by board/manager/admin
CREATE POLICY "announcements_select" ON announcements FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "announcements_insert" ON announcements FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));
CREATE POLICY "announcements_update" ON announcements FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('manager', 'admin')));

-- Announcement reads: users manage own
CREATE POLICY "announcement_reads_select" ON announcement_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "announcement_reads_insert" ON announcement_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Maintenance: readable by org members, writable by any member
CREATE POLICY "maintenance_select" ON maintenance_requests FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "maintenance_insert" ON maintenance_requests FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "maintenance_update" ON maintenance_requests FOR UPDATE TO authenticated
  USING (reporter_id = auth.uid() OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));

-- Maintenance comments: readable by org members, writable by any member
CREATE POLICY "maintenance_comments_select" ON maintenance_comments FOR SELECT TO authenticated
  USING (request_id IN (SELECT id FROM maintenance_requests WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())));
CREATE POLICY "maintenance_comments_insert" ON maintenance_comments FOR INSERT TO authenticated
  WITH CHECK (request_id IN (SELECT id FROM maintenance_requests WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())));

-- Polls: readable by org members, writable by board/manager/admin
CREATE POLICY "org_polls_select" ON org_polls FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_polls_insert" ON org_polls FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('board', 'manager', 'admin')));

-- Poll votes: users manage own
CREATE POLICY "org_poll_votes_select" ON org_poll_votes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "org_poll_votes_insert" ON org_poll_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ── Helper: Auto-create org when building is created via resolve_building ──
CREATE OR REPLACE FUNCTION auto_create_building_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Create organization for the building
  INSERT INTO organizations (type, name, street_address, postal_code, city, neighborhood, lat, lng, building_id, member_count, created_by)
  VALUES ('building', NEW.street_address, NEW.street_address, NEW.postal_code, NEW.city, NEW.neighborhood, NEW.lat, NEW.lng, NEW.id, 1, auth.uid())
  RETURNING id INTO v_org_id;

  -- Add the creator as a member
  INSERT INTO organization_members (org_id, user_id, role, approved_at, approved_by)
  VALUES (v_org_id, auth.uid(), 'member', now(), auth.uid());

  RETURN NEW;
END;
$$;

-- Trigger: auto-create org on new building
DROP TRIGGER IF EXISTS trg_auto_create_building_org ON buildings;
CREATE TRIGGER trg_auto_create_building_org
  AFTER INSERT ON buildings
  FOR EACH ROW EXECUTE FUNCTION auto_create_building_org();

-- ── Helper: Auto-join org when user joins a building ──
CREATE OR REPLACE FUNCTION auto_join_building_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Find the organization for this building
  SELECT id INTO v_org_id FROM organizations WHERE building_id = NEW.building_id AND type = 'building' LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Add user as member (upsert)
    INSERT INTO organization_members (org_id, user_id, role, approved_at, approved_by)
    VALUES (v_org_id, NEW.user_id, 'member', now(), NEW.user_id)
    ON CONFLICT (org_id, user_id) DO NOTHING;

    -- Update member count
    UPDATE organizations SET member_count = (
      SELECT count(*) FROM organization_members WHERE org_id = v_org_id
    ) WHERE id = v_org_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_join_building_org ON user_buildings;
CREATE TRIGGER trg_auto_join_building_org
  AFTER INSERT OR UPDATE ON user_buildings
  FOR EACH ROW EXECUTE FUNCTION auto_join_building_org();

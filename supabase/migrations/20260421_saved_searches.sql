-- Sprint K: Saved Search + Push Alerts
-- Table already existed with (id, user_id, query, filters, notify, last_notified_at, created_at)
-- Adding missing columns and proper RLS

ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS match_count INT DEFAULT 0;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true;

UPDATE saved_searches SET push_enabled = COALESCE(notify, true) WHERE push_enabled IS NULL;

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_searches_push ON saved_searches(push_enabled)
  WHERE push_enabled = true;

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_searches' AND policyname = 'own_saved_searches_select') THEN
    CREATE POLICY "own_saved_searches_select" ON saved_searches FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_searches' AND policyname = 'own_saved_searches_insert') THEN
    CREATE POLICY "own_saved_searches_insert" ON saved_searches FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_searches' AND policyname = 'own_saved_searches_update') THEN
    CREATE POLICY "own_saved_searches_update" ON saved_searches FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_searches' AND policyname = 'own_saved_searches_delete') THEN
    CREATE POLICY "own_saved_searches_delete" ON saved_searches FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

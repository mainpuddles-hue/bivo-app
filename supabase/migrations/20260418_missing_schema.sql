-- Migration: Create missing tables, columns, and functions
-- Fixes schema gaps discovered during comprehensive audit

-- 1. Add detected_country and detected_city columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS detected_country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS detected_city TEXT;

-- 2. Create countries table (used by useLocationDetection)
CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_waitlist BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO countries (id, name, is_active, is_waitlist) VALUES
  ('FI', 'Finland', true, false),
  ('SE', 'Sweden', false, true),
  ('EE', 'Estonia', false, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS countries_read_all ON countries;
CREATE POLICY countries_read_all ON countries FOR SELECT USING (true);

-- 3. Create post_embeddings table (used by semantic search)
CREATE TABLE IF NOT EXISTS post_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_embeddings_post ON post_embeddings(post_id);

ALTER TABLE post_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_embeddings_read_all ON post_embeddings;
CREATE POLICY post_embeddings_read_all ON post_embeddings FOR SELECT USING (true);
DROP POLICY IF EXISTS post_embeddings_insert_service ON post_embeddings;
CREATE POLICY post_embeddings_insert_service ON post_embeddings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS post_embeddings_delete_own ON post_embeddings;
CREATE POLICY post_embeddings_delete_own ON post_embeddings FOR DELETE
  USING (EXISTS (SELECT 1 FROM posts WHERE posts.id = post_embeddings.post_id AND posts.user_id = auth.uid()));

-- 4. Create calculate_trust_score RPC function
CREATE OR REPLACE FUNCTION calculate_trust_score(p_user_id UUID)
RETURNS TABLE(score NUMERIC, tier INT, factors JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score NUMERIC := 0;
  v_factors JSONB := '{}';
  v_post_count INT;
  v_review_avg NUMERIC;
  v_review_count INT;
  v_days_active INT;
  v_tier INT;
BEGIN
  SELECT COUNT(*) INTO v_post_count FROM posts WHERE user_id = p_user_id AND is_active = true;
  v_factors := v_factors || jsonb_build_object('posts', LEAST(v_post_count * 2, 20));
  v_score := v_score + LEAST(v_post_count * 2, 20);

  SELECT AVG(rating), COUNT(*) INTO v_review_avg, v_review_count FROM reviews WHERE reviewed_id = p_user_id;
  IF v_review_count > 0 THEN
    v_factors := v_factors || jsonb_build_object('reviews', ROUND(v_review_avg * 4, 1));
    v_score := v_score + ROUND(v_review_avg * 4, 1);
  END IF;

  SELECT EXTRACT(DAY FROM now() - created_at)::INT INTO v_days_active FROM profiles WHERE id = p_user_id;
  v_factors := v_factors || jsonb_build_object('account_age', LEAST(COALESCE(v_days_active, 0), 30));
  v_score := v_score + LEAST(COALESCE(v_days_active, 0), 30);

  v_score := GREATEST(0, LEAST(100, v_score));

  IF v_score >= 60 THEN v_tier := 3;
  ELSIF v_score >= 30 THEN v_tier := 2;
  ELSE v_tier := 1;
  END IF;

  RETURN QUERY SELECT v_score, v_tier, v_factors;
END;
$$;

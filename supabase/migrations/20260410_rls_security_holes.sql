-- Migration: 20260410_rls_security_holes
--
-- Fixes 4 critical RLS bypasses found in the phase 4 audit. The previous
-- policies required only `auth.uid() IS NOT NULL`, which let any signed-in
-- user insert/update rows for ANY other user. This allowed trivial:
--
--   1. Trust badge forgery (self-verify as identity-verified → unlock Tier 2
--      → offer paid services, bypassing Suomi.fi verification)
--   2. Fake badges for other users (planting `neighborhood_hero`, etc.)
--   3. Trust score tampering (forge any user's trust_score row)
--   4. Point farming (insert points for yourself OR for others)
--   5. Semantic embedding poisoning (overwrite any post's embedding vector
--      to push a malicious post to the top of smart-match results)
--
-- After this migration:
--   - user_badges: only service_role can INSERT (Edge Functions handle
--     badge grants, e.g. referral milestones, moderation awards)
--   - trust_scores: only service_role can write (calculate_trust_score RPC)
--   - user_points: users can only insert points with their own user_id;
--     the points column is additionally validated to be non-negative
--   - post_embeddings: only the post owner (or service_role) can insert/
--     update their own post's embedding
--
-- The client-side fallback in useIdentityVerification.ts that tried to
-- insert a `verified` badge directly from the app will fail after this
-- migration — that path was always insecure (noted as TODO) and must now
-- flow through the Suomi.fi OIDC callback Edge Function instead.

-- ── 1. user_badges — replace permissive INSERT policy ──
DROP POLICY IF EXISTS insert_user_badges ON user_badges;
CREATE POLICY service_role_insert_user_badges ON user_badges
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── 2. trust_scores — replace permissive INSERT + UPDATE policies ──
DROP POLICY IF EXISTS insert_trust_scores ON trust_scores;
DROP POLICY IF EXISTS update_trust_scores ON trust_scores;
CREATE POLICY service_role_insert_trust_scores ON trust_scores
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY service_role_update_trust_scores ON trust_scores
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ── 3. user_points — require matching user_id + non-negative points ──
-- user_points is an append-only ledger of point-earning events. Users
-- shouldn't be able to insert points for other users, and points must be
-- non-negative (awarded, not deducted). Actual awarding should go through
-- the usePoints hook which is called after verified actions (post created,
-- reply created, etc.), so same-user insertion is acceptable here — but
-- server-side RPCs that increment totals should be the source of truth.
DROP POLICY IF EXISTS insert_user_points ON user_points;
CREATE POLICY insert_own_user_points ON user_points
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND points >= 0
  );

-- ── 4. post_embeddings — require ownership of the referenced post ──
DROP POLICY IF EXISTS insert_post_embeddings ON post_embeddings;
DROP POLICY IF EXISTS update_post_embeddings ON post_embeddings;
CREATE POLICY insert_own_post_embeddings ON post_embeddings
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_embeddings.post_id
        AND posts.user_id = auth.uid()
    )
  );
CREATE POLICY update_own_post_embeddings ON post_embeddings
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_embeddings.post_id
        AND posts.user_id = auth.uid()
    )
  );

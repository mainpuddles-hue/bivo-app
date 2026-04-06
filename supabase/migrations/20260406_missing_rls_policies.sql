-- Applied to production 2026-04-06
-- Fixes: 7 tables missing INSERT policies (all writes silently failed)

-- boost_purchases: user can insert/delete own purchases
CREATE POLICY IF NOT EXISTS insert_boost_purchases ON boost_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS delete_boost_purchases ON boost_purchases FOR DELETE USING (auth.uid() = user_id);

-- content_flags: any auth user can flag content
CREATE POLICY IF NOT EXISTS insert_content_flags ON content_flags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- post_embeddings: auth users can create/update embeddings
CREATE POLICY IF NOT EXISTS insert_post_embeddings ON post_embeddings FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS update_post_embeddings ON post_embeddings FOR UPDATE USING (auth.uid() IS NOT NULL);

-- trust_scores: system can create/update trust scores
CREATE POLICY IF NOT EXISTS insert_trust_scores ON trust_scores FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS update_trust_scores ON trust_scores FOR UPDATE USING (auth.uid() IS NOT NULL);

-- user_badges: auth users can receive badges
CREATE POLICY IF NOT EXISTS insert_user_badges ON user_badges FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- user_boosts: user can manage own boosts
CREATE POLICY IF NOT EXISTS insert_user_boosts ON user_boosts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS update_user_boosts ON user_boosts FOR UPDATE USING (auth.uid() = user_id);

-- user_points: auth users can earn points
CREATE POLICY IF NOT EXISTS insert_user_points ON user_points FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- analytics/interactions: allow cleanup
CREATE POLICY IF NOT EXISTS delete_analytics_events ON analytics_events FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS delete_user_interactions ON user_interactions FOR DELETE USING (auth.uid() = user_id);

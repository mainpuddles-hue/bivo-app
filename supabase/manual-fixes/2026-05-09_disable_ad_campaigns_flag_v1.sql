-- Disable AD_CAMPAIGNS feature flag on v1.
--
-- The remote feature_flags row currently has AD_CAMPAIGNS=true, but the
-- v1 schema does not contain the `advertisements` table. The feed code
-- gates the ads fetch on FEATURES.AD_CAMPAIGNS (resolved against this
-- table after fetchRemoteFlags), so leaving the flag on means every
-- feed mount queries a non-existent table and emits a PGRST205 schema
-- cache miss.
--
-- Flipping the flag off is the surgical fix: it stops the query from
-- being issued at all. When/if the ads tables are deployed to v1 we
-- can flip the flag back on. Pairs with the silent-skip safety net
-- in app/(tabs)/index.tsx (commit 671807f) which now treats
-- "table not found" as a no-op rather than a warning.

UPDATE feature_flags
SET enabled = false,
    updated_at = now()
WHERE key = 'AD_CAMPAIGNS';

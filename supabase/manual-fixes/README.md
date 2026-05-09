# Manual fixes

SQL fixes that have been applied directly to the live database via
`supabase db query --linked --file <name>` rather than through the
migrations workflow.

These are checked in for documentation and replay-on-rebuild only —
they are **already applied** to project `pvvruolhaxzrfkxngpgu`. Do not
re-run blindly. If the DB is ever recreated from migrations, replay
these in chronological order after the migration baseline.

The reason these are not in `migrations/` is that the migration history
in `migrations/` predates the live DB's current squashed baseline and
running `supabase db push` would attempt to re-apply 50+ unrelated
files. Until the migration history is reconciled, surgical fixes go
here.

## Files

- **`2026-05-09_fix_conversation_members_recursion.sql`** — Replaced
  the recursive SELECT policy on `conversation_members` with one that
  delegates to a `SECURITY DEFINER` helper function
  `public.is_conversation_member(uuid)`. Without this, every
  `conversations` query that hits the group-membership branch failed
  with "infinite recursion detected in policy for relation
  conversation_members", breaking unread counts and Realtime channels.

- **`2026-05-09_realtime_publication.sql`** — Added `messages`,
  `conversations`, `conversation_members`, and `notifications` to the
  `supabase_realtime` publication. The publication was empty in the
  pivoted DB, so every `.on('postgres_changes')` subscription failed
  with `CHANNEL_ERROR` (chat realtime, unread badge, feed live
  updates). **Applied to v2 only** — v1 already had the four core
  tables in its publication.

- **`2026-05-09_post_images_storage_rls_v1.sql`** — Added INSERT and
  UPDATE policies on `storage.objects` for `bucket_id = 'post-images'`
  scoped to the user's own folder (`auth.uid()/<temp_id>/...`). The
  v1 schema already had the matching SELECT (public read) and DELETE
  (owner) policies for `post-images`, but the only existing INSERT
  policy was for the legacy `posts` bucket. Result: every image upload
  via `app/new-listing.tsx` and `app/(tabs)/create.tsx` was silently
  RLS-denied — `posts.image_url` and `post_images` rows were empty
  for all user-created posts. **Applied to v1 only.**

- **`2026-05-09_posts_select_owner_drafts_v1.sql`** — Added
  `user_id = auth.uid()` as a top-level OR branch to the
  `posts_select` USING clause so authors always see their own posts,
  including inactive ones. The previous USING required
  `is_active = true`, which silently broke the publish flow:
  `app/(tabs)/create.tsx` inserts the row with `is_active = false`
  (so images can upload before activation) and uses `.select('id')`
  to recover the new id. PostgREST translates that into
  `INSERT ... RETURNING`, and Postgres applies the SELECT policy to
  the returned row. The freshly-inserted draft was not yet
  `is_active`, so the SELECT denied it, the whole INSERT rolled back
  with 42501, and the user saw "Ei oikeuksia tähän toimintoon" on
  every publish attempt — even though the INSERT WITH CHECK clause
  passed. **Applied to v1 only.**

- **`2026-05-09_realtime_messages_authenticated_subscribe_v1.sql`** —
  Added a permissive `SELECT` policy on `realtime.messages` for the
  `authenticated` role: `USING (true)`. The table had RLS enabled but
  zero policies, so every channel subscribe handshake denied with
  `CHANNEL_ERROR` for feed live-updates, useUnreadCount, useEventChatUnread,
  and the messages thread. The actual data filtering still goes through
  RLS on the underlying `public.messages` / `public.conversations` /
  `public.notifications` tables — this policy only governs whether a
  client may join a Realtime channel at all. Combined with the
  `realtime.setAuth` mirroring change in `src/lib/supabase/client.ts`
  (commit 0fcac7f), Realtime channels now subscribe cleanly on app
  launch. **Applied to v1 only.**

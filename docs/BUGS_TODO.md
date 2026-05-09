# BUGS_TODO — TackBird mobile

**Generated:** 2026-05-09 autonomous bug-hunt session

Compiled from three parallel Explore-agent audits (profile/settings,
commerce/community, lib/hooks) plus targeted Metro-log investigation
on PID 48362 (post-fix bundle). Confidence is graded; only **fix**
items have been verified end-to-end.

---

## Fixed in this session (5 commits, all pushed to main)

| Commit | Scope |
|--------|-------|
| `7188cdb` | `safeBack` helper + protect action-completion `router.back()` in 6 screens (booking/return/review/poll/event/admin) |
| `303b4c1` | Rate-limiter self-heals corrupted JSON storage instead of throwing every read |
| `be5af38` | Protect deep-linked screen headers from `router.back()` crash (notifications, messages, building/*, payment/cancel, invite, etc.) |
| `fc0cc27` | Hide Apple Sign-In button when `isAvailableAsync()` returns false (Simulator, no-Apple-ID Macs) |
| `928f084` | Use `ignoreDuplicates` for post_views upsert so RLS allows the insert (no UPDATE policy needed) |

Plus the realtime-messages SELECT policy doc commit (`3319039`) carried
over from the immediately-previous session, which paired with the
`realtime.setAuth` mirroring fix to clear the persistent
`CHANNEL_ERROR` on subscribe.

---

## Open — high confidence (would fix in next session)

These were investigated and are real, but I held off because they need
a small architecture decision or a touch of UX judgment first.

### P1 — `useFeedData` personalization RPC silent fallback
**Where:** `src/hooks/useFeedData.ts` around the `get_personalized_feed` RPC call.
**What:** If the RPC fails (transient network, RLS denial, deploy
in progress), the hook silently uses zero personal scores. No retry,
no surface to the user, no metric. Feed degrades to a generic ranking
without anyone noticing.
**Decision needed:** retry once with backoff, OR fall back to
`recency` sort and tell the user via a small banner? I'd vote retry
once (transient is the common case) and only flag in dev.

### P1 — `Toast` exit-animation lifecycle leak
**Where:** `src/components/Toast.tsx:98-101`.
**What:** `setRendered(null)` only runs when the exit animation
reports `finished===true`. If a new toast preempts the exit (rare
but reproducible by spamming), `rendered` stays non-null and the
overlay is technically still mounted with opacity:0 until the next
toast cycles it.
**Decision needed:** call `setRendered(null)` unconditionally on
animation end, OR keep the current behavior (which preserves the
exiting toast's frame for the incoming toast)? Visually the second
is nicer; mechanically the first is safer.

### P2 — Tab-bar `router.back()` crash in `(tabs)/create.tsx`
**Where:** `app/(tabs)/create.tsx:378, 384` — the discard-draft
confirm and the no-content branch.
**What:** Same deep-link crash class as the rest, but the create
screen is a tab so canGoBack is *almost* always true. Almost — if
the user opens the app via a notification that lands on Create
(unlikely path today), it would still throw. Lower priority because
the entry path is theoretical.

### P2 — `bookings.tsx` participant-count optimistic null
**Where:** `app/bookings.tsx:335-338` (per agent #2 report — line numbers may drift).
**What:** Optimistic decrement in event-leave does
`participant_count - 1` without coalescing the read to 0 first.
If `participant_count` is `null` (column nullable, fresh row), the
result is `NaN` which then renders as `NaN` in the UI until the next
re-fetch.
**Fix sketch:** `Math.max(0, (count ?? 0) - 1)`.

---

## Open — investigated and dismissed (false positives)

For posterity, so the same items don't get re-flagged next session:

- **`saved_events` table missing on v1** — the table exists, verified
  by `information_schema.tables` query. Earlier-session note about
  v2 being simpler was misapplied.
- **`PostCardGrid:257` getImageUrl non-null assertion** — the variant
  branch only renders when `hasImage===true`, which guarantees
  `effectiveImageUrl` is non-null, and `getImageUrl` returns null
  only on null input. The `!` is provably safe.
- **`PostCardGrid:319-327` event date `.getDate()` throws on
  invalid date** — `new Date('garbage')` returns Invalid Date;
  `.getDate()` returns NaN, no throw. Result is ugly UI ("NaN.NaN.")
  but not a crash. Polish-level, not P1.
- **All `JSON.parse` callsites I scanned** are wrapped in `try/catch`.
  rateLimiter was the exception and it's now self-healing.

---

## Open — schema / DB-side items (require user signoff)

Not applied because they touch the live DB. SQL drafts go in
`supabase/manual-fixes/` for review when we sit down together.

### Done — `AD_CAMPAIGNS` remote flag flipped to `false`
Applied 2026-05-09 17:17 UTC via
`supabase/manual-fixes/2026-05-09_disable_ad_campaigns_flag_v1.sql`.
Flag had drifted on but `advertisements` is not deployed on v1, so
the feed was issuing a doomed query on every mount. Flag flip + the
client-side silent-skip in 671807f together remove the noise without
needing a code-side feature gate.

### Possibly worth doing — backfill `messages` bucket migration
**Where:** Supabase v1 storage. `messages` bucket (private) holds 3
historical chat images that fail to load via `getPublicUrl`. New
uploads correctly target `message-images` (public) so this is purely
a "old data is broken" issue affecting the test conversation.
**Status:** User said skip earlier this session. Leaving here so we
don't rediscover it.

### Possibly worth doing — `posts.cleanup` script for inactive drafts
**Where:** Server-side, not in this codebase yet.
**What:** The publish flow creates a draft row with `is_active=false`,
uploads images, then activates. If the user kills the app between
insert and activate, the row stays as a permanent orphan draft. We
already have a periodic cleanup attempt in
`app/(tabs)/create.tsx` (the "[create] cleanup id:" warning), but no
server-side sweeper.
**Decision needed:** add a simple cron job in
`supabase/functions/check-overdue-rentals/` (or a new function) that
deletes posts where `is_active=false AND created_at < now() - interval '24 hours' AND user_id IS NOT NULL`?

---

## Audit method (for next time)

Three Explore agents in parallel, each on a non-overlapping slice:
1. profile/settings/notifications/saved/activities
2. booking/bookings/listings/event/community/search/explore
3. hooks + lib + Toast + index.tsx feed + login.tsx auth

Each agent was asked for **HIGH-CONFIDENCE bugs only** with file:line
+ severity + concrete fix sketch. The first two agents over-flagged
"may"/"could"/"silent fail" items — about a third of their findings
were false positives that didn't survive a 30-second read of the
actual code. Agent #3 had the cleanest hit-rate; its instructions
explicitly forbade speculative findings.

When re-running this, repeat the agent #3 prompt style for all three.

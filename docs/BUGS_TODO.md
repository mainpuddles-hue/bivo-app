# BUGS_TODO — TackBird mobile

**Generated:** 2026-05-09 autonomous bug-hunt session

Compiled from three parallel Explore-agent audits (profile/settings,
commerce/community, lib/hooks) plus targeted Metro-log investigation
on PID 48362 (post-fix bundle). Confidence is graded; only **fix**
items have been verified end-to-end.

---

## Fixed in this session (12 commits, all pushed to main)

**Round 1 — autonomous bug-hunt:**

| Commit | Scope |
|--------|-------|
| `7188cdb` | `safeBack` helper + protect action-completion `router.back()` in 6 screens (booking/return/review/poll/event/admin) |
| `303b4c1` | Rate-limiter self-heals corrupted JSON storage instead of throwing every read |
| `be5af38` | Protect deep-linked screen headers from `router.back()` crash (notifications, messages, building/*, payment/cancel, invite, etc.) |
| `fc0cc27` | Hide Apple Sign-In button when `isAvailableAsync()` returns false (Simulator, no-Apple-ID Macs) |
| `928f084` | Use `ignoreDuplicates` for post_views upsert so RLS allows the insert (no UPDATE policy needed) |

**Round 2 — simulator verification + DB flag:**

| Commit | Scope |
|--------|-------|
| `671807f` | LogBox.ignoreLogs for `getRegistrationInfoAsync` (expo-notifications auto-reg), silent-skip for missing ads table |
| `299be3d` | DB: flip `AD_CAMPAIGNS=false` on v1 (advertisements not deployed) |

**Round 3 — three more parallel agents (payments, listings, admin/auth):**

| Commit | Scope |
|--------|-------|
| `9d936e6` | `return-item.tsx` upload broken on three axes (blob.arrayBuffer, wrong RLS path scope, ext not whitelisted) |
| `8439b0f` | `payouts.tsx` infinite re-fetch loop fix + remaining `router.back()` callsites (payouts, payment-checkout, my-listings, new-listing, admin headers, city-admin) |
| `7f047f5` | OAuth `finishOAuth(null)` no longer shows fake success toast — bounces with proper error |
| `ca3ba49` | `verify-otp.tsx` redirects to /login when email param missing entirely (was only handling malformed) |

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
- **`payment-checkout.tsx:47-50` NaN math** — already coerced with
  `parseFloat(... || '0') || 0`, so undefined params resolve to 0.
- **`payment-history.tsx` stale locale closure** — `localeStr` is in
  `renderPayment`'s useCallback dep list (line 211), so it re-creates
  on locale change. Agent looked at the wrong callback.
- **`new-listing.tsx` upload error path** — `blob.type` is only used
  for mime detection, the actual buffer comes from `uriToArrayBuffer`,
  and `!response.ok` already short-circuits with `continue`.
- **`blocked.tsx:44` user null guard** — guard exists at line 45
  (`if (!user) return`); agent missed the next line.
- **`_layout.tsx:290` getUser try/catch** — already has `.catch()`.
- **`_layout.tsx:345` onAuthStateChange race** — mounted guard sits
  at line 366, *before* the await on the profile query, exactly where
  it needs to be.
- **`verification.tsx` RLS silent failure** — when `profile` is null
  the screen renders the zero-state correctly (all steps marked
  not-done), no crash, no broken UI.

---

## Security audit findings (2026-05-09 round 4)

Ran `supabase db advisors --linked --type security` (152 rows) plus a
parallel client-side Explore agent. The big stuff is fixed; the rest
is captured below by category.

### Done in this round
- `waitlist` SELECT lockdown (DB) — see manual-fixes
- Sign-out cleanup helper `src/lib/auth/cleanup.ts` covering push token,
  drafts, hidden-posts, search history, saved searches, streak/review
  counters, and Realtime channel teardown
- `STORAGE_KEYS.POST_DRAFT` + `WELCOME_TOAST_SHOWN` registered, all
  inline-string usages migrated to the registry

### Open — needs user signoff before fixing

**`buildings` and `organizations` permissive RLS** — both have
`INSERT WITH CHECK (true)` and `buildings_select USING (true)`. Anyone
authenticated can insert a row; anyone (incl. anon) can read every
building. Buildings hold street_address / postal_code / lat / lng /
member_count for taloyhtiöt, no email or PII.
**Decision needed:** restrict SELECT to "buildings the user is a
member of OR buildings in their naapurusto" — but that requires
deciding the visibility model for community discovery. May intentionally
be open today for joining-by-address-search.

**`organizations.org_insert WITH CHECK true`** — anyone authenticated
can create an organization. UPDATE is gated to board/manager/admin
roles via `organization_members`, SELECT is gated by `is_public OR
is_org_member(id)`. The risk is spam orgs cluttering the directory.
**Decision needed:** require an invite code, or rate-limit creates,
or restrict to verified users only?

**Auth — leaked-password protection disabled.** Supabase advisor
flagged that the HaveIBeenPwned check on signup/password change is
off. Toggle is in Supabase Dashboard → Auth → Providers → Email →
"Leaked Password Protection". One-click enable, but it's a deploy-
side change (not SQL), so leaving the call to the human.

### Open — bulk DB hygiene (low individual risk, high count)

**56 + 56 SECURITY DEFINER functions executable by anon/authenticated.**
Most look like ordinary helpers (RPCs called from the app); the risk
is only real if any of them touch tables the caller shouldn't reach.
**Suggested triage:** dump the function bodies, look for any that
SELECT/UPDATE outside the caller's normal scope (e.g. cross-user
data), then narrow the EXECUTE grants.

**13 `function_search_path_mutable` warnings.** Fix by appending
`SET search_path = ''` to every SECURITY DEFINER function definition
so a malicious caller can't redirect built-in calls (`coalesce`,
`now`, etc.) by altering their session search_path. Mechanical edit
once we audit the function set above.

**10 `public_bucket_allows_listing` warnings.** Every public bucket
has a SELECT policy that allows listing all object names, not just
fetching a known URL. For uploads, public read by exact path is fine;
the listing capability lets anyone enumerate file naming patterns.
**Suggested fix:** for each public bucket replace `... USING (true)`
with `... USING (true) WITH CHECK (false)` — or scope SELECT to the
specific path prefix when the table the URL is referenced in is
already authorised to be seen.

**6 `materialized_view_in_api`.** Each MV exposed via PostgREST.
Need to know which ones leak rows we don't want public; likely a
case-by-case revoke from anon/authenticated.

**4 `extension_in_public`.** Cosmetic. Move PostGIS / pgcrypto / etc
out of `public` into a dedicated `extensions` schema when convenient.

**1 ERROR `rls_disabled_in_public` on `spatial_ref_sys`.** PostGIS
internal table, has no per-user data, but the advisor flags it.
Either enable RLS with a permissive policy (cosmetic), or accept and
suppress.

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

# ULTRAPLAN: UX Depth — 5 Major Features + Structural Fix

**Date:** 2026-04-21
**Status:** PLAN — not started
**Goal:** Transform TackBird from "54 screens, no depth" to "focused app with killer UX loops"

---

## Structural Problem

54 screens, 4-deep navigation, new users lost. The app has features but lacks
retention loops — nothing pulls users back. No notification when someone posts
what you need. No way to negotiate. No map-feed integration.

**Existing infrastructure (better than expected):**
- Algorithmic feed EXISTS (`feedAlgorithm.ts` — 7 factors, collaborative filtering)
- Semantic search EXISTS (`semantic-search` Edge Function, pgvector, Finnish synonyms)
- Interaction tracking EXISTS (`useInteractionTracker`)
- Presence tracking EXISTS (`usePresence`)
- Push infrastructure EXISTS (`send-push` Edge Function, Expo notifications)
- 67 DB tables, 26 Edge Functions, 211 RLS policies — backend is ready

**What's missing:** The features that connect these systems into retention loops.

---

## Sprint Order (dependency-driven)

```
Sprint K: Saved Search + Push Alerts     ← retention killer feature
Sprint L: Swipeable Discovery Cards      ← hero card replacement
Sprint M: Feed Algorithm Surface         ← expose existing algorithm to user
Sprint N: Map-Feed Toggle                ← spatial browsing
Sprint O: Social Proof + Offer Button    ← conversion
```

---

## Sprint K: Saved Search + Push Alerts

**Why first:** This is the #1 retention feature. "Ilmoita kun joku tarjoaa pyörää
Kalliossa" brings users back without them having to open the app.

### K1. Database: `saved_searches` table

```sql
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL,                           -- search text
  filters JSONB DEFAULT '{}',                    -- {type, neighborhood, maxPrice, tags}
  push_enabled BOOLEAN DEFAULT true,             -- send push on match
  last_notified_at TIMESTAMPTZ,                  -- prevent spam
  match_count INT DEFAULT 0,                     -- total matches found
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, query)                         -- no duplicate saved searches
);

-- RLS: users see only their own
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_saved_searches" ON saved_searches
  FOR ALL USING (auth.uid() = user_id);

-- Index for the matching cron job
CREATE INDEX idx_saved_searches_push ON saved_searches(push_enabled)
  WHERE push_enabled = true;
```

### K2. Edge Function: `match-saved-searches`

Cron job (every 15 min) that:
1. Fetches posts created in last 15 min
2. For each post, finds matching saved_searches (text ILIKE + filter match)
3. Sends push via existing `send-push` for each match
4. Updates `last_notified_at` (min 1h between notifications per search)

```
File: supabase/functions/match-saved-searches/index.ts
Trigger: Supabase cron every 15 min
Auth: CRON_SECRET (same pattern as check-overdue-rentals)
```

**Matching logic:**
```ts
// For each new post:
// 1. Text match: post.title ILIKE '%query%' OR post.description ILIKE '%query%'
// 2. Filter match: type, neighborhood, price range
// 3. Semantic match (optional): if post has embedding, compare with search embedding
//    Use existing semantic-search infrastructure (BAAI/bge-small-en-v1.5)
```

### K3. Frontend: Save search from search screen

**File:** `app/search.tsx`
- After search results load, show "Save this search" button
- Bell icon toggle: "Notify me of new matches"
- Uses existing `SavedSearch` interface from `SearchFilters`

**File:** `app/settings.tsx`
- New section: "Saved Searches" → list with push toggle per search
- Swipe to delete

**File:** `app/notifications.tsx`
- New notification type: `search_match` → "Uusi osuma: 'pyörä Kalliossa'"
- Tap → opens search with saved filters applied

### K4. Types

```ts
// src/lib/types.ts
export interface SavedSearch {
  id: string
  user_id: string
  query: string
  filters: {
    type?: PostType
    neighborhood?: string
    maxPrice?: number
    tags?: string[]
  }
  push_enabled: boolean
  last_notified_at: string | null
  match_count: number
  created_at: string
}
```

### K5. Files to modify

| File | Change |
|------|--------|
| `supabase/migrations/2026XXXX_saved_searches.sql` | NEW — table + RLS |
| `supabase/functions/match-saved-searches/index.ts` | NEW — cron matcher |
| `app/search.tsx` | Add save button + bell toggle |
| `app/settings.tsx` | Add saved searches section |
| `app/notifications.tsx` | Handle `search_match` type |
| `src/lib/types.ts` | Add SavedSearch interface |
| `src/lib/i18n/fi.json` | Add translations |
| `src/lib/i18n/en.json` | Add translations |
| `src/lib/i18n/sv.json` | Add translations |

---

## Sprint L: Swipeable Discovery Cards

**Why:** Replace the static hero card with a Tinder-style swipeable stack.
The algorithm already picks top posts — now let users swipe through them.

### L1. Component: `DiscoveryStack`

```
File: src/components/DiscoveryStack.tsx
```

Uses `react-native-gesture-handler` PanGestureHandler + `react-native-reanimated`
for smooth card swipe animations.

**Behavior:**
- Shows top 5 posts from `rankFeed()` (already scored by 7 factors)
- Swipe RIGHT = like + save (optimistic, Supabase insert)
- Swipe LEFT = skip (track as 'skip' interaction)
- Swipe UP = open post detail
- Tap = open post detail
- After 5 cards: "See all posts" button → scroll to grid below

**Card layout (same as current hero card minus peekCard):**
- 4:3 image with gradient overlay
- Category pill, neighborhood, title, like count
- CTA row with author + distance + arrow

### L2. Feed integration

**File:** `app/(tabs)/index.tsx`

Replace the hero card section:
```diff
- const heroPost = visiblePosts.length > 0 ? visiblePosts[0] : null
- const remainingPosts = visiblePosts.length > 1 ? visiblePosts.slice(1) : []
+ const discoveryPosts = visiblePosts.slice(0, 5)
+ const remainingPosts = visiblePosts.slice(5)
```

In ListHeaderComponent:
```diff
- {heroPost ? (
-   <View style={styles.heroWrapper}>
-     <PressableOpacity ...>
-       ...hero card JSX...
-     </PressableOpacity>
-   </View>
- ) : ...}
+ {discoveryPosts.length > 0 ? (
+   <DiscoveryStack
+     posts={discoveryPosts}
+     userId={feed.currentUserId}
+     onInteraction={trackInteraction}
+     userNeighborhood={feed.userNeighborhood}
+     userLocation={feed.userLocation}
+   />
+ ) : ...}
```

### L3. Interaction tracking

**File:** `src/hooks/useInteractionTracker.ts`

Already tracks: view, click, like, save, message, skip, hide.
The 'skip' interaction from left-swipe feeds back into the algorithm:
- `personalScores` in feedAlgorithm can down-rank similar posts
- Existing `get_collaborative_recommendations()` DB function already uses this

### L4. Animation spec

```
Duration: 250ms spring (friction: 6, tension: 180)
Swipe threshold: 120px horizontal, 80px vertical
Rotation: ±15° during swipe (like Tinder)
Opacity: fade to 0.3 at threshold
Next card peek: scale 0.95, offset -8px behind current
Reduced motion: instant replace, no spring
```

### L5. Files to modify

| File | Change |
|------|--------|
| `src/components/DiscoveryStack.tsx` | NEW — swipeable card stack |
| `app/(tabs)/index.tsx` | Replace hero card with DiscoveryStack |
| `src/lib/i18n/*.json` | "Swipe to discover" hint text |

---

## Sprint M: Feed Algorithm Surface

**Why:** The algorithm EXISTS (`feedAlgorithm.ts`) but users don't know.
The UI only shows "newest" and "nearest" — hiding "recommended", "popular", "cheapest".

### M1. Expose all sort options

**File:** `app/(tabs)/index.tsx`

```diff
  const SORT_OPTIONS: { key: FeedSortBy; label: string }[] = useMemo(() => [
+   { key: 'recommended', label: t('feed.sortRecommended') },
    { key: 'newest', label: t('feed.sortNewest') },
+   { key: 'popular', label: t('feed.sortPopular') },
    { key: 'nearest', label: t('feed.sortNearest') },
+   { key: 'cheapest', label: t('feed.sortCheapest') },
  ], [t])
```

### M2. Visual indicator for active sort

Currently no visual feedback for which sort is active.
Add a subtle label under the header:

```tsx
{sortBy !== 'recommended' && (
  <View style={styles.sortIndicator}>
    <Text style={[styles.sortIndicatorText, { color: colors.mutedForeground }]}>
      {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
    </Text>
    <PressableOpacity onPress={() => handleSortChange('recommended')} hitSlop={8}>
      <X size={12} color={colors.mutedForeground} />
    </PressableOpacity>
  </View>
)}
```

### M3. "For you" explanations

When sort is 'recommended', show WHY each post appears:
- "Follows you" badge
- "Popular in Kallio" badge
- "Boosted" badge
- "Urgent" badge

These already exist partially (urgency, boost) but not as explanatory labels.

**File:** `src/components/PostCardGrid.tsx`

Add small pill below category pill:
```tsx
{post.is_boosted && <Text style={styles.reasonPill}>Boosted</Text>}
{isFollowed && <Text style={styles.reasonPill}>Follows you</Text>}
```

### M4. Translations

```json
{
  "feed.sortRecommended": "Suositeltu",
  "feed.sortPopular": "Suosittu",
  "feed.sortCheapest": "Halvin ensin"
}
```

### M5. Files to modify

| File | Change |
|------|--------|
| `app/(tabs)/index.tsx` | Add all 5 sort options, sort indicator |
| `src/components/PostCardGrid.tsx` | Add recommendation reason pills |
| `src/lib/i18n/*.json` | Sort + reason translations |

---

## Sprint N: Map-Feed Toggle

**Why:** The map is a separate screen (`app/map.tsx` — 11-line wrapper).
Users can't toggle between list and map views like Airbnb.

### N1. Unified feed/map toggle

**File:** `app/(tabs)/index.tsx`

Add toggle button next to the sort button in the header:

```tsx
<PressableOpacity
  onPress={() => setViewMode(prev => prev === 'list' ? 'map' : 'list')}
  style={[styles.circleBtn, { ... }]}
>
  {viewMode === 'list' ? (
    <Map size={16} color={colors.foreground} />
  ) : (
    <LayoutGrid size={16} color={colors.foreground} />
  )}
</PressableOpacity>
```

### N2. Inline map component

When `viewMode === 'map'`, replace the FlatList with a map showing post pins:

```tsx
{viewMode === 'map' ? (
  <FeedMapView
    posts={visiblePosts}
    userLocation={feed.userLocation}
    onPostPress={(post) => router.push(`/post/${post.id}`)}
    activeFilter={feed.activeFilter}
  />
) : (
  <FlatList ... />  // existing feed
)}
```

**File:** `src/components/FeedMapView.tsx` (NEW)

Uses `react-native-maps` (MapView):
- Clusters nearby posts (react-native-map-clustering)
- Color-coded pins by category (tarvitsen=orange, tarjoan=purple, etc.)
- Bottom sheet preview card on pin tap (show post title + image + CTA)
- Filter bar stays visible above map
- User location blue dot

### N3. Map data

Posts already have `latitude` and `longitude` fields. The `useFeedData` hook
already fetches posts with these fields. No backend changes needed.

**PostGIS function already exists:** `find_neighborhood(lat, lng)` for reverse geocoding.

### N4. Dependencies

- `react-native-maps` — already in the project (used by MapNative)
- Map clustering library needed: `react-native-map-clustering` or custom

### N5. Files to modify

| File | Change |
|------|--------|
| `src/components/FeedMapView.tsx` | NEW — map view with post pins |
| `src/components/MapPostPreview.tsx` | NEW — bottom sheet post card |
| `app/(tabs)/index.tsx` | Add view mode toggle, conditional render |
| `src/lib/i18n/*.json` | Map view translations |

---

## Sprint O: Social Proof + Offer Button

**Why:** Users don't know if a post is popular. No way to negotiate price.

### O1. Database: `post_views` table

```sql
CREATE TABLE post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT now()
);

-- Unique per user per post per day (prevent spam counting)
CREATE UNIQUE INDEX idx_post_views_unique ON post_views(post_id, user_id, (viewed_at::date));

-- Fast count query
CREATE INDEX idx_post_views_post ON post_views(post_id);

-- Materialized view for performance
CREATE MATERIALIZED VIEW mv_post_view_counts AS
SELECT post_id, COUNT(DISTINCT user_id) as unique_views
FROM post_views
WHERE viewed_at > now() - interval '7 days'
GROUP BY post_id;
```

### O2. Database: `offers` table

```sql
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, from_user_id, status) -- one active offer per user per post
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_participants" ON offers
  FOR ALL USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
```

### O3. Social proof on post cards

**File:** `src/components/PostCardGrid.tsx`

Add view count indicator:
```tsx
{viewCount > 3 && (
  <View style={styles.viewCountPill}>
    <Eye size={10} color={colors.mutedForeground} />
    <Text style={styles.viewCountText}>
      {viewCount} {t('post.watching')}
    </Text>
  </View>
)}
```

**File:** `app/post/[id].tsx`

Add "X henkilöä katsoo" banner + "Tee tarjous" button:
```tsx
{viewCount > 0 && (
  <View style={styles.socialProof}>
    <Eye size={14} color={colors.mutedForeground} />
    <Text>{viewCount} {t('post.viewing')}</Text>
  </View>
)}

{post.type === 'tarjoan' && post.service_price && (
  <PressableOpacity onPress={openOfferModal} style={styles.offerBtn}>
    <Text>{t('post.makeOffer')}</Text>
  </PressableOpacity>
)}
```

### O4. Offer flow

1. User taps "Tee tarjous" on a `tarjoan` post
2. Modal: amount input (pre-filled with listed price), optional message
3. Submit → insert into `offers` table
4. Creates conversation (or reuses existing) with offer context
5. Push notification to seller: "Sait tarjouksen: 15€ pyörästä"
6. Seller can accept/reject in conversation thread

### O5. Track post views

**File:** `app/post/[id].tsx`

On mount, insert view (fire-and-forget):
```ts
useEffect(() => {
  if (post?.id && userId) {
    supabase.from('post_views').upsert(
      { post_id: post.id, user_id: userId },
      { onConflict: 'post_id,user_id,viewed_at::date' }
    ).catch(() => {})
  }
}, [post?.id, userId])
```

### O6. Files to modify

| File | Change |
|------|--------|
| `supabase/migrations/2026XXXX_social_proof.sql` | NEW — post_views + offers tables |
| `src/components/PostCardGrid.tsx` | Add view count pill |
| `app/post/[id].tsx` | Track views, show social proof, offer button |
| `src/components/OfferModal.tsx` | NEW — make offer modal |
| `src/lib/types.ts` | Add Offer interface |
| `src/lib/i18n/*.json` | Offer + social proof translations |

---

## Summary: All Sprints

| Sprint | Feature | New Files | Modified Files | DB Changes | Edge Functions |
|--------|---------|-----------|---------------|------------|---------------|
| K | Saved Search + Push | 1 migration, 1 EF | 4 screens | 1 table | 1 new (cron) |
| L | Swipeable Discovery | 1 component | 1 screen | none | none |
| M | Algorithm Surface | none | 2 screens | none | none |
| N | Map-Feed Toggle | 2 components | 1 screen | none | none |
| O | Social Proof + Offers | 1 migration, 1 component | 2 screens | 2 tables + 1 MV | none |

**Total:** 5 new components, 2 migrations, 1 new Edge Function, ~8 modified screens

### Dependency graph

```
Sprint K (saved search) ──── independent
Sprint L (discovery)    ──── independent (uses existing algorithm)
Sprint M (algorithm UI) ──── independent (exposes existing code)
Sprint N (map toggle)   ──── independent (uses existing post data)
Sprint O (social proof) ──── independent (new tables)
```

All sprints are independent — can be done in any order or in parallel.

**Recommended order:** K → M → L → O → N
- K first: highest retention impact
- M second: lowest effort, immediate UX improvement
- L third: visual impact, uses algorithm
- O fourth: conversion improvement
- N last: requires react-native-maps setup

---

## Structural Fix: Navigation Depth

**Parallel with sprints:** Flatten the deepest paths.

| Current Path (4+ taps) | Proposed Fix |
|------------------------|-------------|
| Feed → Explore → Community Events → Event → Chat | Feed tab shows events inline; Event → Chat is 2 taps |
| Feed → Search → Post → Message → Conversation | Direct "Message" from post saves 1 tap (already done) |
| Profile → Settings → Saved Searches | Saved searches accessible from search screen directly |
| Explore → Groups → Group → Post | Groups tab in bottom nav? Or merge into Explore as first-class |

**Key principle:** Any action should be ≤3 taps from a tab screen.

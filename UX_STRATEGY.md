# TackBird Mobile -- UX Strategy & Product Roadmap

**Author:** Product Strategy Analysis
**Date:** March 2026
**Version:** 1.0
**Scope:** Comprehensive UX strategy to position TackBird as the leading hyperlocal neighborhood app in Finland, with a path to Nordic expansion.

---

## Executive Summary

TackBird sits at a unique intersection in the neighborhood app space. It is neither a "give stuff away" app (Olio), nor a "complain about your neighborhood" feed (Nextdoor), nor a generic community overlay (Facebook Groups). TackBird is a **structured neighborhood bulletin board** with six clear categories, Finnish-first identity, and a trust system rooted in verified location.

This document analyzes the current mobile app state, identifies critical gaps against competitors, and lays out a concrete 30-day roadmap to transform TackBird from a functional prototype into a product that users open daily.

The single most important insight: **TackBird's magic is not in the content -- it is in the speed of connection between neighbors.** Every UX decision should be measured against one question: "Does this help a neighbor who needs something find a neighbor who has it, faster?"

---

## 1. Information Architecture

### Current State

```
Feed | Community | Create | Messages | Profile
```

The Community tab contains three sub-tabs (Groups, Forum, Events), making it a catch-all container. Events are hidden from the tab bar (`href: null` in `_layout.tsx`), accessible only through Community. The Map is accessible only from the Header.

### Problem Analysis

**Community tab is structurally confused.** It tries to be three things at once: a social groups feature, a discussion forum, and an events listing. Users do not think in these buckets -- they think "what is happening near me?" and "who can I connect with?"

**The Map is buried.** For a hyperlocal app, the spatial view should be a first-class citizen, not an icon in the header. Nextdoor puts the map one tap away. TackBird hides it behind a small icon that many users will never discover.

**Events have no clear home.** They exist in Community > Events sub-tab, in the hidden `events.tsx` tab, as hero cards on the home feed, and on the map. This fragmentation means no single place gives the user a complete event picture.

### Recommended Architecture

```
Home | Explore | Create | Messages | Profile
```

**Home (Feed)** -- Personalized feed of posts from your neighborhood. This stays largely as-is but becomes more contextual (see Section 3).

**Explore** -- The big change. This tab merges Map + Events + Discovery into a single spatial-first experience.
- Default view: Map showing posts, events, and places near you
- Toggle to list view for events ("What is happening this week?")
- Toggle to browse nearby places ("Cafes near me")
- Sub-filters for all content types

This mirrors how Apple Maps merges search + explore + guides into one tab. For TackBird, the Explore tab answers "What is around me?" -- the core question of any hyperlocal app.

**Community features (Groups, Forum)** move to the Profile tab as sub-sections, or become accessible through the feed (group posts appear in the main feed). Groups are a social layer on top of the neighborhood, not a separate destination. Facebook understood this -- Groups are a filter on the feed, not a separate app section.

**Why this works:**
- Reduces cognitive load from 5 distinct sections to 4 focused ones
- Gives the map the prominence it deserves in a location-based app
- Eliminates the "where do I find events?" confusion
- Groups/Forum can grow organically without needing their own tab

### Migration Path

This is a major structural change. Implement incrementally:
1. Week 1: Rename Community tab to "Explore", make Map the default view within it
2. Week 2: Add list/grid toggles for events and places within Explore
3. Week 3: Move Groups/Forum access to Profile or a dedicated section accessed from the header
4. Week 4: Remove the old separate Events screen, consolidate all event flows into Explore

---

## 2. First-Time User Experience

### Current State

1. User downloads app
2. Login/register screen (email + password, Google/Apple placeholders)
3. 3-screen onboarding: Welcome > Categories explanation > Neighborhood selection + location verification
4. Lands on home feed

### Critical Problem: The Cold Start

After onboarding, users land on a feed that may have zero posts in their neighborhood. The cold start message is: "Ei ilmoituksia. Ole Kallion ensimmainen!" (No posts. Be the first in Kallio!). This is the #1 killer of new user retention.

**Nextdoor solves this** by requiring a critical mass of verified users before launching a neighborhood. TackBird cannot do this as an early-stage app.

**Olio solves this** by showing content from a wider radius (up to 50km) and using "Food Waste Heroes" to seed content.

### Recommended FTUE (First-Time User Experience)

**Step 1: "Your Neighborhood is Alive" (before showing empty feed)**

Even without user-generated posts, the neighborhood is not empty. TackBird already fetches Helsinki LinkedEvents and local places. Use this data to create an immediate sense of life:

```
Good morning, Jesse!

Here is what is happening in Kallio today:

  [Event Card] Yoga in the park -- Karhupuisto, 10:00
  [Event Card] Kirpputorippaiva -- Kallio library, 12:00

  3 cafes within 500m are open now
  12 events this week in Kallio

  --------

  No neighbor posts yet in Kallio.
  Be the first to say hello!

  [Introduce yourself]  [Post something you need]
```

**Step 2: "Seed content" system**

Create a `is_seed: true` flag on posts (already exists in the Post type). Pre-populate neighborhoods with 10-15 seed posts that look like real content:

- "Tarvitsen: Onko kellaan porakonetta lainattavaksi?" (Need: Anyone have a drill to borrow?)
- "Tarjoan: Vapaaehtoinen koiranulkoiluttaja, ota yhteytta!" (Offer: Volunteer dog walker, get in touch!)
- "Ilmaista: Sohva hyvakuntoinen, pitaa noutaa tanaan" (Free: Couch in good condition, must pick up today)

These seed posts should:
- Have realistic Helsinki profile photos (stock photos, attributed)
- Be marked as seed content internally (never counted in stats)
- Gradually be replaced by real content as the neighborhood grows
- Have a subtle "[Example post]" label so users understand

**Step 3: "Neighborhood Welcome" push notification**

24 hours after signup:
> "Tervetuloa Kallioon! 3 naapurisi liittyivat myos talla viikolla. Katso mita he tarvitsevat."

This creates social proof even with low user counts.

**Step 4: Progressive onboarding, not front-loaded**

Current onboarding is 3 screens before the user sees any content. Move to contextual education:

- Screen 1: Welcome + login (keep)
- Screen 2: Neighborhood selection only (keep, this is critical for the product)
- Remove: Category education screen (teach categories when user first taps Create)
- Add: In-feed tooltips that appear on first 3 sessions:
  - Session 1: "Tap a post to see details and message the poster"
  - Session 2: "Filter by category to find what you need" (highlight filter bar)
  - Session 3: "Tap the map icon to see everything around you" (highlight map icon)

---

## 3. Content Hierarchy on Home Screen

### Current State

The home screen currently shows (top to bottom):
1. Sticky filter bar with neighborhood picker + category chips + "Following" toggle
2. Alert banner (if any)
3. Hero event card (today's event, or tomorrow's, or this week's)
4. Discovery section (nearby places carousel)
5. "New posts" banner (if realtime updates detected)
6. "Latest listings" section header
7. Post cards with date group separators (today, yesterday, this week, earlier)
8. "All caught up" footer

### Analysis

This is already well-structured -- better than Nextdoor's chaotic algorithmic feed. But it lacks personality and contextual awareness.

### Recommended Changes

**A. Time-aware greeting header (highest impact, lowest effort)**

Replace the static TackBird slogan with a contextual header:

```
Morning (06-12):  "Huomenta, Kallio"  + sunrise gradient accent
Afternoon (12-17): "Iltalypsy, Kallio" + warm accent
Evening (17-22):  "Iltatunnelmia, Kallio" + dusk gradient (Helsinki Dusk theme!)
Night (22-06):    "Hiljaista Kalliossa" + muted everything
```

Below the greeting, show 1-2 contextual "nuggets":
- "3 new posts since you last visited"
- "Your neighbor Mikko is looking for a drill"
- "Kalevala Day event tomorrow at Karhupuisto"
- Weather widget is NOT recommended (adds noise, not core to the product)

**B. Urgency section for Nappaa posts**

Nappaa (grab it quick, 24h expiring items) is TackBird's most unique and time-sensitive category. Currently these posts are mixed into the general feed. They should get a dedicated section above the feed when any exist:

```
Nappaa nyt! (3 expiring today)
[horizontal scroll of compact nappaa cards with countdown timers]
```

This creates urgency and a reason to check the app multiple times per day -- the same mechanic that makes Olio addictive ("free food available NOW").

**C. Reorganize content priority**

Optimal order:
1. Contextual greeting + nuggets (new)
2. Alert banner (keep)
3. Nappaa urgency section (new -- only when nappaa posts exist)
4. Hero event card (keep, already well-implemented)
5. Category filter bar (move from sticky to inline, or keep sticky -- test both)
6. Post feed with date separators (keep)
7. Discovery section (move to Explore tab instead)

**D. Remove discovery/places from home feed**

The nearby places carousel belongs in the Explore tab, not the home feed. The home feed should be purely about neighbor-to-neighbor content. Mixing in business listings dilutes the community feel. Nextdoor made this mistake by adding business recommendations to the feed -- it made the app feel commercial.

---

## 4. Engagement Loops

### The Core Loop

```
Need something --> Open TackBird --> Find it (or post it) --> Get a response --> Transaction/help happens --> Rate the interaction --> Feel good --> Come back
```

### What Makes Users Return (Ranked by Effectiveness)

**Tier 1: Direct value (someone responds to you)**
- Push notification: "Mikko vastasi ilmoitukseesi" (Mikko replied to your post)
- Push notification: "Uusi viesti Mikkolta" (New message from Mikko)
- These are transactional and the most powerful retention driver

**Tier 2: Curiosity (something relevant is happening)**
- Push notification: "Naapurisi etsii porakonetta -- voitko auttaa?" (Your neighbor is looking for a drill -- can you help?)
- Push notification: "3 uutta ilmoitusta Kalliossa" (3 new posts in Kallio) -- daily digest
- These work because they appeal to helpfulness and FOMO

**Tier 3: Social proof (your neighborhood is active)**
- In-app badge: "Kallio is active today -- 12 new posts"
- Weekly email: "This week in Kallio: 45 posts, 8 events, 3 items given away"

**Tier 4: Gamification (track your impact)**
This is where TackBird should differentiate from Nextdoor (which has no gamification) and learn from Olio (which does impact tracking well).

### Recommended Engagement System: "Naapurustopisteet" (Neighborhood Points)

Every meaningful action earns points:
| Action | Points |
|--------|--------|
| Create a post | 10 |
| Respond to someone's need (confirmed by poster) | 25 |
| Give something away (confirmed) | 30 |
| Lend an item (confirmed) | 20 |
| Attend a community event | 15 |
| Leave a review | 10 |
| Get a 5-star review | 15 |
| 7-day streak (active every day) | 50 |

**Badges (already in the system but not visible enough):**
- `first_post` -- First post in the neighborhood
- `helper` -- Helped 5 neighbors
- `trusted` -- 10 positive reviews
- `neighborhood_hero` -- Top contributor this month
- `lender` -- Lent 5+ items

**Monthly leaderboard (neighborhood-scoped):**
"Top helpers in Kallio this month" -- shows top 5 contributors. This creates healthy competition without the toxicity of global leaderboards.

**Impact dashboard on profile:**
```
Your impact in Kallio:
  12 neighbors helped
  8 items saved from waste
  3 items lent
  120 Neighborhood Points
  Current streak: 5 days
```

Olio's "impact" screen is their most shared feature. TackBird should steal this idea but expand it beyond just waste reduction to include all forms of neighborly help.

### Notification Strategy

**DO:**
- Notify when someone responds to your post (immediate)
- Daily digest at 18:00: "3 new things happening near you" (configurable)
- Notify about nappaa posts expiring near you (time-sensitive)
- Notify when someone you follow posts something
- Weekly summary email

**DO NOT:**
- Notify about every new post (this is what killed Nextdoor's reputation)
- Send more than 3 push notifications per day
- Notify about posts outside user's neighborhood
- Send notifications between 22:00-08:00

The notification preferences screen already has 7 toggles. This is the right granularity. The key is sensible defaults.

---

## 5. Trust & Safety

### TackBird's Trust Advantage

TackBird already has a location verification system (`useLocationVerification` hook). This is a significant competitive advantage over Facebook Groups (no verification) and even Nextdoor (which uses address verification but has been gamed).

### Making Trust Visible

**A. Verification badge prominence**

The `BadgeCheck` icon currently appears next to verified users' names in post cards. This is good but not enough. Make it a first-class feature:

- Verified users get a subtle green border on their avatar (already partially implemented with pro badge)
- Non-verified users see a gentle prompt: "Vahvista sijaintisi -- naapurisi luottavat sinuun enemman" (Verify your location -- your neighbors will trust you more)
- Verified users' posts should rank slightly higher in the feed (soft signal, not hard filter)

**B. Response rate as trust signal**

The `response_rate` field exists on profiles. Display it prominently:
```
Mikko K.  [Verified]
Kallio -- responds within 2 hours
Rating: 4.8 (12 reviews)
```

Nextdoor does not show response rates. This is TackBird's chance to build a reputation system closer to Airbnb's host profiles.

**C. Review system visibility**

Reviews exist in the database but the profile screen shows them minimally. Make reviews a central part of the trust story:
- After every completed transaction (confirmed via in-app flow), prompt both parties to review
- Show the 3 most recent reviews on profile previews (not just the profile page)
- Aggregate neighborhood trust: "Kallio residents average 4.7 stars"

**D. Anonymous posting with accountability**

The `is_anonymous` flag on posts is a smart feature (some needs are embarrassing to post publicly). But anonymous posts should:
- Still require a verified account (the system knows who posted)
- Be clearly labeled as anonymous
- Not be eligible for the "trusted" badge benefits
- Have a moderation path (reports go to the actual user)

**E. Community moderation**

Not yet implemented, but critical for safety:
- Report button on every post and profile (currently just a "more" menu with share)
- Auto-hide posts with 3+ reports until admin review
- Block user functionality
- Admin dashboard for reviewing reports (web-side, not mobile)

---

## 6. Monetization-Ready UX

### Current Pro System

The app already has `is_pro` and `is_pro_listing` flags, pro badges (Crown icon), and a pro color (#F59E0B amber). The Stripe integration is pending. This is architecturally ready but UX-unfinished.

### Three Revenue Streams

**A. Pro Listings (B2C) -- Boost your post**

How it should feel: Like Tori.fi's "Nosta" (boost) feature, not like Facebook Ads.

Current implementation shows a gold crown badge and a pro banner. This is already visually distinct without being obnoxious. Recommendations:
- Pro listings should appear at the top of the feed with a subtle "Promoted" label (not "Ad")
- Limit to 1 pro listing per 10 organic posts (Facebook's ad frequency is 1:4 -- TackBird should be less aggressive)
- Pro listing benefits: pinned for 7 days, appears in all nearby neighborhoods (not just poster's), highlighted in search
- Price: 4.99 EUR / listing

**B. Pro Subscription (B2C) -- Power user features**

Monthly subscription (9.99 EUR/month) for:
- Unlimited pro listings (vs. pay-per-listing)
- Read receipts on messages (currently shown but should be pro-only)
- Advanced search filters (distance radius, price range)
- Profile analytics (who viewed your posts, trending posts in your area)
- Custom profile badge (Crown icon, already implemented)

**C. Business Profiles (B2B) -- Local business presence**

The `is_business`, `business_name`, and `business_vat_id` fields already exist in the Profile type. Build this out:
- Business profiles get a storefront-style layout (cover photo, business hours, services)
- Can create "tarjoan" posts that appear in the feed as business offers
- Appear on the map as permanent pins (like Google Maps business listings)
- Monthly fee: 29.99 EUR/month
- Key differentiator from Nextdoor: TackBird business profiles feel like a neighbor, not an advertiser

### UX Integration Principles

1. **Never break the community feel.** Monetized content should look 90% like organic content with a subtle label
2. **Value exchange must be clear.** Pro users get measurable benefits, not just a badge
3. **Free tier must remain fully functional.** Monetization adds convenience, not gates core functionality
4. **Local businesses are neighbors too.** Business posts should follow the same category system (a cafe offering free leftover pastries = "ilmaista" post from a business)

---

## 7. Key Screen Redesign Priorities

### Home Feed -- #1 Priority: Contextual awareness

The feed is technically strong (skeleton loading, realtime updates, date grouping, pull-to-refresh haptics). What it lacks is **personality**. A feed that says "Huomenta, Kallio -- 3 naapuriasi tarvitsevat apua" feels fundamentally different from a generic list of cards.

**Specific change:** Add a `FeedContextHeader` component that renders above the post list, showing a time-aware greeting, nappaa urgency strip (when applicable), and a "neighborhood pulse" stat ("12 active neighbors today").

### Community Tab -- #1 Priority: Merge into Explore or eliminate

This tab is the weakest part of the app. It fetches groups and forum posts that largely do not exist yet (empty states dominate). Rather than building out Groups and Forum as separate features, integrate community engagement into the feed itself:
- Group posts appear in the main feed with a group tag
- Forum discussions are really just text-only posts (map to "ilmaista" or a new "keskustelu" category)
- Events move to the Explore tab

### Create Flow -- #1 Priority: Reduce friction on the form step

The create flow is well-designed (2-step: category selection then form). The form step has too many fields visible at once. Recommendation:
- Show only title + description initially
- "Add more details" expandable section for: location, images, tags, expiration, event details
- Auto-suggest location from GPS
- Auto-suggest tags based on title text (ML-ready, hardcode rules for now)

The category selection grid is excellent -- six clear options with icons and colors. Keep this.

### Post Detail -- #1 Priority: CTA prominence

When viewing a post, the primary action ("Message the poster" or "Attend event") should be a fixed bottom bar, not scrolled inline. This is standard in marketplace apps (Tori.fi, Facebook Marketplace) and dramatically increases conversion.

```
Fixed bottom bar:
[Message poster]  [Share]
```

### Messages -- #1 Priority: Post context in conversations

When you message someone about a post, the conversation should show the post context at the top (thumbnail + title + category). Currently conversations are generic. Adding post context helps users who have multiple conversations remember what each one is about.

### Profile -- #1 Priority: Impact dashboard

The profile currently shows basic stats (posts, followers, following) and a tab for overview/activity. Add:
- Impact stats section (neighbors helped, items shared, points earned)
- Badges section with visual badge icons (the `BADGE_ICONS` mapping already exists but is underutilized)
- "Trusted neighbor" score (calculated from reviews, response rate, verification status)

### Map -- #1 Priority: Promote to tab-level navigation

The map is a fully-developed feature (neighborhood filtering, detail panels, search, GPS) but hidden behind a header icon. Making it the centerpiece of the Explore tab gives it the prominence it deserves and aligns with TackBird's spatial identity.

---

## 8. Mobile-First Patterns

### Already Implemented (Good)

- Pull-to-refresh with haptic feedback
- Press-scale animation on post cards (`transform: [{ scale: 0.98 }]`)
- Haptic feedback on filter changes (`Haptics.selectionAsync`)
- Haptic feedback on post card tap (`Haptics.impactAsync(Light)`)
- Smooth skeleton loading with shimmer animation
- Memoized components (`PostCard` wrapped in `memo`)
- Keyboard-avoiding views on forms

### Recommended Additions

**A. Swipe gestures on post cards**

- Swipe right: Save/bookmark (with Haptics.impactAsync(Medium))
- Swipe left: Share
- Implementation: Use `react-native-gesture-handler` Swipeable component
- Visual feedback: Reveal colored background (green for save, blue for share) as user swipes
- This eliminates the current "three dots > expand > share" flow which is 3 taps for a 1-tap action

**B. Long-press preview**

- Long-press on a post card: Show a blurred-background modal with the post detail (like iOS Peek)
- Release to dismiss, press harder to open full detail
- This lets users preview posts without committing to navigation
- Implementation: Use `react-native-reanimated` for the scale animation + blur

**C. Haptic-enhanced interactions**

Add haptics to these currently-silent interactions:
- Like/unlike a post: `Haptics.notificationAsync(Success)` -- the "thunk" feedback that Instagram made famous
- Save a post: `Haptics.impactAsync(Medium)`
- Send a message: `Haptics.impactAsync(Light)`
- Pull-to-refresh trigger point: `Haptics.impactAsync(Heavy)` -- already partially implemented via RefreshControl

**D. Contextual bottom sheets instead of modals**

Replace the current `Modal` components (neighborhood picker, follow list) with bottom sheets (`@gorhom/bottom-sheet`). Bottom sheets:
- Feel more native on iOS
- Support swipe-to-dismiss
- Can be partially open (peek state)
- Are the standard in modern apps (Apple Maps, Google Maps, Uber)

**E. Animated tab transitions**

Current tab switches are instant cuts. Add shared-element transitions:
- Feed to Post Detail: Post card image expands into full-width gallery
- Profile avatar tap: Avatar expands into full profile view
- These create a sense of spatial continuity

**F. Skeleton-first loading**

The app already has excellent skeleton loading on the feed. Extend this pattern to:
- Messages list (currently shows nothing while loading)
- Profile page
- Search results
- Community tab

**G. Smart keyboard behavior**

- Auto-dismiss keyboard when scrolling the feed (already done via ScrollView behavior)
- Auto-focus the title field when entering Create flow
- "Done" button above keyboard on multi-line description fields

---

## 9. The Magic Moment

### Defining TackBird's Aha Moment

TackBird's magic moment is: **"I posted that I need help moving, and my neighbor Mikko offered to help within 30 minutes."**

This is the moment when the app transitions from "a tool I downloaded" to "my neighborhood network." It proves the app works, that neighbors are real and responsive, and that asking for help is safe and rewarded.

### Metrics to Track

- **Time to first response:** How long from post creation to first message/comment
- **Response rate by category:** Which categories get the fastest responses
- **Conversion rate:** What % of posts result in at least one response
- **Magic moment rate:** What % of new users experience a response within 24h of their first post

### Architecting the UX for Speed

**A. Smart matching notifications**

When someone posts "Tarvitsen: apua muutossa" (Need: help with moving), the system should:
1. Parse the post category and tags
2. Find nearby users who have previously offered similar help (posted "tarjoan" with "muutto" tag)
3. Send them a targeted push: "Naapurisi tarvitsee muuttoapua -- voitko auttaa?" (Your neighbor needs moving help -- can you help?)

This is not AI -- it is simple tag/category matching. But it dramatically increases response speed.

**B. "Quick response" templates**

When a user opens a post and taps "Message", offer quick response options:
- "Voin auttaa! Milloin sopii?" (I can help! When works?)
- "Mulla on sellainen! Laita viesti niin sovitaan." (I have one! Message me to arrange.)
- "Kuinka kiireellinen tilanne on?" (How urgent is this?)

These reduce the friction from "I want to help" to "I am helping" from 30 seconds of typing to 1 tap.

**C. Post creation guidance**

When creating a "tarvitsen" post, show a tip:
> "Ilmoitukset joissa on kuva saavat 3x enemman vastauksia" (Posts with photos get 3x more responses)

> "Lisaa sijainti niin lahella olevat naapurit loytvat sinut nopeammin" (Add a location so nearby neighbors find you faster)

**D. Response time display**

Show response time expectations on the create success screen:
> "Kalliossa vastauksia tulee yleensa 2 tunnissa" (In Kallio, responses typically come within 2 hours)

This sets expectations and builds confidence.

**E. First-response celebration**

When a new user gets their first response, show a celebration overlay:
```
[Confetti animation]

Ensimmainen vastauksesi!
Naapurisi Mikko tarjoutui auttamaan.

Nain TackBird toimii -- naapurit auttavat toisiaan.

[Avaa viesti]
```

This emotional moment cements the user's relationship with the app.

---

## 10. Concrete 30-Day Roadmap

### Week 1: Foundation (Days 1-7)

| # | Task | Impact | Effort | Files |
|---|------|--------|--------|-------|
| 1 | **Contextual feed header** -- Time-aware greeting + neighborhood name + nuggets | High | Medium | `index.tsx`, new `FeedContextHeader.tsx` |
| 2 | **Nappaa urgency strip** -- Horizontal scroll of expiring nappaa posts above the feed | High | Medium | `index.tsx`, new `NappaaUrgencyStrip.tsx` |
| 3 | **Swipe-to-save on post cards** -- Right-swipe to bookmark with haptic + visual feedback | Medium | Medium | `PostCard.tsx` |
| 4 | **Like haptic enhancement** -- `notificationAsync(Success)` on like, `impactAsync(Medium)` on save | Medium | Low | `PostCard.tsx` |
| 5 | **Quick response templates** -- 3 pre-written response options when messaging about a post | High | Medium | `messages/[id].tsx` |

**Week 1 goal:** The feed feels alive and personal. Core interactions have satisfying tactile feedback.

### Week 2: Navigation & Discovery (Days 8-14)

| # | Task | Impact | Effort | Files |
|---|------|--------|--------|-------|
| 6 | **Rename Community to Explore** -- Map as default view, events as list toggle | High | High | `_layout.tsx`, `community.tsx` -> `explore.tsx` |
| 7 | **Move places/discovery to Explore** -- Remove from home feed, integrate into Explore map + list views | Medium | Medium | `index.tsx`, `explore.tsx` |
| 8 | **Post context in conversations** -- Show referenced post thumbnail + title at top of message thread | Medium | Medium | `messages/[id].tsx` |
| 9 | **Skeleton loading on all screens** -- Extend shimmer pattern to messages, profile, search | Low | Medium | Multiple files |
| 10 | **Bottom sheet for neighborhood picker** -- Replace Modal with `@gorhom/bottom-sheet` | Medium | Medium | `NeighborhoodPicker.tsx` |

**Week 2 goal:** The app structure makes spatial sense. Explore tab is the discovery hub.

### Week 3: Engagement & Trust (Days 15-21)

| # | Task | Impact | Effort | Files |
|---|------|--------|--------|-------|
| 11 | **Impact dashboard on profile** -- Neighbors helped, items shared, points, streak | High | Medium | `profile.tsx` |
| 12 | **Badge showcase on profile** -- Visual grid of earned badges with descriptions | Medium | Low | `profile.tsx` |
| 13 | **Smart match notifications** -- When someone posts "tarvitsen", notify relevant "tarjoan" users nearby | High | High | Backend + `usePushNotifications.ts` |
| 14 | **First response celebration** -- Confetti overlay when new user gets first reply | High | Low | New `FirstResponseCelebration.tsx` |
| 15 | **Daily digest notification** -- 18:00 summary of new posts in neighborhood | Medium | Medium | Backend + notification service |

**Week 3 goal:** Users have a reason to come back. The trust system is visible and motivating.

### Week 4: Polish & Monetization Prep (Days 22-30)

| # | Task | Impact | Effort | Files |
|---|------|--------|--------|-------|
| 16 | **Fixed bottom CTA on post detail** -- "Message poster" always visible | High | Low | `post/[id].tsx` |
| 17 | **Progressive create form** -- Essential fields first, "Add details" expandable section | Medium | Medium | `create.tsx` |
| 18 | **Report/block functionality** -- Report button on posts and profiles, block user | High | Medium | Multiple files |
| 19 | **Pro listing UX** -- Visual design for promoted posts (crown badge + boost animation) | Medium | Low | `PostCard.tsx` |
| 20 | **Seed content system** -- 10 seed posts per neighborhood, marked as examples | Medium | High | Backend + seed script |

**Week 4 goal:** The app is production-ready with safety features and monetization hooks.

---

## Competitive Positioning Summary

| Dimension | Nextdoor | Olio | FB Groups | TackBird (Current) | TackBird (Target) |
|-----------|----------|------|-----------|-------------------|-------------------|
| Hyperlocal focus | Strong | Medium | Weak | Strong | Best-in-class |
| Content structure | Weak (noise) | Strong (focused) | Weak (cluttered) | Strong (6 categories) | Strong |
| Trust system | Medium | Weak | Weak | Medium | Strong |
| Engagement/gamification | Weak | Strong | Weak | Weak | Strong |
| Map/spatial | Medium | Weak | None | Medium (buried) | Strong (tab-level) |
| Monetization feel | Aggressive | Subtle | Aggressive | Not started | Subtle |
| Cold start solution | Good (address verify) | Good (heroes) | N/A (large base) | Poor | Good (seed + events) |
| Finnish identity | None | None | None | Strong | Strongest differentiator |

---

## Key Metrics to Track

1. **DAU/MAU ratio** -- Target: 40%+ (Nextdoor is ~25%, indicating low engagement)
2. **Time to first response** -- Target: <2 hours median
3. **Magic moment rate** -- Target: 60% of new users get a response within 24h
4. **Posts per user per month** -- Target: 2+ (Nextdoor is <1)
5. **Session length** -- Target: 3-5 minutes (efficient, not addictive)
6. **Retention D7** -- Target: 40%+
7. **NPS** -- Target: 50+ (neighborhood apps typically score 20-30)

---

## Final Thought

TackBird's greatest risk is not feature completeness -- the app is already more feature-complete than most Series A neighborhood apps. The risk is that users open it once, see an empty feed, and never return.

Every UX decision in this strategy is designed to answer one question: **"What will make a user in Kallio open TackBird tomorrow morning instead of checking Instagram?"**

The answer is: because yesterday they posted that they need help with their bike, and this morning three neighbors offered to help. That moment of genuine human connection, facilitated by technology but powered by neighborliness -- that is what wins.

Build for that moment. Everything else is decoration.

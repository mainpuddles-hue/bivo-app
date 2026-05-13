---
name: Architecture snapshot March 2026
description: COMPLETE app architecture — LOAD THIS FIRST in any conversation. Contains everything needed to understand Bivo.
type: project
---

## What is Bivo

Neighborhood marketplace + community app for Finland. Users can:
- Post listings (tarvitsen/tarjoan/ilmaista/nappaa/lainaa/tapahtuma)
- Buy/sell services (siivous, korjaus, koiranulkoilutus) with Stripe payments
- Rent/lend items with date picker + escrow
- Message each other with realtime chat
- Join groups, post in forums, create recurring activities
- Earn points, climb leaderboard, get speed badges

**Company:** Puddles Oy (Y-tunnus: 3610705-3)
**Owner:** Jesse Parkkonen (main.puddles@gmail.com)
**Status:** Pre-launch MVP, needs EAS Build + real device testing

## Stack

Expo SDK 54 + Expo Router + TypeScript (strict) + Supabase + Stripe + StyleSheet.create

## Supabase Project
- **Ref:** wfsghkseyyxkkalcqtzq (Frankfurt)
- **CLI access token:** sbp_b67b425ca70501dbbebfc259640a25a08aba5836
- **Anon key:** JWT in .env (eyJ...)
- **Stripe test key:** sk_test_51T9TNo... (set as Edge Function secret)

## CRITICAL RULES
- **MOBILE ONLY** — no web version. bivo-v2 is dead. Never reference it as backend.
- **All backend = Supabase Edge Functions** (12 deployed) + Supabase DB
- **Apple IAP required** for digital subscriptions (Pro, Business). Stripe hidden on iOS.
- **Stripe allowed** for physical services/rentals (person-to-person transactions)
- **Don't ask permission — do it automatically** (from CLAUDE.md)

## 12 Edge Functions (supabase/functions/)

| Function | Purpose |
|----------|---------|
| stripe-checkout | Payment sessions — server-side amount validation + 10% commission |
| stripe-connect-onboard | Provider bank account linking (Stripe Connect Express) |
| stripe-webhook | Payment/subscription events → booking status + notifications |
| pro-subscribe | Pro subscription via Stripe (monthly 4.99€ / yearly 39.99€) |
| validate-business | PRH API validation for Finnish businesses (avoindata.prh.fi) |
| embed-post | Generate 384-dim HuggingFace embeddings on post creation |
| semantic-match | pgvector cosine similarity for tarvitsen↔tarjoan matching |
| semantic-search | Fuzzy Finnish search with synonym expansion + embeddings |
| send-push | Smart push: priority routing, batching, quiet hours 22-07, urgent broadcast |
| price-suggestion | Dynamic pricing from completed transactions + active listings |
| moderate-content | Spam/scam/inappropriate detection + auto-hide (score 0-100) |
| send-email | Transactional emails: booking confirmation, payment receipt, welcome |

## Key Algorithms

- **Feed ranking**: recency(0.25) + engagement(0.20) + urgency(0.20) + proximity(0.10) + trust(0.10) + personalization(0.15)
- **Smart Match**: tag Jaccard + semantic embedding + neighborhood + poster quality + recency
- **Trust scoring**: continuous 0-100 via DB RPC: response_rate(0.20) + reviews(0.25) + cancellations(0.15) + disputes(0.15) + activity(0.10) + verification(0.15). Trust CAN decrease.
- **Notification priority**: urgent(100) > message(90) > thanks(80) > reply(70) > like(55) > follow(50)
- **Search**: Finnish synonym expansion (10 word families) → embedding → pgvector + ILIKE fallback

## Screens (app/) — 35+ screens

**Tabs:** Feed, Explore, Create (FAB), Messages, Profile
**Auth:** Login/Register, Onboarding (4 slides with city picker)
**Content:** Post detail, Conversation, Public profile, Forum, Groups, Group detail, Activities, Leaderboard
**Commerce:** Bookings list, Booking detail, Create ad, Organization dashboard, Upgrade business, Payment settings, Payment history, Pro subscription
**Settings:** Settings, Saved, Notifications, Search, Blocked, Admin panel, Help, About, Privacy, Terms
**Callbacks:** Payment success/cancel, Verification success/error, Auth callback

## Hooks (src/hooks/) — 20 hooks

useSupabase, useFeedData (feed + ranking + realtime), useTrustLevel (RPC-backed, continuous 0-100),
useIdentityVerification (Suomi.fi modal), useStripePayment (Edge Function), useSmartMatch (semantic),
usePoints (atomic increment), useStreak (daily tracking + multiplier), useReferral (5 tiers),
usePaymentMethods (Stripe Connect), useInteractionTracker (behavior for personalization),
usePriceSuggestion (Edge Function), useUnreadCount (realtime badge), useCountryAdapters,
useCityConfig (multi-city), useLocationDetection (GPS → country/city), useLocationVerification,
useNotificationPreferences, usePushNotifications, useTheme (Helsinki Dusk light/dark)

## Shared Components (src/components/) — 30+ components

PostCard, Avatar, StarRating, EmptyState, ErrorBoundary, ScreenErrorBoundary,
TrustBadge, TrustGate, VerificationModal, ThanksButton, ReferralCard, AdCard,
JuuriNytStrip, FilterBar, DateRangePicker, ImageGallery, HeroEventCard, OutOfAreaBanner,
UnsupportedAreaScreen, MapNative, MapWeb + 5 map sub-components, SkeletonLoaders,
3 forum sub-components (ForumPostCard, ForumThreadView, ForumCreateModal),
4 groups sub-components (GroupPostCard, GroupCommentList, GroupMembersModal, GroupEditModal)

## Country Adapters (src/lib/adapters/) — 17 files

Factory pattern for per-country services:
- **Identity:** suomifi (FI), bankid (SE/NO), smartid (EE), eidas (DE), manual
- **Business:** prh (FI, real API), bolagsverket (SE), ebr (EE), brreg (NO, real API), handelsregister (DE), manual
- **Events:** linkedevents (FI), eventbrite (international), manual
- **Places:** palvelukartta (Helsinki), osm (international, Overpass API), manual

## Engagement Systems

- **Points:** post=5, reply=3, thanks_given=2, thanks_received=10, event=5, review=10, first_post=20
- **Streak:** daily tracking, 2x at 7 days, 3x at 30 days, cached in AsyncStorage
- **Referral:** 5 tiers (1/3/5/10/25 invites → badges + Pro trials + points)
- **Speed badges:** salamanopea (<15min) + nopea (<60min) for urgent responses
- **Leaderboard:** top 10 by points, neighborhood filter
- **Trust tiers:** Tier 1 (basic), Tier 2 (ID verified → lainaa unlocked), Tier 3 (3+ reviews + 90% response)

## Monetization (3 revenue streams)

1. **Pro subscription:** 4.99€/kk or 39.99€/v — IAP on iOS (placeholder), Stripe on Android
2. **Business ads:** 2.99€/day (2.39€ Pro) in feed every 5th post + map pins
3. **Organization accounts:** 29.99€/kk — PRH-validated, dashboard, unlimited ads
4. **Transaction commission:** 10% on all service/rental payments via Stripe Connect

## Multi-city Support

6 Finnish cities: Helsinki (40 neighborhoods), Espoo (10), Vantaa (8), Tampere (10), Turku (8), Oulu (8)
DB-driven: `cities` + `city_neighborhoods` tables. Dynamic bounds, coordinates, LinkedEvents URLs.
International: `countries` table (FI active, SE/EE/NO/DE waitlist). Location detection + auto-language.

## Security (all fixed)

- Server-side payment validation + idempotency
- expo-secure-store for tokens (iOS + Android)
- UUID validation on all .or() queries
- File upload type/size validation (jpg/png/webp/gif, 10MB max)
- Login rate limiting (5 attempts → 15min lockout)
- Content moderation (pre-submit + post-submit Edge Function)
- Privacy enforcement (location_accuracy + profile_visibility)
- Webhook signature verification
- Admin RLS policies for moderation actions
- App-level rate limiting (posts 5/h, comments 20/h, messages 50/h)
- Bot detection (rapid-fire action detection)

## Production Infrastructure

- Crash reporting: ErrorBoundary + ScreenErrorBoundary (needs Sentry for production)
- Analytics: trackEvent → analytics_events table (app_opened, post_created, post_viewed, search)
- Retention: D1/D7/D30/D90 milestone events
- Onboarding funnel: slide/city/neighborhood/completion tracking
- Offline: cached feed (20 posts in AsyncStorage)
- Email: send-email Edge Function with booking/receipt/welcome templates

## Languages: fi, en, sv, et, ru (2130+ keys each)

## DB: 55+ tables including pgvector, trust_scores, analytics_events, cities, countries, email_queue

## App Store Status

- Age rating: 12+ (UGC + messaging + marketplace)
- Terms acceptance at signup: checkbox required
- Report mechanism on ALL UGC surfaces
- Content moderation policy documented (docs/content-moderation-policy.md)
- Suomi.fi documents prepared (docs/suomifi-*.md)
- Pro/Business hidden on iOS (awaiting IAP implementation)
- EAS Build not yet done — needed for push notifications + real device testing

# TackBird — Product Overview

> Updated: 2026-04-26 | Version: Building-first pivot (v3 design)

## What TackBird Is

TackBird is a hyperlocal neighborhood platform for Finland. It connects residents within their naapurusto (micro-neighborhood like Kallio, Töölö, Sörnäinen) through a shared bulletin board, peer lending, community events, building management (taloyhtiö), and trust-based reputation.

**Company:** Puddles Oy (Y-tunnus 3610705-3)
**Platform:** iOS + Android (React Native / Expo)
**Languages:** Finnish (primary), English, Swedish
**Market:** Helsinki metropolitan area → expanding to Finnish cities

## Current Strategic Focus

TackBird has pivoted from a general marketplace toward a **building-first community platform**. The beachhead entry point is the taloyhtiö (housing association) — every Finnish apartment building has one. By anchoring users to their physical building, TackBird creates natural trust and daily relevance.

### What's Active (MVP)
- Neighborhood bulletin board (5 post categories)
- Peer lending without payments (lainaa)
- Community events + city event aggregation (LinkedEvents, Kide, Ticketmaster, Meteli)
- Taloyhtiö management (announcements, maintenance requests, building chat)
- Community polls
- Real-time messaging with images
- Address-based onboarding with building assignment
- 3-tier trust system (basic → verified → trusted)

### What's Built But Hidden (Feature Flags = false)
- Stripe payments (checkout, Connect, deposits, escrow)
- Lending deposit/fee payments
- Business advertising campaigns
- Pro business accounts
- Identity verification (Suomi.fi integration)

These are gated behind feature flags and will be enabled once the community reaches critical mass.

## Post Categories

| Type | Finnish | Purpose | Color |
|------|---------|---------|-------|
| tarvitsen | "Tarvitsen" | Request help or items | #C75B3A |
| tarjoan | "Tarjoan" | Offer services or items | #7C5CBF |
| ilmaista | "Ilmaista" | Give away for free | #3B7DD8 |
| lainaa | "Lainaa" | Peer-to-peer lending | #A97A1E |
| tapahtuma | "Tapahtuma" | Community events | #2B8A62 |

"Nappaa" (grab-it-fast countdown) is a sub-mode of other categories, not a separate type.

## Trust System

### 3-Tier Progressive Trust
| Tier | Name | Requirements | Unlocks |
|------|------|-------------|---------|
| 1 | Peruskäyttäjä | Register + onboard | Post, borrow, message, attend events |
| 2 | Vahvistettu | ID verification + 7 days | Offer paid services (max 200€) |
| 3 | Luotettu kumppani | 3+ reviews, 4.0+ avg, 90%+ response, 30 days | Unlimited pricing, feed priority, badge |

### Trust Score (0-100)
Dynamic scoring based on: response speed, ratings, cancellations, disputes, activity, verification status. Score can decrease with negative behavior.

## Target Users

| Segment | Profile | Primary Use |
|---------|---------|-------------|
| **Beachhead** | Kallio renters, 25-40yo, kerrostalo, sustainability-minded | Borrow/share items, find events |
| **Residents** | 25-55yo urban Finns | Discover, share, connect with neighbors |
| **Providers** | Skill/tool owners | Earn from idle assets, offer services |
| **Taloyhtiö admins** | Building board members | Announcements, maintenance, coordination |
| **Local businesses** | Neighborhood shops/services | (Future) Pro listings, promoted posts |

## Event Integration

TackBird aggregates events from 4 sources using a 7-factor ranking algorithm:

| Source | Type | Integration |
|--------|------|-------------|
| Community | User-created neighborhood events | Native |
| LinkedEvents | Helsinki city events (museums, parks) | API proxy |
| Kide.app | Finnish ticketed events | Edge Function proxy |
| Ticketmaster | Major concerts/sports | Edge Function proxy |
| Meteli.net | Music gigs in Helsinki | Edge Function proxy |

## Taloyhtiö (Building Management)

The building module is the newest and most strategic feature. Every Finnish apartment building has a taloyhtiö (housing association). TackBird provides:

- **Building hub** — view members, building info, rules
- **Announcements** — board broadcasts to all residents
- **Maintenance requests** — report issues, track status
- **Building chat** — real-time group messaging for residents
- **Polls** — community decision-making
- **Invite codes** — address-verified building membership

Entry point: During onboarding, users enter their address and are assigned to (or can join) their building.

## Intelligence Features

| Feature | How It Works |
|---------|-------------|
| Semantic search | AI embeddings + pgvector: "koiranhoitaja" finds "koiranulkoilutus" |
| Smart Match | Auto-matches tarvitsen↔tarjoan by meaning |
| Feed ranking | Client-side algorithm weighing recency, engagement, proximity, trust |
| Price suggestions | Area-based pricing data for services |
| Weekly digest | Cron-generated personalized email with neighborhood highlights |

## Monetization (Future — All Currently Disabled)

| Revenue Stream | Model | Status |
|---------------|-------|--------|
| Transaction commission | 10% on service/lending payments | Built, flag off |
| Pro subscription | 4.99€/mo or 39.99€/yr — feed priority, analytics | Built, flag off |
| Business ads | 2.99€/day hyperlocal placement | Built, flag off |
| Organization accounts | 29.99€/mo — PRH-validated businesses | Built, flag off |

Stripe Connect is integrated but `charges_enabled: false`. Activation requires manual Stripe Dashboard onboarding with Puddles Oy details.

## Gamification

- **Points:** posting (5p), answering (3p), thanks (10p), review (10p), first post (20p)
- **Daily streaks:** 7d = 2× multiplier, 30d = 3×
- **Speed badges:** Salamanopea (<15min response), Nopea (<60min)
- **Referral program:** 5 tiers (1/3/5/10/25 invites) → badges + Pro trials
- **Leaderboard:** Top 10 per neighborhood, monthly

## Technical Architecture

- **Frontend:** React Native (Expo SDK 54), TypeScript, Expo Router
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Design:** Helsinki Monochrome v3 — Bricolage Grotesque display + Inter body
- **31 Edge Functions** across auth, payments, content moderation, event proxies, notifications, admin
- **67 database tables** with 211 RLS policies
- **6 cron jobs** (digest, overdue rentals, ads scheduler, boost grants, match saved searches, db backup)
- **Admin panel** in-app for content flags, user management, platform stats

## Competitive Position

### Direct Competitors in Finland
| Competitor | What It Does | What TackBird Does Better |
|-----------|-------------|--------------------------|
| Tori.fi | Buy/sell classifieds | Neighborhood scope, trust system, lending, events, community |
| Facebook Marketplace + groups | Buy/sell + informal groups | Unified platform, structured data, moderation, no algorithm burial |
| WhatsApp taloyhtiö groups | Informal building chat | Structured announcements, maintenance tracking, searchable, trust |

### International Comparisons
| Product | Market | Overlap |
|---------|--------|---------|
| Nextdoor | US/EU neighborhoods | Similar scope, but no marketplace, no lending, not in Finland |
| TaskRabbit | Service marketplace | Services only, city-level, no community |
| Olio | Free item sharing | One category only |
| Nebenan.de | German neighborhoods | Closest model, no lending/payments |

### Key Differentiators
1. **Building-first entry** — taloyhtiö is the trust anchor, not just a neighborhood label
2. **5 native Finnish categories** — structured for how Finns actually exchange
3. **Progressive trust** — 3 tiers that gate increasingly valuable actions
4. **All-in-one** — marketplace + lending + events + building mgmt + messaging in one app
5. **Finnish-first trilingual** — not a translated American product
6. **Event aggregation** — 4 real APIs, not just user-created events

## Design System

Helsinki Monochrome v3 — intentionally understated:

| Token | Light | Dark |
|-------|-------|------|
| background | #F5F5F5 | #121212 |
| foreground | #1A1A1A | #E8E6E0 |
| card | #FFFFFF | #1E1E1E |
| border | #E5E5E5 | #333333 |
| primary | #2D6B5E | #6FCF97 |

Typography: Bricolage Grotesque for display headings, Inter for body text. Three card variants in feed (IMAGE, INK, TINT) selected by content type.

## Product Analysis Documents

Detailed analyses are available in `docs/product-analysis/`:

| Document | Framework |
|----------|-----------|
| positioning-canvas.md | April Dunford's Obviously Awesome |
| user-personas.md | 4 detailed Finnish personas |
| jtbd-analysis.md | Jobs-to-be-Done |
| journey-maps.md | Customer journey maps |
| competitive-analysis.md | Market landscape |
| hook-model.md | Nir Eyal's Hooked |
| mom-test-plan.md | Customer interview guide |
| metrics-definition.md | North Star + KPI framework |
| experience-map.md | End-to-end experience |
| opportunity-framework.md | Opportunity scoring |
| grand-slam-offer.md | Alex Hormozi's framework |
| heuristic-evaluation.md | Nielsen's usability heuristics |
| design-principles.md | Core design principles |

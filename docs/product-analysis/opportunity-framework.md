# TackBird — Opportunity Framework

> Date: 2026-04-23 | Market: Helsinki, Finland
> Methodology: RICE scoring + phased roadmap
> Context: Single founder (Puddles Oy), pre-launch, Helsinki B2G pilot preparation

---

## 1. Opportunity Identification

### Growth & Acquisition

| # | Opportunity | Description |
|---|-----------|-------------|
| G1 | Push notifications | expo-notifications + EAS for re-engagement, message alerts, event reminders |
| G2 | Deep linking | Share posts/events/profiles via URL, invite links open in-app |
| G3 | Invite referral system | "Invite neighbors" flow with tracking, rewards for both parties |
| G4 | App Store launch (EAS Build) | Move from Expo Go to production builds on App Store + Google Play |
| G5 | SEO-friendly web preview | Shared links render Open Graph previews for WhatsApp/Instagram sharing |
| G6 | Neighborhood seeding | Pre-populate 3-5 neighborhoods with content before launch |
| G7 | taloyhtiö partnership program | Partner with building co-ops to onboard entire buildings |
| G8 | Helsinki city partnership (B2G) | Official integration with city events, recycling data, announcements |

### Engagement & Retention

| # | Opportunity | Description |
|---|-----------|-------------|
| E1 | Post status system ("claimed/pending") | One-tap "claimed" that notifies other requesters |
| E2 | Review prompt automation | Push notification 24h after exchange: "How was your experience?" |
| E3 | Recurring events | Duplicate/repeat events automatically (weekly walking groups, etc.) |
| E4 | Trust progress dashboard | "2 more reviews to Tier 3" visible in profile |
| E5 | Gamification & streaks | Weekly active badge, posting streaks, point system (already in DB) |
| E6 | Saved search notifications | Push when new post matches your saved search |
| E7 | In-app neighborhood feed algorithms | Personalized feed based on interests + interaction history |
| E8 | Post-event photo gallery & recap | Share event photos, tag attendees, build event memories |

### Monetization

| # | Opportunity | Description |
|---|-----------|-------------|
| M1 | Stripe activation | Complete Dashboard onboarding to enable lending payments |
| M2 | Pro subscription tiers | Monthly Pro for businesses: analytics, boosted visibility, business profile |
| M3 | Boost marketplace | Self-serve boost purchases for individual posts |
| M4 | Featured neighborhood sponsor | Local businesses sponsor their neighborhood page |
| M5 | Premium lending insurance | Optional insurance add-on for high-value items |
| M6 | Transaction fee on rentals | 10% platform fee on lending transactions (SERVICE_FEE_RATE) |

### Trust & Safety

| # | Opportunity | Description |
|---|-----------|-------------|
| T1 | Google OAuth (native) | Native Google Sign-In via EAS build — major friction reducer |
| T2 | Moderation dashboard | Admin view for content quality, reports, user management |
| T3 | Report & block system | User-facing report flow + automatic content hiding |
| T4 | Automated content quality | ML-based post quality scoring (contentQuality.ts exists) |
| T5 | ID verification improvements | Streamline verify-identity flow, clearer UX |
| T6 | Lending dispute resolution | Structured flow: claim → evidence → mediation → deposit decision |

### Community Features

| # | Opportunity | Description |
|---|-----------|-------------|
| C1 | Neighborhood onboarding | "Welcome to Kallio!" guide with local tips, popular posts, events |
| C2 | Map improvements | Mapbox/Google Maps integration, clustering, route to pickup |
| C3 | Neighborhood analytics | "This week in Kallio: 24 items shared, 3 events, 150 active users" |
| C4 | Cross-neighborhood discovery | Explore other neighborhoods, find items city-wide |
| C5 | Auto-translate posts | Real-time translation for international users |

### Technical Infrastructure

| # | Opportunity | Description |
|---|-----------|-------------|
| I1 | Offline support | Cache feed/messages, queue mutations, sync when online |
| I2 | Performance optimization | List virtualization, image caching, bundle splitting |
| I3 | Analytics & tracking | Event logging, funnel analysis, crash reporting |
| I4 | CI/CD pipeline | Automated testing, EAS builds, OTA updates |
| I5 | Monitoring & alerting | Error tracking (Sentry), uptime monitoring, Edge Function health |

---

## 2. RICE Scoring

### Scoring Criteria
- **Reach:** % of users affected in next quarter (1-100%)
- **Impact:** Effect per user (1=minimal, 2=medium, 3=massive)
- **Confidence:** How sure we are (20-100%)
- **Effort:** Person-weeks for solo developer

### Scored Opportunities

| # | Opportunity | Reach | Impact | Confidence | Effort (pw) | RICE Score |
|---|-----------|-------|--------|-----------|-------------|------------|
| G4 | App Store launch (EAS) | 100% | 3 | 90% | 2 | **135.0** |
| M1 | Stripe activation | 30% | 3 | 95% | 0.5 | **171.0** |
| G1 | Push notifications | 90% | 3 | 85% | 3 | **76.5** |
| G2 | Deep linking | 70% | 2 | 90% | 2 | **63.0** |
| T1 | Google OAuth (native) | 40% | 3 | 90% | 1 | **108.0** |
| E1 | Post status ("claimed") | 60% | 2 | 85% | 1 | **102.0** |
| G6 | Neighborhood seeding | 100% | 3 | 70% | 2 | **105.0** |
| E2 | Review prompt automation | 40% | 2 | 80% | 1 | **64.0** |
| E6 | Saved search notifications | 30% | 2 | 80% | 1.5 | **32.0** |
| G3 | Invite referral system | 50% | 2 | 70% | 2 | **35.0** |
| E4 | Trust progress dashboard | 50% | 2 | 75% | 1.5 | **50.0** |
| E3 | Recurring events | 20% | 2 | 85% | 1 | **34.0** |
| I3 | Analytics & tracking | 100% | 2 | 80% | 2 | **80.0** |
| T2 | Moderation dashboard | 100% | 2 | 90% | 3 | **60.0** |
| G5 | SEO web preview | 40% | 2 | 75% | 1.5 | **40.0** |
| M2 | Pro subscription tiers | 10% | 3 | 60% | 3 | **6.0** |
| M3 | Boost marketplace | 15% | 2 | 70% | 2 | **10.5** |
| C2 | Map improvements | 40% | 2 | 70% | 3 | **18.7** |
| C5 | Auto-translate posts | 15% | 2 | 60% | 2 | **9.0** |
| I1 | Offline support | 30% | 1 | 50% | 4 | **3.8** |
| E5 | Gamification & streaks | 40% | 1 | 50% | 2 | **10.0** |
| T6 | Lending dispute resolution | 10% | 3 | 60% | 3 | **6.0** |
| I2 | Performance optimization | 80% | 1 | 70% | 2 | **28.0** |
| C1 | Neighborhood onboarding | 100% | 2 | 60% | 2 | **60.0** |
| G7 | taloyhtiö partnerships | 30% | 3 | 40% | 3 | **12.0** |
| G8 | Helsinki city partnership | 50% | 3 | 30% | 4 | **11.3** |
| M5 | Premium lending insurance | 5% | 2 | 40% | 4 | **1.0** |
| C3 | Neighborhood analytics | 30% | 1 | 50% | 2 | **7.5** |
| I4 | CI/CD pipeline | 100% | 1 | 80% | 2 | **40.0** |
| I5 | Monitoring & alerting | 100% | 1 | 80% | 1 | **80.0** |

### Top 10 by RICE Score

| Rank | Opportunity | RICE | Quick Win? |
|------|-----------|------|-----------|
| 1 | M1: Stripe activation | 171.0 | Yes (0.5 pw) |
| 2 | G4: App Store launch | 135.0 | No (2 pw) |
| 3 | T1: Google OAuth native | 108.0 | Yes (1 pw) |
| 4 | G6: Neighborhood seeding | 105.0 | Yes (2 pw) |
| 5 | E1: Post status system | 102.0 | Yes (1 pw) |
| 6 | I5: Monitoring & alerting | 80.0 | Yes (1 pw) |
| 7 | I3: Analytics & tracking | 80.0 | No (2 pw) |
| 8 | G1: Push notifications | 76.5 | No (3 pw) |
| 9 | E2: Review prompts | 64.0 | Yes (1 pw) |
| 10 | G2: Deep linking | 63.0 | No (2 pw) |

---

## 3. Priority Matrix

```
                        HIGH IMPACT
                            ↑
                            │
    Quick Wins              │           Big Bets
    ┌───────────────────────┼─────────────────────────┐
    │ M1: Stripe activation │ G4: App Store launch    │
    │ T1: Google OAuth      │ G1: Push notifications  │
    │ E1: Post status       │ G2: Deep linking        │
    │ E2: Review prompts    │ G6: Neighborhood seeding│
    │ I5: Monitoring        │ I3: Analytics           │
    │ E4: Trust dashboard   │ C1: Neigh. onboarding   │
    │                       │                         │
LOW ├───────────────────────┼─────────────────────────┤ HIGH
EFFORT │                    │                         │ EFFORT
    │ E3: Recurring events  │ C2: Map improvements    │
    │ G5: SEO web preview   │ T2: Moderation dashboard│
    │ E5: Gamification      │ G7: taloyhtiö partners  │
    │ I4: CI/CD             │ G8: City partnership    │
    │                       │ I1: Offline support     │
    │ Fill-ins              │ Money Pits (defer)      │
    └───────────────────────┼─────────────────────────┘
                            │
                        LOW IMPACT
```

---

## 4. Phased Roadmap

### Phase 1: Pre-Launch Essentials (Helsinki Pilot) — 4-6 weeks

**Goal:** Minimum viable product that can support 200 users per neighborhood in 3 pilot neighborhoods.

| Priority | Opportunity | Effort | Dependency |
|----------|-----------|--------|-----------|
| P0 | M1: Stripe activation (complete Dashboard onboarding) | 0.5 pw | None — do first |
| P0 | G4: App Store launch (EAS Build for iOS + Android) | 2 pw | Needed for T1 |
| P0 | T1: Google OAuth native | 1 pw | Requires G4 |
| P0 | G1: Push notifications (expo-notifications) | 3 pw | Requires G4 |
| P1 | E1: Post status ("claimed/pending") | 1 pw | None |
| P1 | G2: Deep linking (expo-linking) | 2 pw | Requires G4 |
| P1 | I5: Monitoring & alerting (Sentry) | 1 pw | None |
| P2 | G6: Neighborhood seeding (Kallio, Töölö, Vallila) | 2 pw | Requires content strategy |

**Phase 1 total:** ~12 person-weeks

### Phase 2: Early Growth (First 1 000 Users) — 6-8 weeks

**Goal:** Features that drive engagement, retention, and word-of-mouth growth.

| Priority | Opportunity | Effort | Dependency |
|----------|-----------|--------|-----------|
| P0 | I3: Analytics & tracking (PostHog/Mixpanel) | 2 pw | None |
| P0 | E2: Review prompt automation | 1 pw | Push notifications |
| P1 | E6: Saved search notifications | 1.5 pw | Push notifications |
| P1 | E4: Trust progress dashboard | 1.5 pw | None |
| P1 | G3: Invite referral system | 2 pw | Deep linking |
| P2 | E3: Recurring events | 1 pw | None |
| P2 | C1: Neighborhood onboarding | 2 pw | Content per neighborhood |
| P2 | G5: SEO web preview (Open Graph) | 1.5 pw | Deep linking |

**Phase 2 total:** ~12 person-weeks

### Phase 3: Scale (1 000 - 10 000 Users) — 8-12 weeks

**Goal:** Monetization, moderation at scale, quality of life.

| Priority | Opportunity | Effort | Dependency |
|----------|-----------|--------|-----------|
| P0 | T2: Moderation dashboard | 3 pw | Analytics |
| P0 | M2: Pro subscription tiers | 3 pw | Stripe active |
| P1 | M3: Boost marketplace | 2 pw | Analytics for ROI |
| P1 | C2: Map improvements (Mapbox) | 3 pw | None |
| P1 | I2: Performance optimization | 2 pw | Analytics (identify bottlenecks) |
| P2 | C5: Auto-translate posts | 2 pw | None |
| P2 | T6: Lending dispute resolution | 3 pw | Stripe active, some lending history |
| P2 | I4: CI/CD pipeline | 2 pw | None |

**Phase 3 total:** ~20 person-weeks

### Phase 4: Expansion (Beyond Helsinki) — 12+ weeks

**Goal:** New cities, partnerships, advanced features.

| Priority | Opportunity | Effort | Dependency |
|----------|-----------|--------|-----------|
| P1 | G7: taloyhtiö partnership program | 3 pw | Proven model in Helsinki |
| P1 | G8: Helsinki city partnership (B2G) | 4 pw | User base proof |
| P1 | Expand to Tampere, Turku | 2 pw + content | Proven playbook |
| P2 | M5: Premium lending insurance | 4 pw | Lending volume data |
| P2 | C3: Neighborhood analytics | 2 pw | Analytics infrastructure |
| P2 | I1: Offline support | 4 pw | None |
| P3 | C4: Cross-neighborhood discovery | 2 pw | Multi-neighborhood adoption |
| P3 | E5: Gamification & streaks | 2 pw | Engagement data |

---

## 5. Dependencies & Sequencing

```
                    ┌─────────────────┐
                    │ M1: Stripe      │
                    │ activation      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ G4: App Store   │ (EAS Build)
                    │ launch          │
                    └──┬─────┬────┬──┘
                       │     │    │
              ┌────────▼┐  ┌▼────▼──────┐
              │T1: OAuth│  │G1: Push    │
              │(native) │  │notifications│
              └─────────┘  └──┬─────┬───┘
                              │     │
                    ┌─────────▼┐  ┌─▼──────────┐
                    │E2: Review│  │E6: Saved    │
                    │prompts   │  │search notify│
                    └──────────┘  └────────────┘

              ┌──────────────┐
              │G2: Deep      │
              │linking       │
              └──┬────────┬──┘
                 │        │
           ┌─────▼──┐  ┌──▼──────────┐
           │G3: Ref. │  │G5: SEO web  │
           │system   │  │preview      │
           └─────────┘  └─────────────┘

              ┌──────────────┐
              │I3: Analytics │
              └──┬────────┬──┘
                 │        │
           ┌─────▼────┐ ┌─▼───────────┐
           │T2: Mod.  │ │I2: Perf.    │
           │dashboard │ │optimization │
           └──────────┘ └─────────────┘
```

### Critical Path
```
Stripe activation → EAS Build → Push Notifications + Google OAuth + Deep Linking
                                          ↓
                               Review prompts + Saved search notifications
                                          ↓
                               Invite referral system
                                          ↓
                               Neighborhood seeding + Launch
```

**Estimated time to launch-ready:** 4-6 weeks of focused solo development on Phase 1.

---

## 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Cold start: empty neighborhoods | High | Critical | Seed content, partner with taloyhtiö boards, invite-first launch |
| Stripe onboarding takes longer than expected | Medium | High | Start immediately, have manual fallback for first few rentals |
| App Store review rejection | Low | High | Follow Apple guidelines, no placeholder features |
| Single founder burnout | High | Critical | Phase strictly, cut scope aggressively, automate what you can |
| Toxic community dynamics (Nextdoor effect) | Medium | High | Content quality scoring (built), moderation tools (Phase 3) |
| Competition: Tori.fi adds neighborhood feature | Low | Medium | TackBird's community+lending moat is hard to replicate |
| Competition: Nextdoor launches in Finland | Low | High | Finnish-first, lending, trust system differentiate |

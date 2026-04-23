# TackBird — Crossing the Chasm Strategy

> Framework: Geoffrey Moore's Crossing the Chasm
> Date: 2026-04-24 | Market: Helsinki, Finland
> Current Score: **5/10** — Beachhead identified intuitively but not formalized. Whole product incomplete. No reference customers yet. This document designs the path to 8+/10.

---

## Where Is TackBird on the Adoption Curve?

```
Innovators → Early Adopters → [WE ARE HERE → CHASM] → Early Majority → Late Majority → Laggards
   2.5%         13.5%                                      34%             34%            16%
```

**TackBird is pre-chasm.** We have not yet launched publicly. The current product appeals to innovators and early adopters — people who love trying new apps and see the vision of a neighborhood platform. The challenge: everything that excites these users (novel concept, Finnish-first, community building) actively repels pragmatists who want proven, complete solutions.

---

## Step 1: Target the Point of Attack — Beachhead Segment

### Beachhead: Kallio Renters (25-40yo, kerrostalo, sustainability-oriented)

| Criteria | Score | Reasoning |
|----------|-------|-----------|
| **Specific** | 9/10 | Kallio, Helsinki — one neighborhood, one demographic |
| **Urgent pain** | 7/10 | Small apartments (30-50m²), need to borrow not store. Isolation despite density |
| **Accessible** | 8/10 | Concentrated in ~2km². Local coffee shops, Kallio Block Party, Facebook groups, Instagram influencers |
| **Compelling reason to buy** | 8/10 | Only structured lending + neighborhood identity platform in Finland |
| **Whole product potential** | 6/10 | Can assemble with taloyhtiö partnerships, but gaps remain |
| **Reference potential** | 9/10 | Kallio residents are vocal, Instagram-active, community-oriented |
| **Word-of-mouth** | 9/10 | Already talk to each other in local Facebook groups, WhatsApp, kirpputorit |
| **Size** | 7/10 | ~15,000 residents in target demo. Big enough to build on, small enough to dominate |
| **Competition** | 8/10 | No direct competitor — fragmented Tori+FB+WhatsApp is the "competition" |

**Total: 71/90 — Strong beachhead.**

### Why Kallio, Not All of Helsinki

| Bad Beachhead | Good Beachhead |
|---------------|----------------|
| "Helsinki renters" (600K people) | "Kallio kerrostalo renters, 25-40, who already use Tori/FB" (~3,000 active target) |
| Can't dominate, can't build references | Can dominate in 3 months, build 50+ lighthouse users |
| Generic messaging for everyone | "Kalliossa naapurit lainaa toisilleen" — specific, resonant |

### Segment Profile (narrowed from Liisa-persona)

| Attribute | Value |
|-----------|-------|
| Age | 25-40 |
| Location | Kallio (Sörnäinen–Hakaniemi–Alppila corridor) |
| Housing | Renter in kerrostalo, studio or 1BR (30-50m²) |
| Income | 2,500-4,500€/month net |
| Digital | Uses Tori.fi or FB Marketplace already |
| Values | Sustainability, experiences > possessions, anti-consumerism |
| Language | Finnish primary, comfortable with English |
| Social | Active in at least one local group (FB, WhatsApp, kirppis) |

---

## Step 2: Assemble the Invasion Force — Whole Product

### Current Product Gap Analysis

| Layer | What We Ship | What Pragmatists Need | Gap |
|-------|-------------|----------------------|-----|
| **Generic Product** | Marketplace + events + messaging + trust tiers | — | ✅ Built |
| **Expected Product** | Push notifications, deep linking, Google OAuth | All three | ❌ CRITICAL GAP |
| **Expected Product** | Reliable payments for lending | Stripe activation | ❌ CRITICAL GAP |
| **Augmented Product** | Onboarding guide for Kallio | Welcome flow + local tips | ⚠️ Partial (OnboardingOverlay exists) |
| **Augmented Product** | taloyhtiö partnerships | Building-level onboarding | ❌ Not started |
| **Augmented Product** | Customer support / dispute resolution | In-app help, mediation flow | ❌ Not started |
| **Augmented Product** | Content quality moderation | ML scoring exists, no admin dashboard | ⚠️ Partial |
| **Potential Product** | Neighborhood analytics, saved search notifications | — | Future |

### Whole Product Checklist for Kallio Beachhead

- [x] Core technology — marketplace, lending, events, messaging, trust
- [ ] Push notifications — **#1 blocker** (no re-engagement = no retention)
- [ ] Stripe activation — **#2 blocker** (no lending payments = core value broken)
- [ ] App Store launch (EAS Build) — **#3 blocker** (can't distribute via Expo Go)
- [ ] Google OAuth — major friction reducer for signup
- [ ] Deep linking — required for invite referrals and share flows
- [ ] Kallio-specific onboarding — "Tervetuloa Kallioon!" guide
- [ ] taloyhtiö partnership kit — template email/flyer for building co-ops
- [ ] Customer support flow — in-app help + dispute resolution
- [ ] Content moderation — admin dashboard for flagged content
- [ ] Lending dispute resolution — structured claim→evidence→decision flow

### Partnership Strategy

| Partner Type | Who | What They Provide | What We Provide |
|-------------|-----|-------------------|-----------------|
| **taloyhtiö boards** | Kallio building co-ops | Distribution (entire buildings onboard at once) | Digital bulletin board, reduces physical notices |
| **Local businesses** | Kallio cafés, repair shops | Location for exchanges, event hosting | Local promotion, foot traffic |
| **Helsinki city** | Kallio aluesuunnittelu | Credibility, city event data | Citizen engagement tool |
| **Kierrätyskeskus** | Reuse center network | Sustainability credibility, content | Digital channel for their items |

---

## Step 3: Define the Battle — Positioning for Pragmatists

### Positioning Formula

> **For** Kallio renters who juggle Tori.fi, Facebook groups, and WhatsApp to manage neighborhood exchange,
> **TackBird** is the **neighborhood bulletin board and lending service**
> **That** lets you borrow, share, and connect with verified neighbors within walking distance
> **Unlike** Tori.fi (impersonal, citywide) or Facebook groups (chaotic, unstructured),
> **TackBird** combines marketplace, lending, events, and trust in one app built for your neighborhood.

### Messaging Shift: Early Adopter → Early Majority

| Current (Early Adopter) | Needed (Early Majority) |
|-------------------------|--------------------------|
| "Suomen ensimmäinen naapurustoalusta" | "500 kalliolaista käyttää jo" |
| "Mullistava tapa asua" | "Säästä rahaa — lainaa naapurilta" |
| "Liity yhteisöön" | "12 lainausta tällä viikolla Kalliossa" |
| "Rakenna naapuruston tulevaisuus" | "Liisa säästi 200€ lainaamalla porakoneen" |

### Key: Pragmatists Want Proof, Not Vision

**What we need before chasm-crossing messaging:**
1. **50+ reference users in Kallio** who actively use the app
2. **10+ successful lending transactions** with reviews
3. **3+ community events** organized through the app
4. **5+ testimonial quotes** from real Kallio residents
5. **Quantified savings** — "Kalliossa säästetty yhteensä X€ lainaamisella"

---

## Step 4: Launch the Invasion — Kallio Go-to-Market

### Phase 1: Lighthouse Users (Weeks 1-4)

| Action | Target | Channel |
|--------|--------|---------|
| Personal outreach to 20 Kallio residents | 20 active users | Personal network, taloyhtiö boards |
| Seed 30 posts across all categories | Content density for first visitors | Founder-created content |
| Host 2 pilot events via TackBird | Event proof-of-concept | Kallio Facebook groups |
| Complete 5 lending transactions | Lending proof-of-concept | Seed users |

### Phase 2: Beachhead Domination (Weeks 5-12)

| Action | Target | Channel |
|--------|--------|---------|
| taloyhtiö partnership with 5 buildings | 100+ users from building onboarding | Door-to-door, board meetings |
| Kallio Block Party presence | Brand awareness in target segment | Event sponsorship |
| Instagram campaign with Kallio influencers | 200+ app installs | @kallioliike, local bloggers |
| Collect 10+ testimonials and case studies | Reference material for pragmatists | In-app review prompt |

### Phase 3: Validation (Weeks 12-16)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active users in Kallio | 200+ weekly actives | Supabase analytics |
| Lending transactions | 10+/week | Transaction logs |
| Retention (Week 4) | 30%+ | Cohort analysis |
| NPS | 40+ | In-app survey |
| Unprompted word-of-mouth | 5+ organic signups/week | Attribution tracking |

---

## Bowling Pin Strategy: After Kallio

```
Kallio → Töölö → Vallila → Kruununhaka → Sörnäinen → ...
 [Pin 1]  [Pin 2]  [Pin 3]     [Pin 4]       [Pin 5]
```

### Pin Selection Criteria

| Pin | Adjacency to Kallio | Similar Demographics | Word-of-Mouth Transfer | Effort |
|-----|--------------------|--------------------|----------------------|--------|
| **Töölö** | Medium (2km) | Yes — young urban renters | Medium — some social overlap | Low |
| **Vallila** | High (1km) | Yes — similar density and age | High — friends in Kallio | Low |
| **Kruununhaka** | High (1km) | Partial — older, wealthier | Medium | Medium |
| **Sörnäinen** | Very High (adjacent) | Yes — gentrifying area | Very High | Low |

### Expansion Trigger

**Do NOT expand to Pin 2 until Kallio meets all criteria:**
- 200+ weekly active users
- 30%+ D28 retention
- 10+ weekly lending transactions
- NPS 40+
- "Organic" (non-seeded) content exceeds seeded content

---

## Chasm-Crossing Checklist

| Item | Status | Priority |
|------|--------|----------|
| Single beachhead segment chosen (Kallio renters) | ✅ Defined in this document | — |
| Segment has urgent, expensive problem | ✅ Small apartments, isolation, waste | — |
| Push notifications working | ❌ NOT YET | **CRITICAL** |
| Stripe payments working | ❌ NOT YET | **CRITICAL** |
| App Store distribution | ❌ NOT YET | **CRITICAL** |
| Whole product complete for segment | ❌ Gaps remain | HIGH |
| 10+ reference customers from beachhead | ❌ Pre-launch | HIGH |
| Positioning emphasizes proven value | ❌ Currently vision-focused | MEDIUM |
| Distribution channel aligned with pragmatists | ⚠️ taloyhtiö plan exists, not executed | MEDIUM |
| Partnerships in place | ❌ Not started | MEDIUM |
| Metrics show adoption accelerating | ❌ Pre-launch | Future |

### Updated Score: 6/10

Components defined. Beachhead is strong. Critical blockers (push, Stripe, App Store) remain. Whole product gaps in support, moderation, and partnerships. Score will reach 8/10 when technical blockers are resolved and 10+ lighthouse users are active.

---

## Key Insight

**TackBird's chasm is not about the product — it's about the infrastructure.**

The product itself (marketplace + lending + trust + events) is solid for the beachhead. What prevents chasm-crossing is the lack of:
1. Push notifications (no re-engagement)
2. Stripe (no lending payments)
3. App Store (no distribution)

Fix these three, seed Kallio aggressively, and the beachhead is achievable. The product-market fit question will be answered by Kallio retention metrics, not by feature debates.

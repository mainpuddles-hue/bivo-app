# TackBird — Jobs-to-be-Done Analysis

> Framework: JTBD (Christensen/Ulwick) adapted for hyperlocal neighborhood platforms
> Date: 2026-04-23 | Market: Helsinki, Finland

---

## 1. Core Jobs by User Type

### 1.1 Resident (Consumer)

| Dimension | Job | Importance | Current Satisfaction |
|-----------|-----|------------|---------------------|
| **Functional** | Find items/services I need within my neighborhood quickly | Critical | Low — Tori.fi is citywide, FB Marketplace lacks structure |
| **Functional** | Borrow expensive tools I rarely use instead of buying them | High | Very Low — no structured lending exists in Finland |
| **Functional** | Get rid of stuff responsibly without the hassle of selling | High | Medium — Tori.fi works but requires negotiation |
| **Functional** | Discover local events happening near me this week | Medium | Low — Helsinki events are scattered across sites |
| **Emotional** | Feel like I belong to my neighborhood | Critical | Low — Helsinki is famously reserved; no digital "naapurusto" |
| **Emotional** | Feel good about sustainable consumption choices | High | Medium — motivation exists, no easy channel |
| **Social** | Be known as a helpful, trusted neighbor | High | Low — anonymity prevents reputation building |
| **Social** | Meet people who live near me without awkwardness | Medium | Low — cold-starting conversations is culturally hard |

### 1.2 Resident (Provider/Lender)

| Dimension | Job | Importance | Current Satisfaction |
|-----------|-----|------------|---------------------|
| **Functional** | Earn extra money from tools/items sitting idle at home | High | Low — no peer lending platform in Finland |
| **Functional** | Help neighbors and share surplus (giving away items) | High | Medium — word-of-mouth, no structured channel |
| **Functional** | Organize local events and gatherings easily | Medium | Low — WhatsApp groups are chaotic |
| **Emotional** | Feel valued and respected in my community | High | Low — no feedback loop for generosity |
| **Social** | Build a local reputation as a reliable person | High | Very Low — no local trust system exists |

### 1.3 Local Business Owner (Pro)

| Dimension | Job | Importance | Current Satisfaction |
|-----------|-----|------------|---------------------|
| **Functional** | Reach customers within walking distance | Critical | Medium — Google Maps exists but no community |
| **Functional** | Promote services to my immediate neighborhood | High | Low — Facebook ads aren't hyperlocal enough |
| **Functional** | Build ongoing relationships with repeat local customers | High | Low — transactional platforms don't build community |
| **Emotional** | Be seen as part of the neighborhood, not just a business | High | Low — businesses are "outsiders" in peer marketplaces |
| **Social** | Get word-of-mouth referrals from satisfied neighbors | Critical | Medium — happens naturally but slowly |

---

## 2. Job Stories

### Finding & Getting

> **When** I need a specific tool (e.g., a drill) for a weekend project,
> **I want to** find someone nearby who can lend it to me,
> **So that** I don't have to buy something I'll use once, saving money and space.

> **When** my child outgrows their winter jacket,
> **I want to** give it to a neighbor with a smaller child,
> **So that** it gets used instead of going to waste, and I feel good about helping.

> **When** I'm new to Helsinki and need furniture for my apartment,
> **I want to** find free/cheap items from neighbors who are moving,
> **So that** I can furnish my home affordably while meeting people in my area.

### Sharing & Lending

> **When** I have expensive camping gear sitting in my storage,
> **I want to** list it for daily lending with a clear price and deposit,
> **So that** I earn money from idle assets and help neighbors access gear they need.

> **When** someone wants to borrow my item,
> **I want to** verify they are a trusted, verified member of the community,
> **So that** I feel safe lending my belongings to a stranger.

> **When** a rental is overdue and the borrower hasn't returned my item,
> **I want to** the platform to handle the deposit and penalties automatically,
> **So that** I don't have to have an awkward confrontation with my neighbor.

### Community & Events

> **When** I want to organize a neighborhood cleanup or a coffee meetup,
> **I want to** create an event that reaches people in my specific neighborhood,
> **So that** I can bring together people who actually live nearby.

> **When** it's Saturday morning and I have no plans,
> **I want to** browse what's happening in my neighborhood today,
> **So that** I can spontaneously join something social without planning ahead.

> **When** I attend a neighborhood event and meet interesting people,
> **I want to** stay connected with them through the app,
> **So that** the connection doesn't evaporate after the event ends.

### Trust & Safety

> **When** I'm about to hand over my 500€ camera to a stranger,
> **I want to** see their verified identity, reviews from past transactions, and trust score,
> **So that** I can make an informed decision about whether to proceed.

> **When** I receive a review for being a great lender,
> **I want to** that recognition visible on my profile,
> **So that** future neighbors trust me more quickly.

### Business

> **When** I run a small repair shop in Kallio,
> **I want to** be visible to people within 2km who need things fixed,
> **So that** I get walk-in customers who become regulars.

> **When** a neighbor posts "tarvitsen: someone to fix my bike",
> **I want to** my business to appear as a recommended option,
> **So that** I connect with local demand naturally, not through ads.

---

## 3. Job Hierarchy

```
MAIN JOB: Thrive in my neighborhood through sharing and community
├── Sub-Job: Acquire things I need locally
│   ├── Find items to borrow → Search → Filter by distance → Contact lender
│   ├── Find free items → Browse "ilmaista" → Claim quickly → Pick up
│   └── Find services nearby → Search "tarjoan" → Message provider → Book
├── Sub-Job: Share and earn from what I have
│   ├── List items for lending → Set price/deposit → Manage bookings → Collect reviews
│   ├── Give away unwanted items → Post "ilmaista" → Choose recipient → Coordinate pickup
│   └── Offer services → Post "tarjoan" → Respond to inquiries → Complete & get reviewed
├── Sub-Job: Connect with my neighborhood
│   ├── Discover local events → Browse → Join → Attend → Follow up
│   ├── Organize gatherings → Create event → Manage RSVPs → Host → Share recap
│   └── Engage in forum → Browse topics → Comment → Start discussions
├── Sub-Job: Build local reputation
│   ├── Verify identity → Complete verification → Earn badge
│   ├── Complete transactions successfully → Get positive reviews → Climb tiers
│   └── Be consistently helpful → Earn badges (helper, active, neighborhood_hero)
└── Sub-Job: Run my local business (Pro)
    ├── Create business profile → Add hours, photos, description
    ├── Boost visibility → Purchase boosts → Appear in feeds
    └── Engage authentically → Respond to posts → Offer services → Build word-of-mouth
```

---

## 4. Outcome Expectations

| Job | Desired Outcome | Metric | Target |
|-----|----------------|--------|--------|
| Find items to borrow | Minimize time to find a lender | Time from search to confirmed booking | < 24 hours |
| Find items to borrow | Minimize distance to pickup point | Distance to lender | < 2 km (walking) |
| List items for lending | Maximize items lent per month | Rental utilization rate | > 2 bookings/month per listing |
| List items for lending | Minimize risk of damage/loss | % of rentals with disputes | < 5% |
| Give away items | Minimize time to find a recipient | Time from post to claim | < 4 hours |
| Discover events | Maximize relevant events per week | Events matching interests within 3km | > 3/week |
| Organize gatherings | Maximize attendance rate | RSVPs who actually attend | > 60% |
| Build trust | Minimize time to reach Tier 3 | Days from signup to Tier 3 | < 60 days with active use |
| Business visibility | Maximize local customer acquisition | New customers/month via TackBird | > 10 |

---

## 5. Underserved Jobs & Opportunities

### Critical Gaps (No solution exists in Finland)

| Underserved Job | Current Alternative | Gap Size | TackBird Fit |
|----------------|-------------------|----------|-------------|
| **Structured peer lending with deposit/insurance** | None — informal agreements only | Massive | Perfect — already built (lainaa + Stripe) |
| **Hyperlocal neighborhood identity** | None — Finnish culture lacks this | Large | Core differentiator — naapurusto focus |
| **Trust system for local strangers** | None — personal connections only | Large | 3-tier trust + verification + reviews |
| **Spontaneous neighborhood meetups** | WhatsApp (chaotic, invite-only) | Medium | Event system with "table" quick-joins |

### High-Potential Gaps (Partial solutions exist but are poor)

| Underserved Job | Current Alternative | Gap | Opportunity |
|----------------|-------------------|-----|------------|
| **Find hyper-local services (2km)** | Google Maps (global, impersonal) | No community layer | Pro business profiles + tarjoan posts |
| **Sustainable disposal of items** | Tori.fi (requires pricing/negotiation) | Too much friction | "ilmaista" zero-friction giveaway |
| **Coordinate with neighbors** | Building WhatsApp groups (fragmented) | No structure, no discovery | Forum + groups + events |
| **Neighborhood safety/awareness** | Nextdoor (not in Finland) | No Finnish alternative | Forum urgent posts + push notifications |

### Blue Ocean: Jobs Nobody Addresses

1. **Neighborhood resource map** — "What tools/items does my neighborhood collectively own?" Map of lendable inventory by distance
2. **Recurring lending** — Subscribe to regular access (e.g., borrow a pressure washer every spring)
3. **Neighborhood onboarding** — When moving to a new area, get a curated guide from locals
4. **Collective purchasing** — Neighbors pooling orders for bulk discounts
5. **Seasonal matching** — Auto-match "ilmaista" winter gear posts with "tarvitsen" fall searches

---

## 6. Job Switching Analysis

### From Tori.fi to TackBird

| Force | Direction | Strength |
|-------|-----------|----------|
| Push: Tori.fi full of scammers and lowballers | Away from Tori.fi | Strong |
| Push: No neighborhood focus, items often far away | Away from Tori.fi | Strong |
| Pull: Trust system reduces scam anxiety | Toward TackBird | Strong |
| Pull: Lending option (not just buy/sell) | Toward TackBird | Strong |
| Anxiety: "Will anyone be on this new app?" | Resisting switch | Very Strong |
| Habit: "I already know Tori.fi, it works" | Resisting switch | Medium |

**Key insight:** The **cold start anxiety** is TackBird's biggest switching barrier. Mitigate with neighborhood seeding, invite codes, and visible activity even with few users.

### From Facebook Groups to TackBird

| Force | Direction | Strength |
|-------|-----------|----------|
| Push: No structure, posts get buried, no search | Away from FB | Medium |
| Push: Privacy concerns with Facebook | Away from FB | Medium |
| Pull: Structured categories, search, saved searches | Toward TackBird | Medium |
| Pull: Lending with payment protection | Toward TackBird | Strong |
| Anxiety: "My neighborhood group already has 3000 members" | Resisting switch | Strong |
| Habit: "I open Facebook 20x/day already" | Resisting switch | Very Strong |

**Key insight:** Don't try to replace FB groups — complement them. People can use both. TackBird wins on structured transactions (lending, events) that FB does poorly.

---

## 7. Strategic Implications

### Must-Win Jobs (Pre-Launch)

1. **Lending with trust** — This is TackBird's unique wedge. No competitor does it.
2. **Hyperlocal free giveaway** — Lowest friction way to get users posting. "Ilmaista" should be the viral loop.
3. **Neighborhood events** — Community building that generates repeat usage and emotional connection.

### Jobs to Defer

- Business features (Pro) — build demand before supply-side monetization
- Advanced search/maps — basic works until scale demands it
- Collective purchasing — complex logistics, low urgency

### Cold Start Strategy (from JTBD lens)

Seed each neighborhood with:
- 10-15 "ilmaista" posts (free items are irresistible — zero barrier to engage)
- 3-5 "lainaa" listings (showcase the unique feature)
- 2-3 community events (build the "there's stuff happening" feeling)
- 1-2 local business Pro profiles (signal that real businesses trust the platform)

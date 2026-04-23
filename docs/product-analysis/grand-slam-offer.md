# TackBird — Grand Slam Offer Design

> Framework: Alex Hormozi's $100M Offers
> Date: 2026-04-24 | Market: Helsinki, Finland
> Current Score: **4/10** — Product exists but no structured offer, no guarantees, no bonuses, no ethical urgency. This document designs the path to 8+/10.

---

## Ethics Check: Is This a Starving Crowd?

| Criteria | Score | Reasoning |
|----------|-------|-----------|
| **Massive Pain** | 7/10 | Small apartments + expensive tools + isolation in dense city = real, daily friction |
| **Purchasing Power** | 6/10 | Helsinki median income ~3,500€/mo net. Can afford small fees, not premium SaaS pricing |
| **Easy to Target** | 8/10 | Concentrated in specific neighborhoods, active in local FB groups and events |
| **Growing Market** | 7/10 | Kiertotalous trend, Helsinki 2030 climate goals, post-COVID community hunger |
| **Total** | 28/40 | Good starving crowd. Pain is real but purchasing power limits premium pricing |

**TackBird's crowd is hungry, not starving.** The pain is real but not "hair on fire" urgent. This means: freemium core with premium upgrades, not high-ticket pricing.

---

## The Value Equation Applied to TackBird

```
Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort & Sacrifice)
```

### For Residents (Free Tier)

| Lever | Current State | Optimization |
|-------|--------------|-------------|
| **Dream Outcome** | "Find, borrow, and share with trusted neighbors" | 7/10 — clear and desirable |
| **Perceived Likelihood** | "Will I actually find what I need nearby?" | 4/10 — cold start problem, no social proof yet |
| **Time Delay** | "How fast can I borrow something?" | 6/10 — app is fast, but finding the right item depends on supply |
| **Effort & Sacrifice** | "How hard is it to use?" | 7/10 — sign up, post, message. Could be simpler |

**Bottleneck:** Perceived Likelihood. Users doubt they'll find useful content in their specific neighborhood. Social proof + seeded content are critical.

### For Pro Users (Paid Tier)

| Lever | Current State | Optimization |
|-------|--------------|-------------|
| **Dream Outcome** | "Grow my local business within walking distance" | 8/10 — very specific, measurable |
| **Perceived Likelihood** | "Will locals actually see my business here?" | 3/10 — no case studies, no metrics shown |
| **Time Delay** | "When will I get my first customer from this?" | 5/10 — depends on neighborhood activity |
| **Effort & Sacrifice** | "How much work to maintain a presence?" | 6/10 — post and respond, not much more |

**Bottleneck:** Perceived Likelihood + Time Delay. Pro users need proof that local visibility works and metrics to see ROI.

---

## TackBird's Grand Slam Offers

### Offer 1: Free Tier — "Naapuruston Ilmoitustaulu"

**Positioning:** The core neighborhood bulletin board. Free forever.

| Component | Value | Cost to Deliver |
|-----------|-------|-----------------|
| Post unlimited items (tarvitsen, tarjoan, ilmaista, nappaa) | Core exchange | ✅ Built |
| Browse neighborhood feed | Discovery | ✅ Built |
| Messaging with neighbors | Communication | ✅ Built |
| Events — browse and RSVP | Community | ✅ Built |
| Trust profile with reviews | Credibility | ✅ Built |
| Basic trust tier (Perus) | Safety baseline | ✅ Built |

**Value proposition:** "Everything you need to exchange with neighbors — free."

**Dream Outcome articulation:**
> "Löydä mitä tarvitset. Lainaa sen sijaan että ostat. Tutustu naapureihin."
> (Find what you need. Borrow instead of buying. Get to know your neighbors.)

---

### Offer 2: Lending — "Lainaa Turvallisesti" (Borrow Safely)

**Positioning:** Structured lending with deposit protection. Small transaction fee.

| Component | Value | Pricing |
|-----------|-------|---------|
| Structured lending (daily pricing + return tracking) | Access to expensive items | 10% platform fee (SERVICE_FEE_RATE) |
| Stripe-powered deposit protection | Security for lenders | Included in transaction |
| Verified identity (Tier 2 requirement) | Trust for both parties | Free verification |
| Post-exchange review | Accountability | Free |
| Overdue handling + automated reminders | Protection for lenders | Included |

**Value Equation:**
- **Dream Outcome:** "Use a €500 drill for €15/day instead of buying it"
- **Perceived Likelihood:** "Deposit protects your item. Reviews show track record."
- **Time Delay:** "Find and book in under 5 minutes. Pick up within walking distance."
- **Effort:** "One tap to request. Meet, exchange, return. Done."

**Guarantee: "Vakuuslupaus" (Deposit Promise)**
> "Jos lainaajasi ei palauta esinettäsi tai se vahingoittuu, vakuus siirtyy sinulle automaattisesti. Ei riitelyä, ei vaivaa."
> (If the borrower doesn't return your item or damages it, the deposit transfers to you automatically. No arguing, no hassle.)

**This is a conditional, performance-based guarantee.** It reverses risk for lenders (the harder side to convince).

---

### Offer 3: Pro — "Naapuruston Yritys" (Neighborhood Business)

**Positioning:** Premium business presence for local service providers and shops.

**MAGIC Name:** "Naapuruston Yritys Pro — Tavoita lähiasiakkaasi 30 päivässä"
(Neighborhood Business Pro — Reach your local customers in 30 days)

| Component | Value | Perceived $ Value |
|-----------|-------|-------------------|
| **Business profile with hours, services, photos** | Professional presence | €200/yr |
| **Boosted visibility in neighborhood feed** | More eyeballs | €500/yr |
| **Analytics dashboard (views, messages, engagement)** | ROI measurement | €300/yr |
| **Priority placement in search results** | Discovery advantage | €200/yr |
| **Business badge (Pro ⭐) on all posts** | Trust signal | €100/yr |
| **Monthly neighborhood insights report** | Market intelligence | €200/yr |

**Total perceived value: €1,500/yr**

**Price: €9.99/mo (€120/yr) — 12:1 value ratio**

#### Bonuses (value stacking)

| Bonus | What | Perceived Value | Cost to Deliver |
|-------|------|-----------------|-----------------|
| **Bonus 1: "Ensiasiakas-takuu"** | First 3 customer messages within 30 days or money back | Risk reversal | Near zero (if product works) |
| **Bonus 2: "Naapuruston Näkyvyys-startti"** | Featured in neighborhood "Welcome new business" notification to all users | Instant awareness | Low (push notification) |
| **Bonus 3: "Lähiyrittäjä-badge"** | Permanent verified local business badge | Social proof | Zero |

#### Guarantee: "30-Päivän Näkyvyystakuu" (30-Day Visibility Guarantee)

> "Jos et saa yhtään asiakasyhteydenottoa 30 päivän aikana, saat rahasi takaisin — ei kysymyksiä."
> (If you don't receive a single customer inquiry within 30 days, you get your money back — no questions asked.)

**Type:** Unconditional, time-bound. Strong for low-ticket SaaS. Signals confidence.

#### Scarcity (ethical)

> "Otamme vain 10 Pro-yritystä per naapurusto varmistaaksemme, ettei kenenkään näkyvyys kärsi."
> (We only accept 10 Pro businesses per neighborhood to ensure no one's visibility suffers.)

**This is real scarcity** — too many boosted businesses would dilute the value. Cap is defensible and beneficial to both the user and the platform.

---

## Pricing Architecture

```
Free Tier (€0)          Lending (10% fee)       Pro (€9.99/mo)
├── Browse              ├── All Free features    ├── All Free + Lending
├── Post                ├── Deposit protection   ├── Business profile
├── Message             ├── Structured returns   ├── Boosted visibility
├── Events              ├── Reviews              ├── Analytics
├── Basic trust         └── Automated handling   ├── Priority search
└── Community                                    ├── Pro badge
                                                 ├── Monthly insights
                                                 └── 30-day guarantee
```

### Why This Pricing Works

| Principle | Application |
|-----------|------------|
| **10:1 value ratio** | Pro: €1,500 perceived / €120 actual = 12.5:1 ✅ |
| **Free core fights chasm** | Pragmatists try risk-free; lending fee is per-transaction, not commitment |
| **Pro is affordable for Finnish small businesses** | €9.99/mo < one lunch. Low decision barrier |
| **Scarcity is real** | 10/neighborhood cap protects user experience |
| **Guarantee reverses risk** | "No customers = no payment" removes fear |

---

## Offer Naming (MAGIC Formula)

### Lending Offer

| Element | Applied |
|---------|---------|
| M (Magnetic) | "Turvallisesti" (safely) |
| A (Avatar) | Kallio residents |
| G (Goal) | Borrow what you need |
| I (Indicate time) | Immediate — find and book same day |
| C (Container) | "Palvelu" (service) |

**Result:** "Lainaa Turvallisesti" — simple, clear, Finnish-native.

### Pro Offer

| Element | Applied |
|---------|---------|
| M (Magnetic) | "Tavoita" (reach) + urgency |
| A (Avatar) | Lähiyrittäjä (local business owner) |
| G (Goal) | Lähiasiakkaat (nearby customers) |
| I (Indicate time) | 30 päivässä (in 30 days) |
| C (Container) | "Pro" |

**Result:** "Naapuruston Yritys Pro — Tavoita lähiasiakkaasi 30 päivässä"

---

## Quick Diagnostic

| Question | Current State | Action |
|----------|--------------|--------|
| 10x perceived value vs. price? | Pro: 12:1 ✅ | Maintain |
| Starving crowd? | Hungry, not starving (6/10) | Focus on pain messaging, not feature listing |
| Risk reversed? | No guarantees yet ❌ | Implement "30-Päivän Näkyvyystakuu" for Pro |
| 3+ named bonuses? | No bonuses yet ❌ | Add 3 Pro bonuses as designed above |
| Real urgency? | No ❌ | 10/neighborhood Pro cap |
| Impossible to compare? | Partially — no competitor has lending + trust + neighborhood | ✅ Unique combination |
| Name communicates value? | "TackBird Pro" → generic ❌ | Use MAGIC-named offers |

### Updated Score: 7/10 (design complete, implementation pending)

The offers are designed to be irresistible at their price points. Implementation requires: Stripe activation (for lending fees and Pro payments), push notifications (for bonuses like "Welcome" notification), and analytics dashboard (for Pro value delivery).

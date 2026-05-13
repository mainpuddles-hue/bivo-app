# TackBird — Financial Model (B2G / B2B)

**All assumptions explicit. Three scenarios: Bear / Base / Bull.**
**Revenue model: Taloyhtiö subscriptions (B2B) + City licenses (B2G) + C2C lending fees.**

---

## Assumptions

### User Growth

| Assumption | Bear | Base | Bull | Note |
|-----------|------|------|------|------|
| Launch month | Sep 2026 | Sep 2026 | Sep 2026 | Kallio Block Party timing |
| Seed buildings (month 0) | 3 | 5 | 8 | Taloyhtiö onboarding |
| Seed users (month 0) | 20 | 30 | 50 | ~6-10 users per building |
| Monthly organic growth rate | 15% | 25% | 40% | Building-to-building spread |
| Growth cap per neighborhood | 500 | 1000 | 2000 | Before opening new pin |
| Neighborhoods opened (year 1) | 3 | 5 | 8 | Bowling pin expansion |
| Churn rate (monthly) | 20% | 15% | 10% | Pre-product-market-fit range |

### Revenue (B2G / B2B)

| Assumption | Bear | Base | Bull | Note |
|-----------|------|------|------|------|
| Taloyhtiö price (avg) | 29 EUR/mo | 49 EUR/mo | 79 EUR/mo | Per building subscription |
| Paying buildings (month 12) | 8 | 15 | 30 | Conversion from free trial |
| City pilot (start month) | — | Month 6 | Month 4 | Forum Virium connection |
| City pilot price | — | 500 EUR/mo | 1 000 EUR/mo | Per neighborhood |
| City neighborhoods (month 12) | 0 | 1 | 3 | Expansion after pilot |
| Lending tx fee | 10% | 10% | 10% | Fixed SERVICE_FEE_RATE |
| Avg rental value | 15 EUR | 20 EUR | 30 EUR | Per transaction |
| Rentals per 100 WAU per month | 5 | 10 | 20 | Liquidity dependent |

### Costs

| Item | Monthly Cost | Scales With |
|------|-------------|-------------|
| Supabase | 0 → 25 → 75 EUR | Users (free → Pro → Team) |
| Expo/EAS | 0 → 15 EUR | Build volume |
| Domain/hosting | 10 EUR | Fixed |
| Apple/Google | 10 EUR | Fixed |
| Stripe fees | 2.9% + 0.25 EUR/tx | Transaction volume |
| Community manager (part-time) | 0 → 500 EUR | After launch |
| Marketing/QR/flyers | 50 EUR | Per neighborhood launch |
| B2B sales (part-time) | 0 → 500 EUR | After first paying buildings |

---

## 12-Month Projection — Base Case

### Users & Buildings

| Month | New Users | Churned | Net Active (WAU) | Paying Buildings | Neighborhoods |
|-------|-----------|---------|------------------|-----------------|---------------|
| 1 (Sep 26) | 30 | 0 | 30 | 0 (trial) | 1 (Kallio) |
| 2 | 38 | 5 | 63 | 0 (trial) | 1 |
| 3 | 47 | 9 | 101 | 3 | 1 |
| 4 | 59 | 15 | 145 | 5 | 1 |
| 5 | 74 | 22 | 197 | 7 | 2 (+ Sörnäinen) |
| 6 | 92 | 30 | 259 | 9 | 2 |
| 7 | 115 | 39 | 335 | 10 | 3 (+ Töölö) |
| 8 | 144 | 50 | 429 | 11 | 3 |
| 9 | 180 | 64 | 545 | 12 | 4 (+ Kruununhaka) |
| 10 | 225 | 82 | 688 | 13 | 4 |
| 11 | 281 | 103 | 866 | 14 | 5 (+ Pasila) |
| 12 | 352 | 130 | 1088 | 15 | 5 |

### Revenue (Base Case)

| Month | Taloyhtiö SaaS | City License | Lending Fee | Total MRR |
|-------|---------------|-------------|-------------|-----------|
| 1 | 0 | 0 | 0 | 0 |
| 2 | 0 | 0 | 0 | 0 |
| 3 | 147 | 0 | 20 | 167 |
| 4 | 245 | 0 | 29 | 274 |
| 5 | 343 | 0 | 39 | 382 |
| 6 | 441 | 500 | 52 | 993 |
| 7 | 490 | 500 | 67 | 1 057 |
| 8 | 539 | 500 | 86 | 1 125 |
| 9 | 588 | 500 | 109 | 1 197 |
| 10 | 637 | 500 | 138 | 1 275 |
| 11 | 686 | 500 | 173 | 1 359 |
| 12 | 735 | 500 | 218 | 1 453 |
| **Year total** | **4 851** | **3 500** | **931** | **9 282** |

### Costs (Base Case)

| Month | Infra | Marketing | Community Mgr | B2B Sales | Total Cost | Net |
|-------|-------|-----------|---------------|-----------|-----------|-----|
| 1-3 | 20 | 50 | 0 | 0 | 70 | -14 avg |
| 4-6 | 30 | 80 | 0 | 300 | 410 | +140 avg |
| 7-9 | 45 | 100 | 500 | 500 | 1 145 | -19 avg |
| 10-12 | 60 | 120 | 500 | 500 | 1 180 | +182 avg |
| **Year total** | **465** | **1 050** | **3 000** | **3 900** | **8 415** | **+867** |

**Break-even (base case):** Month 6 (city pilot contract pushes MRR above costs)

---

## Scenario Comparison — Month 12

| Metric | Bear | Base | Bull |
|--------|------|------|------|
| WAU | 420 | 1 088 | 2 450 |
| Paying buildings | 8 | 15 | 30 |
| City neighborhoods | 0 | 1 | 3 |
| MRR | 232 EUR | 1 453 EUR | 5 370 EUR |
| ARR (run-rate) | 2 784 EUR | 17 436 EUR | 64 440 EUR |
| Total costs/mo | 580 EUR | 1 180 EUR | 1 950 EUR |
| Net/mo | -348 EUR | +273 EUR | +3 420 EUR |
| Cumulative net | -4 200 EUR | +867 EUR | +22 000 EUR |

---

## Sensitivity Analysis

### What matters most for revenue?

| Variable | +10% change | Revenue impact | Sensitivity |
|----------|-------------|----------------|-------------|
| Paying buildings count | 15 → 16.5 | +5% revenue | **HIGH** |
| Taloyhtiö avg price | 49 → 54 EUR | +5% revenue | **HIGH** |
| City pilot secured | 0 → 1 contract | +38% revenue | **CRITICAL** |
| User growth rate | 25% → 27.5% | +3% revenue (lending) | MEDIUM |
| Churn rate | 15% → 13.5% | +2% revenue | MEDIUM |
| Rental volume | 10 → 11/100WAU | +1% revenue | LOW |

**Key insight:** Revenue is most sensitive to B2B/B2G sales execution — converting buildings to paying customers and securing the city pilot. User growth matters for platform value but is secondary to organizational sales. This validates the strategy of nailing 5 taloyhtiöt before expanding.

---

## Milestone-Linked Spending

| Milestone | Trigger | Budget Unlocked |
|-----------|---------|-----------------|
| Pre-launch | Always | 200 EUR (QR, flyers) |
| 5 buildings onboarded | Platform works for taloyhtiöt | 500 EUR (community mgr pilot) |
| 3 paying buildings | B2B model validated | 500 EUR/mo (B2B sales, part-time) |
| City pilot signed | Forum Virium intro | 1 000 EUR/mo (community mgr + next pin) |
| 15 paying buildings | Multi-neighborhood demand | Consider fundraising |
| 50 paying buildings | Scalable B2B engine | Hire full-time sales + community |

---

## Unit Economics (Target at Scale)

### Per Taloyhtiö (B2B)

| Metric | Target (50+ buildings) |
|--------|------------------------|
| CAC (taloyhtiö) | <100 EUR (hallitus demo + QR setup) |
| Monthly revenue per building | 49-79 EUR |
| Annual contract value | 588-948 EUR |
| LTV (24-month avg retention) | 1 176-1 896 EUR |
| LTV/CAC | >10x |
| Payback period | <2 months |
| Gross margin | >90% (SaaS) |

### Per City Contract (B2G)

| Metric | Target |
|--------|--------|
| Sales cycle | 3-6 months (Forum Virium warm intro) |
| Annual contract value | 6 000-24 000 EUR |
| Gross margin | >90% |

### Platform (Blended)

| Metric | Target (1000+ WAU, 15+ buildings) |
|--------|-------------------------------------|
| Platform ARPU (all users) | ~1.30 EUR/mo (most users free, revenue from building subs) |
| Gross margin | >90% (SaaS-like) |
| Net revenue retention | >110% (buildings upgrade tiers + add features) |

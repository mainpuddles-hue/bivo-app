# TackBird Strategic Brief — April 2026

Compiled from 7 parallel strategy analyses: Product Lens, Hook Model, Click-Path UX Audit, Crossing the Chasm, Contagious (STEPPS), StoryBrand Messaging, and Retention Strategy.

---

## The One Diagnosis

**TackBird has the bones of a genuine product that solves a real Finnish need. The technology is not the bottleneck. The bottleneck is density — zero users, zero social proof, zero habit loops.**

The app has 48 screens, 31 Edge Functions, 67 database tables, and a 3-tier trust system — the architecture of a mature platform, not a pre-launch MVP. It needs to be launched at the scale of **one building**, not one city.

---

## Three Critical Blockers (Fix Before Any Launch)

| # | Blocker | Why Fatal | Effort |
|---|---------|-----------|--------|
| 1 | **Push notifications not validated end-to-end** | Zero external triggers → no re-engagement → no habit loop. Hook Model scores Triggers at 2/10. | 2-3 weeks |
| 2 | **No App Store / Google Play distribution** | Cannot reach pragmatists via Expo Go. | 1-2 weeks (EAS Build) |
| 3 | **No guest browsing** | 100% of visitors hit a registration wall before seeing any content. Time to first value: 3-5 minutes vs Facebook Groups' 5 seconds. | 1 week |

**Total pre-launch infrastructure work: 5-8 weeks.**

---

## The Beachhead: Kallio, One Building at a Time

### Why Kallio
- Highest population density in Helsinki (~15,000/km²)
- Overwhelmingly kerrostalo with small apartments (30-45m²) — storage-limited residents need access to things they can't store
- Strongest neighborhood identity in Helsinki ("kalliolainen" is a self-identity)
- Anti-Facebook sentiment (privacy-conscious demographic uses "Kallio kierrättää" because there's no alternative)
- Physically compact (~2km²) — hyperlocal value is self-evident

### Why Building-First
- Smallest critical mass requirement: ~10-20 people per building
- Finnish kerrostalo buildings have 20-60 units
- Taloyhtiö (housing cooperative) is the most trusted institution in Finnish daily life
- One board member decision onboards an entire building
- Building → Adjacent building → Neighborhood is the expansion path

### Domination Signals
| Metric | Minimum Viable | Self-Sustaining | Dominated |
|--------|---------------|-----------------|-----------|
| WAU per neighborhood | 50 | 150 | 300+ |
| Posts/day | 1-2 | 5+ | 15+ |
| Organic > seeded content | No | Yes | Yes |
| D28 retention | 10% | 20% | 25%+ |

---

## Bowling Pin Expansion Strategy

```
Pin 1: Kallio (00500-00530) — beachhead
Pin 2: Sörnäinen-Vallila — physically adjacent, shared metro, social overlap
Pin 3: Töölö — different demo (older, homeowners), validates beyond young renters
Pin 4: Kruununhaka — smaller, wealthy, validates premium
Pin 5+: Pasila → Käpylä → Lauttasaari → eastern Helsinki → suburbs
```

**Never expand until the previous pin is dominated. Retention proves the product, not features.**

---

## Feature Kill/Double-Down Lists

### Kill (Remove or Hard-Defer)

| Feature | Reason |
|---------|--------|
| Payment checkout / history / settings / payouts | Zero transactions. 4 dead screens. |
| Business accounts | B2B before C2C traction |
| Ad campaigns | Zero advertisers |
| Price suggestion AI | ML for empty market |
| Semantic search | AI search over empty content |
| Demand insights | Analytics for empty market |
| Speed badges | Not implemented, dead constants |
| Points / gamification (if kept invisible) | Silent points are worse than no points |
| Return item / Review borrower flows | Zero rentals |
| 3 of 4 event APIs | Keep LinkedEvents only, drop Kide/Ticketmaster/Meteli |
| Palvelukartta places | Rebuilding Google Maps |
| City admin screen | No city admins |

### Double-Down (Invest More)

| Feature | Why |
|---------|-----|
| **"Ilmaista" (free stuff) category** | Lowest friction, no money/trust needed, highest emotional response, most shareable |
| **Building-first experience** | Taloyhtiö is the daily-open driver — functional need, not optional entertainment |
| **Messaging quality** | The conversation IS the product. Every feature should funnel toward neighbor-to-neighbor chat |
| **Push notifications** | The entire re-engagement loop. "Naapuri vastasi" is what brings people back |
| **Empty state experience** | First thing most users see. Replace fake seed posts with honest invitation to be the first |
| **Posting flow simplification** | Quick post: category + title + optional photo. Everything else is progressive disclosure |
| **Onboarding with browse-first** | Show feed before registration. Soft-gate on interaction, not on viewing |

---

## Hook Model Fixes (Current: 4/10 → Target: 8/10)

### Triggers (2→7)
- Ship end-to-end push notification pipeline
- Daily "Naapuruston pulssi" digest push at 8:00 AM: "Kalliossa eilen: 5 uutta ilmoitusta"
- Building announcements with immediate push delivery
- Saved search match alerts

### Action (7→8)
- Quick message templates: "Hei, onko tämä vielä saatavilla?"
- One-tap ilmaista posting: photo → title → done
- Reduce lainaa wizard from 7 steps to 4

### Variable Reward (5→7)
- Surface points + streak counter visually on profile
- "Trending in Kallio right now" card in feed
- Community impact stats: "Kalliossa säästetty 12,450€ tässä kuussa"

### Investment (4→7)
- "X you follow posted" push triggers
- "Saved post still available" reminders
- Building membership → building announcement triggers

---

## Click-Path UX: Top Fixes by Impact

### Critical
1. **Guest browsing mode** — browse feed without account, soft-gate on interaction
2. **Direct deep linking from push** — push → destination screen (not notification list)
3. **Pre-filled first message** — "Hei! Kiinnostuisin ilmoituksestasi: [title]"

### High
4. Collapse onboarding welcome slide into login screen
5. Hide referral/coop code inputs behind expandable
6. Add "Add to Calendar" on event detail after joining
7. Add event search to Explore screen

### Medium
8. Switch Explore default from map to events
9. Add post preview before publishing
10. Replace Alert image picker with bottom sheet
11. Show post context card in conversation header
12. Shorten 7-step new-listing wizard to 4-5 steps

---

## Viral Growth: Top 5 Tactics (Zero Budget)

| # | Tactic | Cost | Expected Impact |
|---|--------|------|-----------------|
| 1 | **Taloyhtiö board infiltration** — pitch building management to boards, attend yhtiökokous | 0€ | 3 buildings × 30 households = 36 active users from 3 conversations |
| 2 | **"Ilmaista" as viral engine** — one-tap posting, beautiful share cards, cross-post to FB groups | 0€ | Each ilmaista post reaches 3 non-users → 6 new users/week |
| 3 | **Kevätsiivous campaign** — time launch to spring cleaning season | 20€ (flyers) | Content density spike + natural exchange behavior |
| 4 | **Stairwell QR stickers** — elegant sticker on taloyhtiö notice board | 15-30€ | 9 new users/building/month × 20 buildings = 180 users/month |
| 5 | **Neighborhood coffee events** — organize free meetups in parks | 0€ | 15-25 attendees → 8-10 retained users per event |

**K-factor will be 0.2-0.3 (well below 1.0).** Finnish cultural reserve means people don't aggressively invite. The taloyhtiö channel bypasses individual viral coefficient entirely — it's institutional adoption.

---

## Messaging (StoryBrand Framework)

### One-Liner
**Finnish:** "TackBird on naapurustosi oma ilmoitustaulu — löydä, lainaa ja jaa lähellä, turvallisesti."
**English:** "TackBird is your neighborhood's own bulletin board — find, borrow, and share nearby, safely."

### 3-Step Plan
1. **Lataa ja liity naapurustoon** — Valitse naapurustosi ja liity talosi yhteisöön
2. **Ilmoita, lainaa tai jaa** — Kerro mitä tarvitset tai mitä voit tarjota
3. **Tapaa lähellä** — Viesti naapurille, sovi nouto, rakenna luottamusta

### Tagline Options
| # | Finnish | Angle |
|---|---------|-------|
| 1 | "Naapurustosi ilmoitustaulu." | **Recommended** — immediately clear, positions vs Tori.fi + Facebook |
| 2 | "Löydä, lainaa, jaa — lähellä." | Action-oriented |
| 3 | "Naapurit, ei tuntemattomia." | Trust angle |
| 4 | "Kävelymatkan päässä kaikesta." | Proximity value |
| 5 | "Missä naapurit kohtaavat." | Community-first |

### Brand Voice
| Attribute | Do | Don't |
|-----------|-----|-------|
| Helpful | "Joku lähellä tarjoaa porakoneen" | "Säästä maapalloa lainaamalla!" |
| Local | "Kalliossa" | "Helsingissä" |
| Trustworthy | "Turvallisesti, vakuussuojalla" | "PARAS LAINAUSSOVELLUS!!!" |
| Finnish-natural | Puhekieli-leaning tone | Corporate kirjakieli |

---

## Launch Timeline

### Optimal Launch: September 2026
Timed with Kallio Block Party + post-summer return to city. **Avoid June-August** (kesämökki season, -30-50% active users in July).

### Pre-Launch (May-August)
- Fix 3 critical blockers (push, App Store, guest browsing)
- Personally onboard 5 taloyhtiö buildings in Kallio
- Seed 30+ real posts across categories
- Complete 5 lending transactions with friends (builds review content)
- Print stairwell stickers, prepare QR codes

### Month 1-3 (September-November)
- 20 lighthouse users → 50 WAU → 100 WAU
- First Facebook group mentions (organic)
- First physical QR placements (5 locations)
- 2-3 taloyhtiö building onboardings
- First community event (Kallio kahvittelut)

### Month 3-6
- Only expand if Kallio hits 150+ WAU with 25%+ D7 retention
- Pin 2: Sörnäinen-Vallila via cross-neighborhood shares
- Pin 3: Töölö via taloyhtiö channel (different demographic)

### Month 12 Targets
| Metric | Target |
|--------|--------|
| Total WAU | 2,000 |
| Active neighborhoods | 10+ |
| Weekly exchanges | 200 |
| D28 retention | 25%+ |
| NPS | 40+ |
| MRR | 500€ (Pro + ads) |

---

## Retention Framework

### Targets by Timeframe
| Metric | Bad | OK | Good | Great |
|--------|-----|------|------|-------|
| D1 retention | <20% | 20-35% | 35-45% | >45% |
| D7 retention | <10% | 10-20% | 20-30% | >30% |
| D30 retention | <5% | 5-12% | 12-20% | >20% |
| DAU/WAU | <20% | 20-35% | 35-45% | >45% |

### The "Aha Moment"
**Receiving a response from a neighbor within 4 hours.** Users who get a meaningful reply to their first message are dramatically more likely to be retained at D30.

### Top Retention Tactics (Ranked)
1. **Ship push notifications via EAS Build** (10/10 impact) — nothing else matters without this
2. **Seed 50+ posts before any real user sees the app** (9/10) — empty feed = instant churn
3. **"New posts since last visit" indicator** (7/10) — creates anticipation
4. **Visible onboarding checklist** (7/10) — drives first-week actions
5. **First response speed guarantee** (7/10) — auto-nudge post creators after 24h
6. **Daily "naapuruston pulssi" push** (6/10) — one morning push: "3 uutta ilmoitusta Kalliossa"
7. **Post-exchange review prompt** (6/10) — feeds trust loop
8. **Community impact stats on profile** (5/10) — "Olet auttanut 12 naapuria"

### Notification Strategy (Finnish Cultural Rules)
- Quiet hours: 22:00-07:00 (extend to 21:30)
- Max 5 pushes/day (excluding messages)
- Never use FOMO language ("You're missing out!")
- Batch likes into "5 people liked your post" after 15-min window
- Taloyhtiö announcements: always immediate delivery

### Churn Prevention
- **#1 churn cause:** Empty feed on first visit
- **#2 churn cause:** Unanswered first message
- **#3 churn cause:** Forgot the app exists (no push notifications)
- **Win-back:** "Naapurisi Kalliossa etsii porakonetta — voitko auttaa?" (NOT "We miss you")

---

## JTBD Strategic Wedge

### The Wedge: Peer Lending (Lainaa)
No Finnish platform offers structured peer lending with deposits, reviews, and trust. This is TackBird's clearest blue ocean. Tori.fi is buy/sell only. Facebook is informal promises.

### The Cold-Start Killer: Free Stuff (Ilmaista)
Lowest anxiety, lowest inertia. Seed every neighborhood with 10-15 ilmaista posts. They're irresistible and create the impression of active community.

### The Moat: Building Management (Taloyhtiö)
Once announcements, maintenance history, and member directory live in TackBird, switching costs become very high. But adoption requires a top-down champion (board member or isännöitsijä).

### Key Competing Solutions
| What | Overlap | TackBird Wins Because |
|------|---------|----------------------|
| Tori.fi | Buy/sell | No lending, city-wide, impersonal |
| FB Groups (Kallio kierrättää) | Giveaways, questions | Unstructured, no trust, posts buried |
| WhatsApp taloyhtiö groups | Building coordination | No announcements, no search, chaos |
| Physical ilmoitustaulu | Building notices | Static, no images, no interaction |
| Nextdoor | Closest concept | Not in Finland, English, toxic reputation |

**Do not fight Facebook — complement it.** Win on structured transactions (lending, maintenance, polls) that Facebook's feed handles poorly.

---

## The Core Insight

> "The app treats Helsinki as 40 neighborhoods of equal importance. It should treat it as **one building**. 20 real people using ilmaista and tarvitsen categories, messaging each other, and coming back the next day. Everything else is premature optimization."

The product-market fit question will be answered by **Kallio retention metrics after 90 days**, not by feature debates. If 25% of users come back after 28 days and NPS exceeds 35, the chasm is crossable. If not, iterate in Kallio until it is.

---

## Source Analyses

This brief synthesizes 8 parallel deep-dive analyses (April 2026):

| Analysis | Framework | Key Finding |
|----------|-----------|-------------|
| Product Lens | Feature inventory + value chain | 48 screens for 0 users — massively over-scoped |
| Hook Model (x2) | Nir Eyal's 4-phase model | Score 2.75-4/10, broken at Triggers phase |
| Click-Path UX | 6 critical user journeys | 12+ taps to first value vs Facebook's 5 seconds |
| Crossing the Chasm | Geoffrey Moore's framework | Kallio beachhead → bowling pin expansion |
| JTBD | Jobs-to-be-Done | Lending is the wedge, ilmaista is the cold-start killer |
| Contagious STEPPS | Jonah Berger's viral framework | Taloyhtiö is the viral unit, not the individual |
| StoryBrand | Donald Miller's SB7 | "Naapurustosi ilmoitustaulu" — hero is the neighbor |
| Retention | D1/D7/D30/D90 framework | Push notifications are the #1 retention blocker |

# TackBird — Hook Model Analysis (Hooked UX)

> Framework: Nir Eyal's Hook Model (Trigger → Action → Variable Reward → Investment)
> Date: 2026-04-24 | Market: Helsinki, Finland
> Current Score: **4/10** — External triggers missing (no push notifications), variable rewards weak, investment loops incomplete. This document designs the path to 8+/10.

---

## Manipulation Matrix — Ethics Check First

|  | **Maker Uses Product** | **Maker Doesn't Use** |
|--|------------------------|----------------------|
| **Materially Improves Life** | **✅ FACILITATOR** | Peddler |
| **Doesn't Improve Life** | Entertainer | Dealer |

**TackBird = Facilitator:**
- Jesse (maker) would use this himself in Kallio ✅
- Saves money (lending vs buying), reduces waste, builds community ✅
- Not exploiting vulnerable emotions — addressing real isolation and practical needs ✅

**We can ethically build habit loops.**

---

## The TackBird Hook — Primary Loop

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  TRIGGER                    ACTION                      │
│  "Mitähän naapurustossa     Open app → scroll feed      │
│   tapahtuu?"                (< 3 seconds)               │
│  (curiosity, FOMO)                                      │
│                                                         │
│           ↑                          ↓                  │
│                                                         │
│  INVESTMENT                 VARIABLE REWARD              │
│  Post item, leave review,   New posts, messages,         │
│  follow neighbor, RSVP      trust score change,          │
│  → loads next trigger       event nearby                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: TRIGGER — "Mitähän naapurustossa tapahtuu?"

### Internal Trigger (target state)

| Emotion | Situation | TackBird Response |
|---------|-----------|-------------------|
| **Curiosity** | "Mitähän naapurustossa tapahtuu?" | Open app → see neighborhood feed |
| **Need** | "Tarviin porakoneen viikonlopuksi" | Open app → search lainaa |
| **Generosity** | "Tää takki ei mahdu enää kaappiin" | Open app → post ilmaista |
| **Loneliness** | "Olis kiva tuntea naapureita" | Open app → browse events/forum |
| **FOMO** | "Jäänkö paitsi jostain lähellä?" | Open app → check what's new |

**Primary internal trigger:** Curiosity about what's happening nearby. This is the "mitähän" reflex — the same emotion that makes you peek out the window.

### External Triggers (bridge to internal)

| Trigger | Type | When | Implementation Status |
|---------|------|------|----------------------|
| **Push: new message** | Relationship | Someone messages you | ❌ NOT YET (needs expo-notifications + EAS) |
| **Push: post in your neighborhood** | Owned | New post nearby matches interests | ❌ NOT YET |
| **Push: event this week** | Owned | Weekly digest of upcoming events | ❌ NOT YET |
| **Push: saved search match** | Owned | New post matches saved search | ❌ NOT YET |
| **Push: trust score change** | Owned | "Olet nyt Luotettu naapuri!" | ❌ NOT YET |
| **Push: review prompt** | Owned | 24h after exchange | ❌ NOT YET |
| **Invite link from friend** | Earned | WhatsApp/SMS share | ❌ NOT YET (needs deep linking) |
| **In-app onboarding** | Paid | First-time tutorial overlay | ✅ DONE (OnboardingOverlay) |
| **App icon badge** | Owned | Unread count on icon | ❌ NOT YET |

### 🚨 Critical Gap: Zero External Triggers

**Without push notifications, TackBird has NO way to bring users back.** The app relies entirely on the user remembering to open it. This is the single biggest blocker for habit formation.

**Priority:** Push notifications are the #1 feature to ship. Without them, no habit loop can form.

### External → Internal Transition Plan

| Week | External Trigger Strategy | Goal |
|------|--------------------------|------|
| 1 | Welcome push: "Tervetuloa naapurustoon! Katso mitä lähellä tapahtuu." | First loop completion |
| 1-2 | Daily "uutta naapurustossa" push (morning, 1x/day max) | Establish check-in routine |
| 2-4 | Event/post match pushes only (stop daily digest) | Transition to value-based triggers |
| 4+ | Message + review + trust pushes only | Internal trigger should be forming |
| 8+ | Reduce external triggers to minimum | "Mitähän naapurustossa" is now habitual |

---

## Phase 2: ACTION — Simplest behavior in anticipation of reward

### Core Action: Open app → scroll feed

| Ability Factor | Current State | Target |
|----------------|--------------|--------|
| **Time** | ~3s to open and see content | ✅ Good |
| **Money** | Free | ✅ Good |
| **Physical effort** | One tap | ✅ Good |
| **Brain cycles** | Feed is pre-filtered by neighborhood | ✅ Good |
| **Social deviance** | Low — browsing is private | ✅ Good |
| **Non-routine** | Not yet routine for users | ❌ Needs external triggers to establish |

### Secondary Actions (low-friction)

| Action | Friction Level | Improvement Needed |
|--------|---------------|-------------------|
| Like a post | 1 tap | ✅ Done |
| Save a post | 1 tap | ✅ Done |
| RSVP to event | 1 tap | ✅ Done |
| Send message | 2 taps + typing | ✅ Acceptable |
| Post an item | 5+ fields, photo required | ⚠️ Consider draft auto-fill, photo-first flow |
| Create event | 8+ fields | ⚠️ Consider quick-event templates |
| Leave review | Tap stars + text | ⚠️ Consider one-tap emoji review option |

### Action Design: The "60-Second Rule"

Users must get value within 60 seconds of opening:

```
0s  — App opens, feed loads (skeleton → content)
5s  — See 3+ posts from their naapurusto
15s — See something interesting (browse)
30s — Tap → read details / see images
45s — Like or save (micro-engagement)
60s — VALUE DELIVERED ✅
```

---

## Phase 3: VARIABLE REWARD — The "mitähän nyt" factor

### Reward Type: Tribe (social validation from neighbors)

| Reward | Variability | Current State |
|--------|-------------|--------------|
| Someone messages you about your post | High — who? what? when? | ✅ Done |
| Likes on your post | Variable count | ✅ Done |
| Review from a neighbor | Unpredictable content and timing | ✅ Done |
| Trust score increases | Milestone-based surprise | ✅ Done (TrustProgress) |
| New follower | Who started following you? | ✅ Done |

### Reward Type: Hunt (finding resources/info)

| Reward | Variability | Current State |
|--------|-------------|--------------|
| New posts in feed | Different every time you open | ✅ Done — but needs refresh indicator |
| Free stuff nearby | "Ilmaista" items appear randomly | ✅ Done |
| Perfect item to borrow | Search/browse lainaa | ✅ Done |
| Neighborhood events | New events posted unpredictably | ✅ Done |
| Forum discussions | New topics and replies | ✅ Done |

### Reward Type: Self (personal mastery/progress)

| Reward | Variability | Current State |
|--------|-------------|--------------|
| Trust tier promotion | "Olet nyt Luotettu!" — level up | ✅ Done (TrustBadge explainer) |
| Trust score progress | Numeric score changes | ✅ Done (TrustProgress) |
| Successful exchange | Complete a lending/sharing cycle | ✅ Done |
| Community contribution | Help count, items shared | ⚠️ No stats visible yet |

### 🚨 Variable Reward Gaps

1. **No "pull to refresh" anticipation moment** — feed should show "X new posts" indicator so opening feels like unwrapping
2. **No neighborhood activity digest** — "Tänään Kalliossa: 3 uutta ilmoitusta, 1 tapahtuma"
3. **No "surprise and delight" moments** — Consider: random "naapuri kiittää" badge, seasonal events, neighborhood milestones ("Kalliossa 100 onnistunutta lainaa!")
4. **No community impact visibility** — "Yhteensä 450€ säästetty lainaamisella naapurustossasi"

---

## Phase 4: INVESTMENT — Loading the next trigger

### Current Investments

| Investment Type | Action | Loads Next Trigger? |
|----------------|--------|-------------------|
| **Content** | Post an item, create event | ✅ Yes — responses trigger messages |
| **Data** | Set neighborhood, categories, language | ✅ Yes — personalizes feed |
| **Reputation** | Leave/receive reviews → trust score | ✅ Yes — tier changes trigger pride |
| **Social** | Follow neighbors, RSVP events | ⚠️ Partially — no "X you follow posted" trigger |
| **Skill** | Learn categories, posting flow | ✅ Yes — expertise makes posting easier |

### Investment Sequence (after reward)

```
User receives reward (message, like, review)
    ↓
Investment prompt appears naturally:
    → "Vastaa viestiin" (reply to message)
    → "Kirjoita arvostelu" (leave a review)
    → "Seuraa naapuria" (follow this neighbor)
    → "Jaa oma ilmoitus" (post your own listing)
    ↓
Investment loads next trigger:
    → Reply → other person replies → notification → LOOP
    → Review → trust score changes → tier notification → LOOP
    → Follow → their next post appears in feed → LOOP
    → Post → someone messages you → notification → LOOP
```

### 🚨 Investment Gaps

1. **No "invite neighbor" flow after successful exchange** — The perfect moment to ask "Kutsu naapurisi TackBirdiin" is right after a good experience
2. **No profile completeness prompt** — "Lisää kuva profiiliin — naapurit luottavat enemmän" after first successful exchange
3. **No "save this search" prompt** — After browsing lainaa with no results: "Ilmoitamme kun joku tarjoaa tätä!"
4. **No neighborhood preference learning** — App should get smarter about what you're interested in

---

## Hook Audit: Current State vs Target

| Phase | Current Score | Target Score | Critical Missing Piece |
|-------|-------------|-------------|----------------------|
| Trigger | **2/10** | 8/10 | Push notifications (zero external triggers) |
| Action | **7/10** | 9/10 | Core actions are simple; posting could be simpler |
| Variable Reward | **5/10** | 8/10 | Tribe rewards work; hunt and self need enhancement |
| Investment | **4/10** | 8/10 | Basic investments exist; trigger-loading is incomplete |
| **TOTAL** | **4/10** | **8/10** | |

---

## Implementation Priority: The Habit Stack

### Sprint 1: External Triggers (CRITICAL — nothing works without this)

| Feature | Impact | Effort |
|---------|--------|--------|
| expo-notifications + EAS push token registration | Enables all triggers | High |
| New message push notification | Core engagement loop | Medium |
| New post in neighborhood push | Daily engagement trigger | Medium |
| Event reminder push (24h before) | Event attendance driver | Low |

### Sprint 2: Variable Reward Enhancement

| Feature | Hook Phase | Effort |
|---------|-----------|--------|
| "X uutta ilmoitusta" badge on feed tab | Reward anticipation | Low |
| Neighborhood activity summary card | Hunt reward | Medium |
| Community impact stats ("450€ säästetty") | Self reward | Medium |
| "Naapuri kiittää" surprise badge after 5 exchanges | Self reward | Low |

### Sprint 3: Investment → Trigger Loading

| Feature | Investment Type | Next Trigger Loaded |
|---------|----------------|-------------------|
| "Kutsu naapuri" after successful exchange | Social | Invited person joins → notification |
| "Tallenna haku" prompt on empty results | Data | Match found → push notification |
| Post-review follow prompt | Social | Followed person posts → feed update |
| Profile completeness progress bar | Data | Better matches → more engagement |

### Sprint 4: Internal Trigger Formation

| Feature | Purpose |
|---------|---------|
| Reduce daily digest to weekly | Force internal trigger |
| A/B test notification frequency | Find minimum external triggers needed |
| Measure unprompted opens (target: 5% of users) | Validate habit formation |

---

## Habit Testing Plan

After 30 days of pilot (Kallio neighborhood):

### Question 1: Who are the habitual users?
- Define "habitual" = opens app unprompted 3+ times/week
- Target: 5% of active users reach habitual status in 30 days
- Track: daily opens WITHOUT preceding push notification

### Question 2: What are they doing?
- Map the "Habit Path" — most common action sequence
- Hypothesis: Open → Feed → Tap post → Message → Close (Hunt loop)
- Or: Open → Feed → Like/Save → Close (Browse loop)

### Question 3: Why are they doing it?
- In-app micro-survey at day 14: "Miksi avasit TackBirdin juuri nyt?"
- Options: "Katsoin onko uutta" / "Etsin jotain" / "Sain ilmoituksen" / "Tapana avata"
- Goal: "Tapana avata" or "Katsoin onko uutta" = internal trigger formed

---

## The TackBird Hook — Summary

**Trigger:** "Mitähän naapurustossa tapahtuu?" (curiosity about your neighborhood)

**Action:** Open app → scroll feed (< 3 seconds to value)

**Variable Reward:**
- Tribe: Messages, likes, reviews from actual neighbors
- Hunt: New posts, free stuff, events — different every time
- Self: Trust score progress, successful exchanges, community impact

**Investment:** Post items, leave reviews, follow neighbors, RSVP events → each loads the next trigger

**The flywheel:** More posts → more reasons to open → more engagement → more posts. Trust scores compound. Community grows. Helsinki neighborhoods become digital.

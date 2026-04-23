# TackBird — Experience Map

> Framework: wondelai/experience-map
> Date: 2026-04-23 | Scope: Full user lifecycle across all touchpoints and channels

---

## Experience Map: Full TackBird Lifecycle

### Phases (Horizontal Axis)

```
AWARENESS → EVALUATION → ONBOARDING → FIRST VALUE → REGULAR USE → ADVANCED USE → ADVOCACY
```

---

## Phase 1: Awareness

| Layer | Detail |
|-------|--------|
| **User Actions** | Hears about TackBird from friend/neighbor, sees invite link on WhatsApp, reads about it on r/Finland or neighborhood FB group |
| **Touchpoints** | WhatsApp share link, Instagram/Facebook post, word of mouth, App Store search, TackBird website |
| **Channels** | Social media (passive), personal recommendation (active), App Store discovery |
| **Emotions** | Curiosity ("What's this?"), Skepticism ("Another app?"), Interest ("Neighborhood sharing?") |
| **Pain Points** | No awareness — TackBird doesn't exist in anyone's mind yet. App Store won't surface it without installs. |
| **Opportunities** | Invite system with social proof ("5 naapuriasi on jo TackBirdissä"), shareable "ilmaista" cards for WhatsApp, taloyhtiö partnership emails |

### Key Decisions
- "Is this worth downloading?" — Need compelling value proposition in first 5 seconds
- "Is this for my neighborhood?" — Must immediately signal hyperlocal focus

---

## Phase 2: Evaluation

| Layer | Detail |
|-------|--------|
| **User Actions** | Opens App Store listing, reads screenshots/description, checks reviews, visits tackbird.com |
| **Touchpoints** | App Store listing, website, friends' recommendation |
| **Channels** | App Store (iOS/Android), mobile browser |
| **Emotions** | Evaluating ("What can I do here?"), Comparing ("Better than Tori.fi?"), Hesitating ("Do I need another app?") |
| **Pain Points** | App Store listing is the ONLY chance to convert — no reviews yet (pre-launch). No web preview for shared links (no deep linking). |
| **Opportunities** | Screenshots showing real neighborhood content, "Naapurustosi ilmoitustaulu" tagline, "Ilmainen — ei mainoksia" value prop, Finnish-first description |

### Key Decisions
- "Download or not?" — Hinge point. If screenshots look empty or generic, user leaves.

---

## Phase 3: Onboarding

| Layer | Detail |
|-------|--------|
| **User Actions** | Download → Open → Register (email/Google/Apple) → Set name → Choose neighborhood → Set language |
| **Touchpoints** | Auth screen, onboarding wizard (MISSING — needs to be built), neighborhood picker |
| **Channels** | Mobile app only |
| **Emotions** | Hopeful ("Let's see what's here"), Impatient ("How many steps?"), Anxious if feed is empty |
| **Pain Points** | No onboarding tutorial. Google OAuth not working without EAS build. If feed is empty after onboarding, user churns immediately. |
| **Opportunities** | 3-step onboarding (welcome → neighborhood → interests), pre-seeded content per neighborhood, "Welcome to {neighborhood}!" toast |

### Current State vs Desired State

```
CURRENT:                          DESIRED:
Register → Feed (cold)            Register → Welcome → Pick neighborhood
                                  → See interests → Feed (warm, personalized)
```

### Key Decisions
- "This neighborhood has stuff?" — Empty feed = instant churn
- "I understand what to do?" — Guidance needed for first-time users

---

## Phase 4: First Value (Aha Moment)

| Layer | Detail |
|-------|--------|
| **User Actions** | Browse feed → See something relevant → Tap → Send first message OR save first item OR join first event |
| **Touchpoints** | Feed screen, post detail, messages, events list, event detail |
| **Channels** | Mobile app |
| **Emotions** | Surprise ("There's stuff near me!"), Excitement ("Someone responded!"), Relief ("This actually works") |
| **Pain Points** | If no relevant content, Aha never arrives. First message going unanswered kills momentum. No push notification to alert response. |
| **Opportunities** | Push notification on first response, celebratory animation on first interaction, "First post" badge, onboarding checklist gamification |

### Aha Moment Definition
> "The user sees an item within 1km that they want/need, and successfully messages the poster within 24 hours."

### Time-to-Aha Target: < 10 minutes from onboarding completion

---

## Phase 5: Regular Use

| Layer | Detail |
|-------|--------|
| **User Actions** | Daily/weekly feed check, create posts, respond to messages, attend events, leave reviews, use saved searches |
| **Touchpoints** | All app screens, push notifications, email digests (weekly) |
| **Channels** | Mobile app (primary), push notifications (re-engagement), email (weekly digest) |
| **Emotions** | Routine ("Let me check TackBird"), Satisfaction ("Helped a neighbor today"), Belonging ("I know people here now") |
| **Pain Points** | Feed staleness (same posts), notification fatigue, message coordination friction, no draft saving |
| **Opportunities** | Personalized feed algorithm, "New this week" highlights, weekly neighborhood summary, streak/badge system, recurring event support |

### Engagement Loop
```
Check feed → See something → Interact (message/save/like) → Get response
     ↑                                                          │
     └──────────── Push notification ───────────────────────────┘
```

---

## Phase 6: Advanced Use

| Layer | Detail |
|-------|--------|
| **User Actions** | Lending with payments, organizing events, earning Tier 3 trust, using Pro features, posting regularly, moderating community |
| **Touchpoints** | Lending flow + Stripe, event creation, trust dashboard, Pro settings, forum, admin panel |
| **Channels** | Mobile app, Stripe checkout (external), email (booking confirmations, receipts) |
| **Emotions** | Pride ("I'm a trusted member"), Ownership ("This is my neighborhood community"), Entrepreneurial ("I can earn money from lending") |
| **Pain Points** | Lending flow undocumented, dispute resolution missing, Pro analytics not built, trust progression invisible |
| **Opportunities** | Trust progress dashboard, lending analytics, Pro business dashboard, community moderation tools, "Neighborhood Hero" recognition |

### Power User Features Needed
- Bulk post management
- Lending calendar view
- Revenue/analytics dashboard (Pro)
- Moderation queue (trusted users)
- Event series management

---

## Phase 7: Advocacy

| Layer | Detail |
|-------|--------|
| **User Actions** | Invite neighbors, share posts externally, recommend to friends, write App Store reviews, participate in feedback |
| **Touchpoints** | Invite flow, share cards (WhatsApp/Instagram), App Store review prompt, feedback forms |
| **Channels** | WhatsApp (sharing), Instagram stories, word of mouth, App Store |
| **Emotions** | Evangelism ("You should try this"), Pride ("My neighborhood is active on TackBird"), Community identity ("I'm a TackBird neighborhood hero") |
| **Pain Points** | No deep linking makes sharing broken. No shareable cards for social media. No NPS survey to capture advocates. |
| **Opportunities** | Beautiful share cards with Open Graph preview, "Impact summary" ("You shared 12 items this month"), invite leaderboard, neighborhood ambassador program |

### Viral Loop
```
User shares post via WhatsApp → Friend sees preview → Downloads app → Joins neighborhood → Shares own post
```

**Current blocker:** No deep linking. Shared links don't open in-app or show content preview.

---

## Cross-Phase Touchpoint Matrix

| Touchpoint | Awareness | Evaluation | Onboarding | First Value | Regular | Advanced | Advocacy |
|-----------|-----------|------------|------------|-------------|---------|----------|----------|
| Mobile app | | | Primary | Primary | Primary | Primary | |
| Push notifications | | | | Important | Critical | Important | |
| Email | | | Welcome | | Digest | Receipts | |
| WhatsApp/SMS | Invite link | | | | | | Share |
| App Store | | Primary | | | | | Reviews |
| Website | | Secondary | | | | | |
| In-person | Word of mouth | | | Pickup/return | Events | | Recommendation |

---

## Ecosystem Relationships

```
┌─────────────────────────────────────────────────────┐
│                    TackBird App                      │
│  ┌──────┐  ┌────────┐  ┌────────┐  ┌────────┐     │
│  │ Feed │←→│Messages│←→│ Events │←→│Profile │     │
│  └──┬───┘  └───┬────┘  └───┬────┘  └───┬────┘     │
│     │          │            │            │           │
│     └──────────┴────────────┴────────────┘           │
│                       ↕                              │
│              ┌────────────────┐                      │
│              │ Supabase       │                      │
│              │ (DB + Auth +   │                      │
│              │  Edge Functions│                      │
│              │  + Storage)    │                      │
│              └───────┬────────┘                      │
│                      ↕                               │
│              ┌────────────────┐                      │
│              │ Stripe         │                      │
│              │ (Payments +    │                      │
│              │  Connect)      │                      │
│              └────────────────┘                      │
└─────────────────────────────────────────────────────┘
            ↕               ↕              ↕
    ┌──────────────┐ ┌────────────┐ ┌────────────┐
    │ Push (Expo)  │ │ Email      │ │ WhatsApp   │
    │ Notifications│ │ (Resend)   │ │ (Sharing)  │
    └──────────────┘ └────────────┘ └────────────┘
```

### Data Flow Between Touchpoints

| From | To | Data | Trigger |
|------|-----|------|---------|
| App → Supabase | User actions, posts, messages | Every user interaction |
| Supabase → Push | Notification payload | New message, event update, post match |
| Supabase → Email | Booking confirmation, digest | Transaction complete, weekly cron |
| App → Stripe | Payment intent | Lending booking |
| Stripe → Supabase | Payment confirmation | Webhook |
| App → WhatsApp | Share link + preview | User shares post/event |
| WhatsApp → App | Deep link with context | Invite click |

### Handoff Points (Human ↔ Automated)

| Handoff | Current | Ideal |
|---------|---------|-------|
| Post response → physical meetup | Manual message coordination | In-app scheduling + map directions |
| Lending → payment | Manual Stripe redirect | Seamless in-app checkout |
| Event discovery → attendance | Manual calendar entry | Auto-add to device calendar |
| Dispute → resolution | No system | Structured dispute flow with evidence |
| User report → moderation | No admin panel | Automated queue + human review |

---

## Experience Quality Score by Phase

| Phase | Current Score (1-5) | Key Blocker |
|-------|-------------------|-------------|
| Awareness | 1/5 | No marketing, no sharing, no presence |
| Evaluation | 2/5 | No App Store listing yet (Expo Go only) |
| Onboarding | 2/5 | No tutorial, no neighborhood guide |
| First Value | 3/5 | Good if content exists; fails on empty neighborhoods |
| Regular Use | 4/5 | Strong feature set, missing push notifications |
| Advanced Use | 3/5 | Lending needs Stripe activation, trust progress invisible |
| Advocacy | 1/5 | No deep linking, no share cards, no referral system |

### Biggest Gaps to Close (in priority order)

1. **Awareness → Evaluation** gap: Need App Store launch + sharing capabilities
2. **Onboarding** gap: Need tutorial + neighborhood seeding
3. **Regular Use → Advocacy** gap: Need deep linking + push notifications
4. **Advanced Use** gap: Need Stripe activation + trust dashboard

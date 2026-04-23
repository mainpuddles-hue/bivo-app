# TackBird — User Journey Maps

> Date: 2026-04-23 | Market: Helsinki, Finland
> Maps reference actual app screens from Expo Router structure

---

## Journey 1: First-Time User Onboarding

**Persona:** Alexei (international newcomer) — heard about TackBird from a Reddit thread

### Stages

| Stage | Awareness | Download & Register | First Browse | First Interaction | Integration |
|-------|-----------|-------------------|-------------|-------------------|-------------|
| **Duration** | Days-weeks | 5 minutes | 10-15 minutes | 1-3 hours | 1-4 weeks |
| **Screen** | — | `(auth)/login.tsx` | `(tabs)/index.tsx` | `post/[id].tsx` → `messages/[id].tsx` | Various |
| **Actions** | Sees Reddit post / friend's invite link | Opens app → Register with email → Set name + neighborhood + language | Scrolls feed → Filters by category → Taps on posts → Views map | Sends first message → Gets response → Arranges pickup | Posts first item → Attends event → Builds trust |
| **Thoughts** | "A neighborhood app for Helsinki? Let me try it" | "Simple signup. I can use English." | "There's actually stuff near me!" | "Will they respond? Will it be awkward?" | "People are friendly here. This actually works." |
| **Emotions** | Curious 😊 | Neutral → Hopeful 😊 | Excited → Evaluating 🤔 | Anxious → Relieved 😊 | Belonging → Committed 😊😊 |
| **Pain Points** | — | Google OAuth not working in Expo Go | Some posts are Finnish-only | Waiting for response (avg reply time?) | Building trust from zero takes time |
| **Opportunities** | Invite link deep linking | Onboarding wizard: interests, what you're looking for | Auto-translate feature, "Near you" highlight | First-message templates, response time badges | Onboarding checklist with gamification |

### Emotional Curve
```
😊😊  ·····················································★ Integration
😊    ★ Download    ····★ Find stuff   ····★ First pickup
🤔              ····                 ★ Waiting
😟
      ─────────────────────────────────────────────────────►
      Day 1          Day 2-3          Day 7         Day 30
```

### Moments of Truth
1. **First browse (30-second rule):** If the feed is empty or all items are far away, user churns immediately. **Cold start is critical.**
2. **First message response:** If the first message goes unanswered for >24h, user assumes the platform is dead.
3. **First physical meetup:** The actual handover moment — if it goes well, user is hooked. If awkward, user may not return.

---

## Journey 2: Creating and Sharing a Post

**Persona:** Liisa (neighborhood connector) — giving away an old bookshelf

### Stages

| Stage | Motivation | Create Post | Wait & Manage | Select & Coordinate | Complete |
|-------|-----------|------------|---------------|--------------------|-|
| **Duration** | Minutes | 3-5 minutes | 1-24 hours | 30 min - 2 hours | 10 minutes |
| **Screen** | Home | `(tabs)/create.tsx` | `notifications.tsx` + `(tabs)/messages.tsx` | `messages/[id].tsx` | `post/[id].tsx` |
| **Actions** | Looks at bookshelf → "Someone could use this" | Tab Create → Select "ilmaista" → Take photos → Write title/description → Set location → Publish | Gets notifications: "Uusi viesti postauksestasi" → Reads 8 messages → Evaluates profiles | Picks recipient → Sends address → Arranges pickup time | Marks as given away → Optionally reviews recipient |
| **Thoughts** | "This is still good, shame to throw it out" | "Creating is straightforward. Photos look decent." | "Wow, lots of interest! Who seems most reliable?" | "She responded fastest and lives closest. Her profile looks legit." | "Done! Felt good. Maybe I'll check if she left a review." |
| **Emotions** | Motivated 😊 | Focused → Satisfied 😊 | Surprised → Overwhelmed 😰 | Confident → Excited 😊 | Accomplished → Proud 😊😊 |
| **Pain Points** | — | Image upload can fail silently | Too many messages to manage; no way to batch-reply "taken" | Coordinating pickup time via messages is tedious | No prompted review flow; easy to forget |
| **Opportunities** | Suggested posting after decluttering (seasonal nudges) | AI-suggested title/description from photo | "This item is claimed" one-tap button that notifies all | Quick-schedule pickup time in chat | Post-exchange review prompt (push notification) |

### Friction Points
- **8 messages to manage:** No "claimed" or "pending" status to stop new messages
- **No scheduling:** Coordinating pickup happens entirely in free-text chat
- **Silent image upload failure:** New-listing.tsx had no error feedback (fixed in recent audit)

---

## Journey 3: Lending/Borrowing Flow

**Persona:** Liisa (borrower) borrows a drill from a neighbor

### Stages

| Stage | Search | Evaluate & Contact | Book & Pay | Pickup | Use & Return | Review |
|-------|--------|-------------------|-----------|--------|-------------|--------|
| **Duration** | 5-10 min | 10-30 min | 2-5 min | 15-30 min | 1-3 days | 2 min |
| **Screen** | `(tabs)/index.tsx` → `search.tsx` | `post/[id].tsx` → Trust badges | `post/[id].tsx` (book button) | In-person | — | `post/[id].tsx` |
| **Actions** | Search "porakone" → Filter lainaa → Sort by distance | View listing → Check lender's reviews + trust tier → Read deposit info → Send message | Select dates → Confirm daily fee + deposit → Stripe payment | Meet at agreed location → Inspect item → Handover | Use drill → Return on agreed date → Meet again | Both parties leave reviews → Trust scores update |
| **Thoughts** | "Someone must have one near me" | "Tier 3 lender, 4.8 stars, 50 reviews. I trust this." | "15€/day + 50€ deposit. Fair for 2 days." | "Normal person, drill looks fine. Quick handover." | "Got my hole drilled! Return tomorrow morning." | "Great experience, easy process." |
| **Emotions** | Hopeful 🤔 | Evaluating → Reassured 😊 | Slight anxiety (paying stranger) 😰→😊 | Nervous → Relieved 😊 | Satisfied 😊 | Accomplished 😊😊 |
| **Pain Points** | Basic search misses synonyms (porakone vs akkuporakone) | Trust system visible but takes time to evaluate | Stripe not yet activated (charges_enabled: false) | No in-app navigation to lender | Overdue penalties unclear in UI | Review prompt may not appear |
| **Opportunities** | Semantic search with Finnish synonyms | Quick trust summary: "Luotettu lainaaja ★4.8 (50)" | Insurance option add-on | Map directions to pickup point | Countdown timer + return reminder push | Prompted review 2h after return date |

### Critical Path Dependencies
```
Search → Item found? ─No──→ Saved search notification
                     ─Yes─→ Trust sufficient? ─No──→ Request more info
                                              ─Yes─→ Stripe active? ─No──→ ⚠️ BLOCKED
                                                                    ─Yes─→ Book → Pay → Pickup → Return → Review
```

**Current blocker:** Stripe activation pending (charges_enabled: false). Lending payments cannot process until Puddles Oy completes Stripe Dashboard onboarding.

---

## Journey 4: Community Event Lifecycle

**Persona:** Riitta (community elder) — organizes a weekly walking group

### Stages

| Stage | Idea | Create Event | Promote | Day-Of | Post-Event | Sustain |
|-------|------|-------------|---------|--------|-----------|---------|
| **Duration** | Days | 5-10 min | 3-7 days | 2-3 hours | Same evening | Weeks-months |
| **Screen** | — | `community-events.tsx` (create) | Feed + notifications | In-person + `event/[id].tsx` | `event/[id].tsx` chat | Recurring event |
| **Actions** | "I should organize walking groups" | Create event → Title, description, date, location, category → Set max participants → Publish | Share to forum → Gets likes → People join → She sees notifications | Meet at Töölönlahti → Walk together → Chat in event group chat | Thanks participants in chat → Some follow her | Creates next week's event → Regulars auto-notified |
| **Thoughts** | "People need more reasons to get outside and connect" | "Easy enough. I hope people actually come." | "7 people joined! That's more than I expected." | "What a lovely group. The weather helped!" | "I should do this every week." | "My Wednesdays have purpose now." |
| **Emotions** | Motivated → Slightly anxious 🤔 | Focused 😊 | Hopeful → Excited 😊😊 | Nervous → Joyful 😊😊😊 | Fulfilled → Planning 😊 | Deeply satisfied 😊😊😊 |
| **Pain Points** | No event template for recurring events | Can't duplicate/recur events — must recreate each week | No way to share event outside TackBird (no deep link) | No check-in system for actual attendance | Event chat disappears from easy access after event date | Manual re-creation weekly is tedious |
| **Opportunities** | Recurring event support | Event templates / "repeat last week's event" | Deep linking + share to WhatsApp/Instagram | QR check-in at event | Post-event "highlight" and photo gallery | Auto-create next occurrence |

### Event Funnel
```
Sees event in feed                    100 people
    ↓
Opens event detail                     30 (30% CTR)
    ↓
Joins / RSVPs                          12 (40% of openers)
    ↓
Actually attends                        8 (67% show rate)
    ↓
Engages in chat afterward               5 (63% of attendees)
    ↓
Follows organizer / joins next event    4 (50% retention)
```

---

## Journey 5: Trust Building Journey

**Persona:** Liisa — from new user to Tier 3 trusted member

### Stages

| Stage | New User (Tier 1) | Identity Verified | Active Contributor | Trusted (Tier 2) | Neighborhood Hero (Tier 3) |
|-------|-------------------|-------------------|-------------------|-------------------|---------------------------|
| **Duration** | Day 1 | Day 1-3 | Day 3-14 | Day 7+ | Day 30+ |
| **Requirements** | Email signup | ID verification | Post, respond, complete transactions | `idVerified + 7 days account age` | `3+ reviews, 4.0+ avg, 90%+ response, 30 days, no reports` |
| **Screen** | `(auth)/login.tsx` | `settings.tsx` → verify | Various | Profile auto-updates | Profile auto-updates |
| **Actions** | Register → Browse → First post | Go to settings → Start identity verification → Upload ID → Verified badge appears | Post items → Respond to messages → Complete 3+ exchanges → Get reviews | System auto-promotes to Tier 2 → Can offer paid services ≤200€ | System auto-promotes to Tier 3 → Unlimited pricing, priority in feed, trusted badge |
| **Visible Trust Signals** | Gray shield, name only | Blue shield + "Verified" badge | Review count + star rating visible | Blue trust badge, "Luotettu" label | Green trust badge, "Luotettu+" label, priority feed placement |
| **Permissions Unlocked** | Basic posting, lending ≤50€/day, messaging | Same + verified tag | Same + growing review history | Can offer paid services ≤200€ | Unlimited pricing, feed priority, trusted badge |
| **Emotions** | Cautious 🤔 | Reassured 😊 | Growing confidence 😊 | Validated 😊😊 | Pride → Advocacy 😊😊😊 |
| **Thoughts** | "Is this legit? Who are these people?" | "Good that they verify. Others probably are too." | "My reviews are growing. People know me now." | "Tier 2! I can offer my services now." | "I'm a recognized member of this community." |

### Trust Metrics Over Time
```
Trust Score
     │
 T3  │                                              ★────────
     │                                         ····
 T2  │                              ★─────····
     │                         ····
 T1  │ ★──────────────────····
     │
     └──────────────────────────────────────────────────────►
       Day 1    Day 7    Day 14    Day 21    Day 30    Day 60

       Events:
       ↑ Signup  ↑ Verified  ↑ 3 reviews  ↑ High response  ↑ Hero
```

### Pain Points in Trust Journey
1. **No progress indicator:** Users don't know what's needed for next tier
2. **Response rate is invisible:** Users don't know their rate or that it matters
3. **Tier promotion is silent:** No celebration when reaching Tier 2 or 3
4. **Review solicitation is passive:** No automated "please review" after transactions

### Opportunities
- **Trust progress dashboard** in profile: "You need 1 more review to reach Tier 3"
- **Tier promotion celebration:** Push notification + confetti + badge animation
- **Response rate widget:** Show "Your response rate: 92% (Great!)" in profile
- **Auto-review prompts:** 24h after exchange completion, push both parties to review

---

## Cross-Journey Pain Points Summary

| Pain Point | Affected Journeys | Severity | Current Status |
|-----------|-------------------|----------|---------------|
| Cold start (empty neighborhoods) | 1, 2, 4 | Critical | Needs seeding strategy |
| Stripe not activated | 3 | Critical | Pending Dashboard onboarding |
| No deep linking | 1, 4 | High | Not implemented |
| No push notifications | All | High | Needs expo-notifications + EAS |
| No recurring events | 4 | Medium | Manual re-creation |
| No post "claimed" status | 2 | Medium | Messages pile up |
| Trust progress invisible | 5 | Medium | No dashboard |
| No auto-translate | 1 (internationals) | Medium | Only manual language switch |
| Review prompts passive | 3, 5 | Medium | No triggered flow |
| Search quality basic | 3 | Medium | Semantic search exists but limited |

## Recommended Priority Fixes

1. **Push notifications** — affects every journey's re-engagement loop
2. **Stripe activation** — unblocks the entire lending/payment journey
3. **Deep linking** — enables sharing, invite links, notification taps
4. **Post status ("claimed/pending")** — reduces post-creation overwhelm
5. **Trust progress dashboard** — accelerates trust building, increases retention

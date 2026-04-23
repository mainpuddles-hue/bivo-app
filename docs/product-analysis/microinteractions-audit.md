# TackBird — Microinteractions Audit

> Framework: Dan Saffer's Microinteractions (Trigger → Rules → Feedback → Loops & Modes)
> Date: 2026-04-24 | Market: Helsinki, Finland
> Current Score: **6/10** — Good foundation with haptics, animations, and accessibility. Missing feedback in several key flows, no signature moments, no progressive loops. This document audits current state and designs improvements.

---

## Current Microinteractions Audit

### 1. Like Button (PostCard)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | Tap heart icon — visible, clear affordance | 8/10 |
| **Rules** | Toggle liked/unliked, increment/decrement count, optimistic update, prevent double-tap race condition (`likingRef`) | 9/10 |
| **Feedback** | Heart fills red + `Animated.sequence` scale pulse (1 → 1.3 → 1) + haptic `Light` | 8/10 |
| **Loops** | None — same animation every time | 5/10 |

**Verdict: 7.5/10 — Solid.** Already has haptics, animation, and optimistic updates. Missing: progressive loop (100th like could be quieter), and the animation could be a signature moment.

**Improvement:**
- Add `Haptics.notificationAsync(Success)` instead of `impactAsync(Light)` for the first like on a post — heavier feedback for meaningful action
- After 50+ uses, reduce animation to subtle color change only (progressive reduction)
- Consider confetti/particle burst for the user's first-ever like (onboarding signature moment)

---

### 2. Save/Bookmark Button (PostCard)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | Long-press context menu → "Save" option (iOS ActionSheet) | 6/10 |
| **Rules** | Toggle saved, Supabase sync, optimistic update with rollback | 8/10 |
| **Feedback** | Bookmark icon fills (`BookmarkCheck`) + haptic | 7/10 |
| **Loops** | None | 5/10 |

**Verdict: 6.5/10 — Functional but hidden.** Save is buried in long-press menu — low discoverability.

**Improvement:**
- Add visible save icon on card (alongside like) — don't hide behind long-press only
- Show brief "Tallennettu" toast feedback (1.5s auto-dismiss)
- Already done for PostCard (bookmark visible), but verify it's consistent across all card types

---

### 3. Pull-to-Refresh (Feed)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | Pull down gesture — standard platform convention | 9/10 |
| **Rules** | RefreshControl with `refreshing` state, calls `feed.refresh()` | 8/10 |
| **Feedback** | Native RefreshControl spinner + `tintColor` matches theme | 7/10 |
| **Loops** | None — same every time | 5/10 |

**Verdict: 7.0/10 — Standard but unremarkable.**

**Improvement:**
- Add "X uutta ilmoitusta" (X new posts) indicator BEFORE pulling — reward anticipation
- After refresh completes, brief haptic `Success` to confirm new content loaded
- If no new content: show "Kaikki ajan tasalla" message for 2s instead of silent spinner stop

---

### 4. Post Creation (Create Screen)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | Tab bar "+" icon — prominent, clear | 8/10 |
| **Rules** | 2-step flow: category → details. Image picker, tags, expiration, location | 7/10 |
| **Feedback** | Loading state on submit button, Toast on success | 6/10 |
| **Loops** | None | 4/10 |

**Verdict: 6.0/10 — Missing feedback at key moments.**

**Improvements:**
- Image upload: show per-image progress indicator (not just global spinner)
- Character counter on description field with visual threshold (turn amber at 80%, red at limit)
- Submit button: animate from "Julkaise" → spinner → checkmark (3-state transition)
- After successful post: celebratory haptic `Success` + brief "Julkaistu!" animation
- **Progressive loop:** After 3rd post, skip category selection step (default to most-used category)
- **Progressive loop:** After 10th post, auto-fill location from last post

---

### 5. Messaging (Conversation Screen)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | Text input + send button | 8/10 |
| **Rules** | Send message, optimistic insert, typing indicator, read receipts | 8/10 |
| **Feedback** | Message appears instantly (optimistic), typing dots for other user, read status icons | 7/10 |
| **Loops** | None | 5/10 |

**Verdict: 7.0/10 — Good real-time feedback, missing polish.**

**Improvements:**
- Send: haptic `Light` on send tap
- Message sent: subtle slide-up animation from input area to message position
- Read receipt: animate from single-check → double-check (not just swap icons)
- **Sound:** Optional send "swoosh" sound effect (respect silent mode)
- **Progressive loop:** Quick reply suggestions based on conversation context (after 5+ messages in thread)

---

### 6. Trust Score Progress (TrustProgress Component)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | System-initiated — appears in profile when trust score changes | 7/10 |
| **Rules** | Progress bar fills to percentage, tier name displayed | 7/10 |
| **Feedback** | Visual progress bar | 6/10 |
| **Loops** | None — shows current state statically | 4/10 |

**Verdict: 6.0/10 — Informational but not motivating.**

**Improvements:**
- **Tier promotion:** When user crosses a tier threshold → full-screen celebration moment (confetti + "Olet nyt Luotettu naapuri!" + haptic `Success`)
- Progress bar should animate when score changes (not just set to new value)
- Show "2 arvostelua seuraavaan tasoon" (2 reviews to next tier) — micro-goal setting
- **Progressive loop:** After reaching Tier 2, simplify the display (show tier badge, hide progress details)

---

### 7. Onboarding Overlay

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | System-initiated on first launch (AsyncStorage check) | 8/10 |
| **Rules** | Multi-step tutorial overlay, dismissible | 7/10 |
| **Feedback** | Step indicators, visual highlights | 7/10 |
| **Loops** | Closed loop — shows once, never again | 7/10 |

**Verdict: 7.0/10 — Good implementation.**

**Improvement:**
- Add "skip" at any step (not just the last one)
- Progressive re-trigger: if user hasn't posted after 3 days, show a gentler single-step reminder

---

### 8. Navigation (Tab Bar)

| Component | Current State | Score |
|-----------|--------------|-------|
| **Trigger** | Tab icons — standard bottom navigation | 8/10 |
| **Rules** | 5 tabs (home, events, create, messages, profile), active state highlighted | 8/10 |
| **Feedback** | Active icon color change + haptic `Light` on tab switch | 8/10 |
| **Loops** | None | 5/10 |

**Verdict: 7.5/10 — Clean, standard, lacks signature.**

**Improvements:**
- Unread badge on Messages tab — standard but critical for engagement
- Event badge when events happening "today" — time-sensitive relevance
- **Progressive loop:** If user never visits Events tab after 7 days, subtle pulse animation on the icon (one-time hint)

---

## Microinteraction Gap Matrix

| Interaction | Trigger | Rules | Feedback | Loops | Total | Priority |
|------------|---------|-------|----------|-------|-------|----------|
| Like button | 8 | 9 | 8 | 5 | 7.5 | Low (already good) |
| Save button | 6 | 8 | 7 | 5 | 6.5 | Medium |
| Pull-to-refresh | 9 | 8 | 7 | 5 | 7.0 | Medium |
| Post creation | 8 | 7 | 6 | 4 | 6.0 | **High** |
| Messaging | 8 | 8 | 7 | 5 | 7.0 | Medium |
| Trust progress | 7 | 7 | 6 | 4 | 6.0 | **High** |
| Onboarding | 8 | 7 | 7 | 7 | 7.0 | Low |
| Tab navigation | 8 | 8 | 8 | 5 | 7.5 | Medium |
| **Error states** | — | — | — | — | 3.0 | **Critical** |
| **Loading states** | — | — | — | — | 5.0 | **High** |
| **Empty states** | — | — | — | — | 4.0 | **High** |

---

## Critical Missing Microinteractions

### 1. Error Feedback (Score: 3/10)

**Problem:** Most errors are either silently caught (`.catch(() => {})`) or shown as generic alerts. No contextual error feedback near the source of failure.

**Design:**
| Scenario | Current | Target |
|----------|---------|--------|
| Network failure during post | Silent fail | Shake animation on submit button + red border + "Ei yhteyttä — yritä uudelleen" |
| Image upload failure | Silent | Red overlay on failed image thumbnail + retry icon |
| Message send failure | Silent | Red exclamation icon on message + "Yritä uudelleen" tap target |
| Login failure | Alert dialog | Shake animation on form + inline error below field |

### 2. Empty States (Score: 4/10)

**Problem:** Empty feeds/lists show basic text. No personality, no guidance, no action prompt.

**Design signature moments for empty states:**
| Screen | Current | Target |
|--------|---------|--------|
| Feed (no posts) | "Ei ilmoituksia" text | BoardIllustration + "Ole ensimmäinen — lisää ilmoitus!" + animated CTA button |
| Messages (no conversations) | Empty list | Friendly illustration + "Aloita keskustelu naapurin kanssa" |
| Search (no results) | "Ei tuloksia" | "Ei löytynyt — kokeile eri hakusanaa" + suggestion chips |
| Events (no events) | Empty list | Calendar illustration + "Järjestä ensimmäinen tapahtuma!" |

### 3. Loading States (Score: 5/10)

**Problem:** Skeleton loaders exist (`PostCardSkeleton`) but loading transitions are abrupt.

**Design:**
- Skeleton → content transition should crossfade (150ms), not snap
- Long loads (>3s) should show progress indication
- Image loading: blur-up from thumbnail placeholder → full image

---

## Signature Moments Design

### Signature Moment 1: "Ensimmäinen Lainaus" (First Lending)

**When:** User completes their first lending transaction (either as lender or borrower).

**Design:**
```
Trigger: lending_completed event (first time)
Rules: Full-screen overlay, auto-dismiss after 5s
Feedback:
  1. Haptic: notificationAsync(Success) — strong
  2. Visual: Animated confetti burst (react-native-reanimated)
  3. Text: "Onneksi olkoon! Ensimmäinen lainauksesi onnistui!"
  4. Subtext: "Säästit [X]€ lainaamalla naapurilta"
  5. CTA: "Jätä arvostelu" / "Sulje"
Loops: Only fires once per user (AsyncStorage flag)
```

**Why this is a signature moment:** Lending is TackBird's unique differentiator. Celebrating the first successful lending creates emotional anchoring to the platform's core value prop.

### Signature Moment 2: "Luotettu Naapuri" (Trusted Neighbor Tier-Up)

**When:** User's trust score crosses a tier boundary (Basic → Verified → Trusted).

**Design:**
```
Trigger: trust_tier_changed event
Rules: Full-screen celebration, requires manual dismiss
Feedback:
  1. Haptic: notificationAsync(Success) — heavy
  2. Visual: Trust badge animates from old to new tier (scale + glow)
  3. Sound: Subtle chime (optional, respect silent mode)
  4. Text: "Olet nyt [Tier Name]!"
  5. Subtext: what the new tier unlocks
  6. CTA: "Katso profiilisi"
Loops: Fires once per tier transition (3 possible times total)
```

### Signature Moment 3: "Naapurusto Tervehtii" (Neighborhood Greets)

**When:** User joins a neighborhood for the first time.

**Design:**
```
Trigger: neighborhood_joined event (first time in this neighborhood)
Rules: Welcome card in feed, auto-positioned as first item
Feedback:
  1. Animated map pin drop on neighborhood
  2. "Tervetuloa [Neighborhood]! Täällä on [X] naapuria."
  3. Quick stats: "Tällä viikolla: [N] ilmoitusta, [M] tapahtumaa"
  4. CTA: "Tutustu naapurustoon"
Loops: Once per neighborhood (users might move)
```

---

## Implementation Priority

### Sprint 1: Critical Feedback (effort: ~3 days)

| Item | Impact | Effort |
|------|--------|--------|
| Error shake + inline messages for post creation | High — prevents silent failures | Low |
| "X uutta" badge on feed tab after new content | High — reward anticipation | Low |
| Unread badge on Messages tab | High — standard expectation | Low |
| Submit button 3-state (text → spinner → check) | Medium — completion feedback | Low |

### Sprint 2: Signature Moments (effort: ~5 days)

| Item | Impact | Effort |
|------|--------|--------|
| First lending celebration | Very High — emotional anchoring | Medium |
| Trust tier-up celebration | High — motivational loop | Medium |
| Neighborhood welcome card | Medium — first-time experience | Low |
| Empty state illustrations + CTAs | Medium — reduces bounce | Medium |

### Sprint 3: Progressive Loops (effort: ~3 days)

| Item | Impact | Effort |
|------|--------|--------|
| Auto-fill category after 3+ posts | Medium — reduces friction | Low |
| Reduce like animation after 50 uses | Low — subtle polish | Low |
| Progressive onboarding re-trigger | Medium — re-engagement | Low |
| Tab icon pulse hint for unused features | Low — discoverability | Low |

---

## Updated Score: 7/10 (after implementing Sprint 1+2)

The foundation is solid — haptics, accessibility labels, optimistic updates, and animated feedback are already in place. The biggest gaps are error feedback (silent failures), signature moments (no emotional anchoring), and progressive loops (same experience on day 1 and day 100). Fixing error feedback alone would move the score from 6 to 7; adding signature moments brings it to 8.

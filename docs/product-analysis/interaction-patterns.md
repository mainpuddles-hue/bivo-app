# TackBird — Interaction Patterns & Micro-Interactions

> Frameworks: wondelai/micro-interaction-spec + wondelai/feedback-patterns + wondelai/loading-states + wondelai/error-handling-ux
> Date: 2026-04-23

---

## 1. Loading State Patterns

### Pattern Inventory (Current)

| Screen | Current Loading | Assessment | Recommended |
|--------|----------------|-----------|-------------|
| Feed | `PostCardSkeleton` shimmer | Good | Keep — matches layout |
| Feed load-more | `FeedLoadMoreSkeleton` | Good | Keep |
| Post detail | Full-screen `ActivityIndicator` | Poor — blank screen flash | Use skeleton matching post layout |
| Messages list | `ActivityIndicator` centered | Poor | Skeleton: avatar + name + preview line |
| Message thread | `ActivityIndicator` | Poor | Skeleton: message bubble shapes |
| Events | `ActivityIndicator` | Poor | Skeleton: event card shapes |
| Profile | `ActivityIndicator` | Poor | Skeleton: avatar + stats + post grid |
| Search results | `ActivityIndicator` | OK for search | Keep — results are unknown layout |
| Image upload | Nothing (silent) | Bad | Progress bar per image |
| Stripe checkout | External redirect | OK | Add brief "Siirrytään maksuun..." screen |

### Recommended Skeleton Components to Build

```
SkeletonPostDetail      — Hero image + title + user + description blocks
SkeletonMessageList     — 6 rows: circle (avatar) + 2 lines
SkeletonEventCard       — Image + title + date + location blocks
SkeletonProfileHeader   — Large circle + name + bio + stats row
```

### Duration Guidelines

| Duration | Loading Type | Implementation |
|----------|-------------|---------------|
| < 100ms | No indicator | Just render |
| 100ms - 1s | Skeleton or subtle opacity transition | Delay skeleton by 100ms to avoid flash |
| 1s - 5s | Skeleton with shimmer animation | Standard case for Supabase queries |
| 5s - 15s | Skeleton + text "Ladataan..." | Slow network indicator |
| > 15s | Progress with cancel option | Only for uploads/payments |

### Optimistic UI Candidates

| Action | Current Behavior | Optimistic Approach |
|--------|-----------------|-------------------|
| Like post | Wait for server → update UI | Show liked immediately → rollback if fails |
| Save post | Wait for server → show toast | Show saved immediately → rollback if fails |
| Send message | Wait for server → appear in thread | Show message immediately with "sending" indicator → confirm or show retry |
| Join event | Wait for server → update button | Show "Osallistut" immediately → rollback if fails |
| Mark notification read | Wait for server → update badge | Decrement badge immediately → reconcile |

---

## 2. Error Handling Patterns

### Error Hierarchy

```
Level 1: PREVENTION (best)
├── Inline form validation (email format, password strength)
├── Disabled buttons when form incomplete
├── Confirmation dialogs for destructive actions
└── Rate limit indicators before hitting limit

Level 2: INLINE RECOVERY (good)
├── Per-field error messages below input
├── Retry button on failed network requests
├── "Pull to retry" on failed list loads
└── Auto-retry with backoff for transient failures

Level 3: TOAST/BANNER (acceptable)
├── Success confirmations (brief, auto-dismiss)
├── Network status banner ("Ei verkkoyhteyttä")
└── Rate limit warnings

Level 4: FULL-SCREEN ERROR (last resort)
├── ScreenErrorBoundary for unrecoverable crashes
├── 404 for missing content
└── Maintenance mode
```

### Error Patterns by Context

#### Form Errors (Create Post, Register, Login)

```
┌─────────────────────────────────────────┐
│ Otsikko                                 │
│ ┌─────────────────────────────────────┐ │
│ │ [empty field with red border]       │ │
│ └─────────────────────────────────────┘ │
│ ⚠ Otsikko on pakollinen                │  ← inline, below field, red text
│                                         │
│ Kuvaus                                  │
│ ┌─────────────────────────────────────┐ │
│ │ [valid content]                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │     Julkaise ilmoitus               │ │  ← disabled if required fields empty
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Rules:**
- Validate on blur (not on each keystroke)
- Show error below the specific field
- Red border on invalid field
- Submit button disabled until all required fields valid
- On submit fail: scroll to first error, focus field

#### Network Errors (Feed, Messages, Events)

```
┌─────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← offline banner (persistent)
│ ⚠ Ei verkkoyhteyttä                     │
│                    [Yritä uudelleen]    │
│─────────────────────────────────────────│
│                                         │
│ [Cached content if available]           │
│                                         │
│ [or empty state with retry]             │
└─────────────────────────────────────────┘
```

**Rules:**
- Check NetInfo before showing generic error
- Show cached content if available + offline banner
- Auto-retry when connection restored
- Pull-to-refresh always available as manual retry

#### Payment Errors (Lending Booking)

```
┌─────────────────────────────────────────┐
│                                         │
│         ✕ Maksu epäonnistui             │
│                                         │
│  Korttisi hylättiin. Tarkista kortti-   │
│  tiedot tai kokeile toista korttia.     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │    Kokeile uudelleen            │    │  ← primary action
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │    Peruuta varaus               │    │  ← secondary action
│  └─────────────────────────────────┘    │
│                                         │
│  Varauksesi tietoja ei menetetä.        │  ← reassurance
└─────────────────────────────────────────┘
```

---

## 3. Micro-Interaction Specifications

### MI-1: Like / Heart Animation

| Property | Value |
|----------|-------|
| **Trigger** | Tap on heart icon |
| **Rules** | Toggle liked state. If liking: increment count. If unliking: decrement count. |
| **Visual Feedback** | Heart fills red (like) with scale 1.0 → 1.3 → 1.0 spring animation. Unlike: red → outline with quick fade. |
| **Haptic** | Light impact on like. None on unlike. |
| **Duration** | 250ms spring (damping: 0.6, stiffness: 150) |
| **Optimistic** | Yes — show immediately, rollback on error |
| **A11y** | accessibilityLabel: "Tykkää" / "Poista tykkäys", accessibilityRole: "button" |

### MI-2: Pull-to-Refresh

| Property | Value |
|----------|-------|
| **Trigger** | Pull down on feed/messages/events list |
| **Rules** | Threshold: 80px. Below threshold: elastic rubber-band. Above threshold: commit to refresh. |
| **Visual Feedback** | Custom RefreshControl with app color. Spinner appears at threshold. |
| **Haptic** | Medium impact when refresh commits (crosses threshold) |
| **Duration** | Spinner until data loads, then fade out 200ms |
| **A11y** | accessibilityLabel: "Vedä päivittääksesi" |

### MI-3: Quick Message Send

| Property | Value |
|----------|-------|
| **Trigger** | Tap "Lähetä pikaviesti" button on post detail |
| **Rules** | Send template message. Disable button during send. Show success toast. |
| **Visual Feedback** | Button → spinner (200ms) → checkmark icon (300ms) → "Viesti lähetetty!" toast |
| **Haptic** | Success notification on send complete |
| **Duration** | Button transition: 200ms. Toast: 3s auto-dismiss |
| **A11y** | accessibilityLabel: "Lähetä pikaviesti ilmoittajalle" |

### MI-4: Post Card Tap & Navigate

| Property | Value |
|----------|-------|
| **Trigger** | Tap on PostCard in feed |
| **Rules** | Navigate to post/[id]. Track view impression. |
| **Visual Feedback** | Card opacity 1.0 → 0.7 on press (80ms), restore on release. Navigation transition: slide from right (300ms). |
| **Haptic** | Light selection on press |
| **Duration** | Press: 80ms. Navigation: 300ms ease-out |
| **A11y** | accessibilityRole: "button", accessibilityLabel: "{title} — {category} — {location}" |

### MI-5: Trust Badge Tooltip

| Property | Value |
|----------|-------|
| **Trigger** | Tap on trust badge icon (shield) |
| **Rules** | Show tooltip popover explaining the trust tier. Dismiss on tap outside. |
| **Visual Feedback** | Badge scales 1.0 → 1.1. Tooltip fades in (200ms) below badge. |
| **Haptic** | None |
| **Duration** | Tooltip appear: 200ms. Auto-dismiss: 5s. |
| **Content** | Tier 1: "Uusi naapuri" / Tier 2: "Vahvistettu — henkilöllisyys tarkistettu" / Tier 3: "Luotettu naapuri — hyvät arvostelut ja aktiivinen" |
| **A11y** | accessibilityLabel includes tier explanation |

### MI-6: Event Join / Leave

| Property | Value |
|----------|-------|
| **Trigger** | Tap "Liity" / "Poistu" button on event card |
| **Rules** | Toggle participation. Update participant count. |
| **Visual Feedback** | Join: button fills green, count increments with "+1" floating animation. Leave: button returns to outline, count decrements. |
| **Haptic** | Success on join, light on leave |
| **Duration** | Button transition: 200ms. Count animation: 300ms |
| **Optimistic** | Yes — update immediately, rollback on error |

### MI-7: Image Gallery Swipe

| Property | Value |
|----------|-------|
| **Trigger** | Swipe left/right on post images |
| **Rules** | Navigate between images. Show dot indicators. Wrap around at ends. |
| **Visual Feedback** | Images slide horizontally following finger. Dots update. Edge bounce on first/last image. |
| **Haptic** | Light on each image transition |
| **Duration** | Snap: 250ms spring |
| **A11y** | "Kuva {current}/{total}" announcement on each swipe |

### MI-8: Notification Badge Bounce

| Property | Value |
|----------|-------|
| **Trigger** | New notification arrives while on other tab |
| **Rules** | Increment badge count. Animate badge. |
| **Visual Feedback** | Badge number updates. Badge container does quick scale bounce (1.0 → 1.3 → 1.0). |
| **Haptic** | None (would be intrusive for background event) |
| **Duration** | 400ms spring |

---

## 4. Feedback Pattern Inventory

### Current Feedback Assessment

| Action | Current Feedback | Quality | Recommended |
|--------|-----------------|---------|------------|
| Post created | Toast "Ilmoitus julkaistu" | Good | Add confetti/celebration animation |
| Message sent | Appears in thread | Good | Add "sent" checkmark like WhatsApp |
| Post liked | Heart fills, count updates | Good | Add scale animation + haptic |
| Post saved | Toast "Tallennettu" | Good | Keep |
| Event joined | Toast message | OK | Add participant count +1 animation |
| Post deleted | Alert confirmation → Toast | OK | Replace with undo toast pattern |
| Login success | Navigate to feed | Missing feedback | Add brief "Tervetuloa!" toast |
| Login fail | Alert with error | OK | Replace with inline error below form |
| Payment success | Navigate to confirmation | OK | Add success animation + details |
| Payment fail | Alert | Poor | Full-screen error with retry + details |
| Review submitted | Toast | OK | Add thank-you animation |
| Profile updated | Toast "Tallennettu" | Good | Keep |
| Report sent | Toast "Ilmianto lähetetty" | Good | Keep |

### Missing Feedback (Needs Adding)

| Action | Missing Feedback | Priority |
|--------|-----------------|----------|
| Trust tier promotion | No celebration/notification | High — this is a key moment |
| First post created | No special celebration | High — onboarding milestone |
| New review received | Only notification, no in-app moment | Medium |
| Streak milestone | Only Toast | Medium — could be richer |
| Booking confirmed | Only Toast | High — financial action needs clear confirmation |
| Overdue reminder | Only push (not yet) | High — needs prominent in-app warning |
| Weekly neighborhood summary | Nothing | Medium — engagement opportunity |

---

## 5. Haptic Feedback Map

| Interaction | Haptic Type | expo-haptics Method |
|-------------|-------------|-------------------|
| Button tap | Light | `Haptics.impactAsync(ImpactFeedbackStyle.Light)` |
| Like/save toggle | Light | `Haptics.impactAsync(ImpactFeedbackStyle.Light)` |
| Pull-to-refresh commit | Medium | `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` |
| Post published | Success | `Haptics.notificationAsync(NotificationFeedbackType.Success)` |
| Message sent | Success | `Haptics.notificationAsync(NotificationFeedbackType.Success)` |
| Payment confirmed | Success | `Haptics.notificationAsync(NotificationFeedbackType.Success)` |
| Error / failed action | Error | `Haptics.notificationAsync(NotificationFeedbackType.Error)` |
| Long press (context menu) | Heavy | `Haptics.impactAsync(ImpactFeedbackStyle.Heavy)` |
| Tab switch | Selection | `Haptics.selectionAsync()` |
| Slider/picker change | Selection | `Haptics.selectionAsync()` |
| Destructive action confirm | Warning | `Haptics.notificationAsync(NotificationFeedbackType.Warning)` |

### Rules
- Haptics are always opt-in (respect system settings)
- Never use haptics for passive events (receiving a notification while browsing)
- Use sparingly — too much haptic feedback becomes annoying
- Match intensity to action importance

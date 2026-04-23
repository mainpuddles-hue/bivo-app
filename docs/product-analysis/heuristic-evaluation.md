# TackBird — Heuristic Evaluation

> Framework: wondelai/heuristic-evaluation (Nielsen's 10 Heuristics)
> Date: 2026-04-23 | Evaluated: All major screens from codebase review
> Severity: 0=cosmetic, 1=minor, 2=minor usability, 3=major, 4=catastrophe (must fix before release)

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 4 (Catastrophe) | 3 | Must fix before Helsinki pilot |
| 3 (Major) | 8 | Important to fix, significant impact on usability |
| 2 (Minor) | 12 | Should fix, noticeable friction |
| 1 (Cosmetic) | 6 | Nice to fix, polish items |
| **Total** | **29** | |

---

## Issues by Heuristic

### H1: Visibility of System Status

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 1.1 | **No push notifications** — Users have no way to know about new messages, event updates, or post responses without opening the app | System-wide | **4** | Implement expo-notifications + EAS build. This is the #1 re-engagement blocker. |
| 1.2 | **No post status indicator** — After posting "ilmaista," no way to signal "claimed/pending" to stop incoming messages | `post/[id].tsx` | **3** | Add status badge (Aktiivinen/Varattu/Annettu) with one-tap toggle |
| 1.3 | **Online count shows but meaning is unclear** — "{count} naapurustossasi" in feed header — what does this number mean? Active now? Today? | `(tabs)/index.tsx` | **2** | Add tooltip or subtitle: "verkossa nyt" (online now) |
| 1.4 | **No typing indicator in messages** — Users don't know if the other person is composing a reply | `messages/[id].tsx` | **2** | Add Supabase presence-based typing indicator |
| 1.5 | **No upload progress for images** — When creating a post with images, no progress indicator during upload | `(tabs)/create.tsx` | **2** | Show upload progress bar per image |
| 1.6 | **Lending booking status unclear** — After booking, no clear lifecycle visualization (pending → confirmed → picked up → returned) | `post/[id].tsx` | **3** | Add visual booking timeline/stepper |

### H2: Match Between System and Real World

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 2.1 | **Category names are Finnish-only in code** — Types are 'tarvitsen', 'tarjoan', etc. but properly translated in UI | `types.ts` | **0** | Already handled via i18n — no issue |
| 2.2 | **Trust tier labels are abstract** — "Taso 1/2/3" doesn't communicate meaning | Profile displays | **2** | Use descriptive labels: "Uusi naapuri" / "Vahvistettu" / "Luotettu naapuri" |
| 2.3 | **"Nappaa" category missing from constants** — Listed in some places but not in CATEGORIES | `constants.ts` | **1** | Either add it or remove all references consistently |
| 2.4 | **Finnish date formatting inconsistent** — Some screens show "3 päivää sitten", others show ISO dates | Various | **2** | Ensure all dates use relative time from `time.*` translations |

### H3: User Control and Freedom

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 3.1 | **No undo for post deletion** — Delete is immediate with only an Alert confirmation | `post/[id].tsx` | **3** | Add undo toast (soft-delete with 10s window) or archive instead of delete |
| 3.2 | **Cannot unsend a message** — Once sent, no edit/delete/unsend | `messages/[id].tsx` | **2** | Add long-press → delete own message (within 5 min window) |
| 3.3 | **No draft saving for posts** — If you navigate away while creating a post, all input is lost | `(tabs)/create.tsx` | **3** | Auto-save draft to AsyncStorage, restore on return |
| 3.4 | **Event join is immediate, no confirmation** — Joining an event with max_participants has no "Are you sure?" | `community-events.tsx` | **1** | For events with limited spots, show brief confirmation |

### H4: Consistency and Standards

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 4.1 | **Tab bar icon for Create differs from pattern** — Plus icon in center tab, but it's a full screen not a modal | `(tabs)/_layout.tsx` | **1** | Consistent with many apps (Instagram pattern). Not a real issue. |
| 4.2 | **Back navigation inconsistent** — Some screens use router.back(), some use router.push('/') | Various | **2** | Standardize: always use router.back() unless the stack should be reset |
| 4.3 | **Toast vs Alert inconsistency** — Some success messages use Toast, others use Alert.alert | Various | **2** | Standardize: Toast for non-blocking confirmations, Alert only for destructive confirmations |

### H5: Error Prevention

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 5.1 | **No duplicate post detection** — Users can accidentally post the same item twice by double-tapping | `(tabs)/create.tsx` | **2** | Disable submit button during submission + debounce |
| 5.2 | **Lending deposit amount not validated** — No min/max enforcement in UI despite DEPOSIT_SUGGESTIONS | `post/[id].tsx` booking | **3** | Add inline validation with suggested range display |
| 5.3 | **Login lockout timer invisible** — After 5 failed attempts, account locks but no visible countdown | `(auth)/login.tsx` | **2** | Show remaining lockout time |

### H6: Recognition Rather Than Recall

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 6.1 | **No recent searches** — Search screen has no search history | `search.tsx` | **2** | Save last 5 searches to AsyncStorage, show as chips |
| 6.2 | **Category icons not shown in filter bar** — Only text labels, no icon visual aid | `FilterBar.tsx` | **1** | Add category icon next to label in filter chips |
| 6.3 | **Neighborhood picker requires manual entry** — No suggestions or auto-detect | `NeighborhoodPicker` | **2** | Use device location for neighborhood suggestion |

### H7: Flexibility and Efficiency of Use

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 7.1 | **No quick-reply from notification** — Must open full conversation to reply | Notifications | **3** | Add quick-reply action on notification toast (when push notifications exist) |
| 7.2 | **No keyboard shortcuts / pull gestures** — No swipe-to-archive in messages, no pull-to-refresh indicator text | Messages | **1** | Add swipe actions: archive left, mark-read right |

### H8: Aesthetic and Minimalist Design

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 8.1 | **Feed header has too many elements** — Neighborhood name, online count, filter bar, sort, view toggle, search | `(tabs)/index.tsx` | **2** | Collapse into progressive disclosure: basic header + expandable filters |
| 8.2 | **Post card information density** — Title, user, location, time, likes, comments, distance, category, trust badge, images | `PostCard.tsx` | **1** | Already well-balanced for the amount of info needed. Minor issue. |

### H9: Help Users Recognize, Diagnose, and Recover from Errors

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 9.1 | **Generic error messages** — Many catch blocks show "Virhe" or "Epäonnistui" without context | Various | **3** | Map Supabase error codes to specific Finnish messages in a shared error handler |
| 9.2 | **Network errors indistinguishable from other errors** — Same message for no internet and server errors | Various | **2** | Check navigator.onLine / NetInfo before showing error, differentiate messages |
| 9.3 | **Stripe payment errors not user-friendly** — Payment failures show technical messages | `post/[id].tsx` | **3** | Map Stripe error codes to Finnish: "Korttisi hylättiin" / "Yritä toista korttia" |

### H10: Help and Documentation

| # | Issue | Screen | Severity | Recommendation |
|---|-------|--------|----------|---------------|
| 10.1 | **No onboarding tutorial** — New users land directly on feed with no guidance | `(tabs)/index.tsx` | **4** | Add 3-step onboarding overlay: "Browse → Create → Message" |
| 10.2 | **No help/FAQ section** — Settings has no help link | `settings.tsx` | **2** | Add "Ohje ja tuki" section with FAQ and contact |
| 10.3 | **Trust system unexplained** — Users don't know what tiers mean or how to advance | Profile | **3** | Add "Miten luottamus toimii?" explainer accessible from trust badge |
| 10.4 | **Lending flow undocumented** — No explanation of deposits, fees, or return policy | `post/[id].tsx` | **3** | Add info button next to deposit: "Miten vakuusmaksu toimii?" with collapsible explanation |

---

## Top 10 Issues by Priority

| Rank | Issue | Severity | Effort | Impact |
|------|-------|----------|--------|--------|
| 1 | 1.1 Push notifications missing | 4 | High | Blocks all re-engagement |
| 2 | 10.1 No onboarding for new users | 4 | Medium | First-time experience broken |
| 3 | 1.2 No post status (claimed/pending) | 3 | Low | Overwhelms posters with messages |
| 4 | 3.3 No draft saving for posts | 3 | Low | Data loss frustration |
| 5 | 10.3 Trust system unexplained | 3 | Low | Core feature invisible |
| 6 | 10.4 Lending flow undocumented | 3 | Low | Reduces lending adoption |
| 7 | 9.1 Generic error messages | 3 | Medium | Poor error recovery |
| 8 | 9.3 Stripe errors not localized | 3 | Low | Payment abandonment |
| 9 | 5.2 Deposit validation missing | 3 | Low | Financial risk |
| 10 | 1.6 Booking lifecycle unclear | 3 | Medium | Lending trust undermined |

---

## Quick Wins (Low Effort, High Impact)

1. **Post status toggle** — Add "Varattu"/"Annettu" button to post detail (1 day)
2. **Trust explainer** — Add "?" icon next to trust badge linking to explanation (0.5 day)
3. **Lending info tooltips** — "Miten vakuusmaksu toimii?" collapsible section (0.5 day)
4. **Draft auto-save** — Save create form to AsyncStorage on navigation away (1 day)
5. **Recent searches** — Save/restore last 5 searches (0.5 day)
6. **Lockout timer display** — Show remaining minutes when login is locked (0.5 day)

# TackBird — Visual Bugs Audit (Refactoring UI Framework)

> Framework: Adam Wathan & Steve Schoger's Refactoring UI
> Date: 2026-04-24 | Scope: Full codebase scan
> Current Visual Quality: **7.5/10** — Design system well-defined, application inconsistent

---

## Quick Diagnostic (Blur Test)

| Question | Status | Action |
|----------|--------|--------|
| Does hierarchy read when squinting? | **Mostly yes** | Fix price vs. category weight in PostCard |
| Does it work in grayscale? | **Yes** | ✅ Helsinki Monochrome designed for this |
| Enough white space? | **Inconsistent** | 100+ spacing values off-scale |
| Labels de-emphasized vs values? | **Partially** | Settings screen labels too prominent |
| Consistent spacing scale? | **No — 100+ violations** | Many arbitrary values (5, 6, 7, 9, 10, 14, 18, 22) |
| Text width constrained? | **No** | Descriptions go full-width on larger screens |
| Sufficient contrast? | **Borderline** | nappaa/lainaa badges, dark mode audit pending |
| Touch targets ≥44pt? | **Mostly** | Toast close button undersized (24px) |

---

## 1. Hardcoded Colors (18 bugs)

Colors bypassing the theme system — will break in dark mode or create inconsistency.

### CRITICAL (Dark Mode Breaking)

| # | File | Line | Value | Issue | Fix |
|---|------|------|-------|-------|-----|
| C1 | `ImageGallery.tsx` | modal bg | `#000000` | Black bg identical in both modes | Use `colors.background` or `rgba(0,0,0,0.95)` |
| C2 | `post/[id].tsx` | pro badge | `#F59E0B` + `#F59E0B18` | Bypasses theme — should use `colors.pro` | Replace with `colors.pro` token |
| C3 | `DiscoveryStack.tsx` | 4 instances | `#FFFFFF` | Hardcoded white text, no dark mode adaptation | Use `colors.foreground` or `colors.primaryForeground` |

### HIGH (Theme Inconsistency)

| # | File | Value | Issue | Fix |
|---|------|-------|-------|-----|
| H1 | `PostCardGrid.tsx` | `#FFFFFF` | Hardcoded white in grid overlay | Use `colors.card` |
| H2 | `blocked.tsx` | `#FFFFFF` | White text hardcoded | Use `colors.foreground` |
| H3 | `map/EventCard.tsx` | Various hex | Hardcoded colors in map card | Use theme tokens |
| H4 | Multiple files | `'#000'` / `'#fff'` | Raw black/white instead of tokens | Use `colors.foreground` / `colors.card` |

### MEDIUM (Subtle Inconsistency)

| # | File | Value | Issue |
|---|------|-------|-------|
| M1 | `settings.tsx` | Various grays | Hardcoded gray values for decorative elements |
| M2 | `new-listing.tsx` | Inline hex | Badge/chip colors not from theme |
| M3 | `leaderboard.tsx` | Inline colors | Rank badge colors hardcoded |

**Total: 18 instances need refactoring, 8 are dark mode bugs**

---

## 2. Spacing Violations (100+ bugs)

Design system scale: **4 / 8 / 12 / 16 / 20 / 24 / 32 / 48**

### Off-Scale Padding (50+ violations)

| Value | Count | Files | Fix To |
|-------|-------|-------|--------|
| `5` | 4 | settings.tsx, new-listing.tsx, messages/[id].tsx | → 4 or 8 |
| `6` | 6 | new-listing.tsx (×4), messages/[id].tsx (×2) | → 4 or 8 |
| `7` | 2 | new-listing.tsx, search.tsx | → 8 |
| `9` | 3 | Various | → 8 |
| `10` | 8 | settings.tsx, new-listing.tsx, messages/[id].tsx | → 8 or 12 |
| `11` | 2 | new-listing.tsx | → 12 |
| `14` | 3 | Various | → 12 or 16 |
| `18` | 2 | Various | → 16 or 20 |
| `22` | 2 | post/[id].tsx, payouts.tsx | → 20 or 24 |

### Off-Scale Gap (19 violations)

| Value | Count | Files | Fix To |
|-------|-------|-------|--------|
| `3` | 2 | messages/[id].tsx | → 4 |
| `5` | 3 | new-listing.tsx, payouts.tsx | → 4 or 8 |
| `6` | 5 | new-listing.tsx (×4), EventCard.tsx | → 4 or 8 |
| `7` | 1 | search.tsx | → 8 |
| `10` | 4 | messages/[id].tsx (×3), new-listing.tsx | → 8 or 12 |

### Off-Scale Margin (19 violations)

| Value | Count | Files | Fix To |
|-------|-------|-------|--------|
| `5` | 2 | Various | → 4 or 8 |
| `6` | 2 | settings.tsx | → 4 or 8 |
| `10` | 4 | new-listing.tsx (×2), payouts.tsx (×2) | → 8 or 12 |
| `14` | 2 | settings.tsx | → 12 or 16 |
| `22` | 2 | payouts.tsx, post/[id].tsx | → 20 or 24 |

### Horizontal Padding Inconsistency

Found **8 different `paddingHorizontal` values** across screens:

| Value | Occurrences | Assessment |
|-------|------------|------------|
| **16** | 203 | ✅ Standard — keep |
| **20** | 38 | ⚠️ Standardize to 16 |
| **12** | 33 | ✅ OK for secondary use |
| **14** | 5 | ❌ Off-scale → 12 or 16 |
| **10** | 4 | ❌ Off-scale → 8 or 12 |
| **11** | 2 | ❌ Off-scale → 12 |
| **22** | 1 | ❌ Off-scale → 20 or 24 |
| **28** | 1 | ❌ Off-scale → 24 or 32 |

**Worst offending screens:** `new-listing.tsx`, `settings.tsx`, `messages/[id].tsx`, `payouts.tsx`

---

## 3. Typography Violations (20+ bugs)

Type scale: **11 / 12 / 13 / 14 / 15 / 16 / 17 / 20 / 24**

### Off-Scale Font Sizes

| Value | File:Line | Fix To | Severity |
|-------|-----------|--------|----------|
| `8` | `PostCardGrid.tsx:170` | → 11 (minimum readable) | **HIGH** |
| `18` | `settings.tsx:1639` | → 17 or 20 | **HIGH** |
| `10.5` | `settings.tsx:1424,1435`, `leaderboard.tsx:437` | → 11 | MEDIUM |
| `11.5` | `settings.tsx:1413`, `new-listing.tsx:1133` | → 11 or 12 | MEDIUM |
| `12.5` | `settings.tsx:1484,1498`, `messages/[id].tsx:1146` | → 12 or 13 | MEDIUM |
| `13.5` | `settings.tsx:1473,1519`, `messages/[id].tsx:1060,1126` | → 13 or 14 | MEDIUM |
| `14.5` | `settings.tsx:1344` | → 14 or 15 | MEDIUM |
| `15.5` | `settings.tsx:1407` | → 15 or 16 | MEDIUM |

### Line Height Issues

Scattered non-standard lineHeight values: 13, 15, 17, 19, 21, 23, 25, 30, 32

**Fix:** Align to consistent ratios:
- Headings (17-24px): lineHeight = fontSize × 1.2–1.3
- Body (13-16px): lineHeight = fontSize × 1.4–1.5

---

## 4. Touch Target & Interaction Bugs

### CRITICAL

| # | File | Issue | Impact |
|---|------|-------|--------|
| T1 | `Toast.tsx:199` | Close button 24×24px — **below 44pt minimum** | Users can't reliably close toasts |

### HIGH

| # | File | Issue | Impact |
|---|------|-------|--------|
| T2 | `EventCard.tsx` | Category label no `numberOfLines` — can overflow | Card layout breaks on long category names |
| T3 | `EventCard.tsx` | Badge row no `flexWrap` — dual badges overflow | Badges pushed off screen on narrow devices |

### MEDIUM

| # | File | Issue | Impact |
|---|------|-------|--------|
| T4 | `PollCard.tsx:147-167` | Option text pushes percentage off-screen | Long options hide vote percentage |
| T5 | `ImageGallery.tsx:148-160` | Close button positioned without safe area insets | Hidden under notch on iPhone 12+ |
| T6 | `TrustBadge.tsx:59` | Small badge (12px icon) with only hitSlop={8} | Difficult to tap on dense layouts |
| T7 | `StarRating.tsx:18-28` | 16px stars with 44px hit area — unclear affordance | Invisible tap zone confuses users |

---

## 5. Layout & Composition Bugs

### Missing Constraints

| # | File | Issue | Fix |
|---|------|-------|-----|
| L1 | Post detail description | Full-width text, no maxWidth | Add `maxWidth: 560` for readability |
| L2 | `Toast.tsx:130-132` | Hardcoded `bottom: insets.bottom + 88` | May overlap with tab bar on some devices |
| L3 | Multiple screens | `paddingHorizontal` inconsistency (8 values) | Standardize to 16px (primary), 12px (secondary) |

### Border Radius Inconsistency

Cards correctly use `borderRadius: 20` across EventCard, AdCard, PollCard, TrustBadge explainer. **No major issue here** — design system is consistent.

---

## Priority Fix Plan

### Phase 1: Critical (< 1 hour)

| # | Fix | Files |
|---|-----|-------|
| 1 | Toast close button → 44×44pt | `Toast.tsx` |
| 2 | EventCard category `numberOfLines={2}` + badge row `flexWrap` | `EventCard.tsx` |
| 3 | fontSize: 8 → 11 in PostCardGrid | `PostCardGrid.tsx` |
| 4 | ImageGallery close button safe area | `ImageGallery.tsx` |

### Phase 2: High Impact (2-3 hours)

| # | Fix | Files |
|---|-----|-------|
| 5 | Replace hardcoded `#000`/`#fff`/`#F59E0B` with theme tokens | 6 files |
| 6 | Fix all fractional font sizes (10.5, 12.5, 13.5, 14.5, 15.5) | `settings.tsx`, `messages/[id].tsx`, `new-listing.tsx` |
| 7 | Fix fontSize: 18 → 17 in settings deleteTitle | `settings.tsx` |
| 8 | PollCard option row flex constraints | `PollCard.tsx` |

### Phase 3: Spacing Normalization (3-4 hours)

| # | Fix | Files |
|---|-----|-------|
| 9 | Normalize all padding values to 4/8/12/16/20/24/32 scale | 10+ files |
| 10 | Normalize all gap values to scale | 8+ files |
| 11 | Normalize all margin values to scale | 6+ files |
| 12 | Standardize paddingHorizontal: 20 → 16 across screens | 38 occurrences |

### Phase 4: Polish (2 hours)

| # | Fix | Files |
|---|-----|-------|
| 13 | Line height standardization | All screens |
| 14 | TrustBadge hitSlop increase for small sizes | `TrustBadge.tsx` |
| 15 | Star rating visual affordance | `StarRating.tsx` |
| 16 | Description maxWidth: 560 on detail views | `post/[id].tsx` |

---

## Score Projection

| Phase | Before | After | Impact |
|-------|--------|-------|--------|
| Phase 1 | 7.5 | 8.0 | Critical UX bugs fixed |
| Phase 2 | 8.0 | 8.5 | Theme compliance, typography clean |
| Phase 3 | 8.5 | 9.0 | Spacing rhythm consistent |
| Phase 4 | 9.0 | 9.5 | Polish and readability |
| Dark mode audit | 9.5 | 10.0 | Full accessibility compliance |

---

## Files by Bug Density

| File | Bugs | Primary Issues |
|------|------|----------------|
| `settings.tsx` | 18+ | Fractional font sizes, off-scale padding/margin |
| `new-listing.tsx` | 15+ | Off-scale padding/gap/margin throughout |
| `messages/[id].tsx` | 10+ | Off-scale gap/padding, fractional font sizes |
| `EventCard.tsx` | 5 | Missing numberOfLines, badge overflow, gap values |
| `post/[id].tsx` | 4 | Hardcoded pro color, off-scale padding |
| `payouts.tsx` | 4 | Off-scale margin/gap values |
| `Toast.tsx` | 3 | Undersized close button, positioning |
| `PostCardGrid.tsx` | 2 | fontSize: 8, hardcoded white |
| `ImageGallery.tsx` | 2 | Hardcoded black, missing safe area |
| `PollCard.tsx` | 2 | Option overflow, alignment |

---

*Generated using Refactoring UI framework — systematic scan of all app/ and src/components/ files.*

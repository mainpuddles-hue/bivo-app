# TackBird — Visual Design Audit (Refactoring UI)

> Framework: Adam Wathan & Steve Schoger's Refactoring UI
> Date: 2026-04-24 | Market: Helsinki, Finland
> Current Score: **7/10** — Helsinki Monochrome v3 design system is well-defined. Some inconsistencies in application. Hierarchy, spacing, and color are generally strong. Depth and signature polish opportunities remain.

---

## 1. Visual Hierarchy Audit

### What's Working

| Element | Implementation | Score |
|---------|---------------|-------|
| **PostCard title** | 15px semibold, dark foreground — clear primary element | 8/10 |
| **PostCard metadata** | 12-13px, muted gray — properly de-emphasized | 8/10 |
| **Category badges** | Color-coded chips with icons — scannable | 9/10 |
| **Tab bar** | Active/inactive color distinction + icon + label | 8/10 |
| **Header** | Logo + neighborhood name + action icons — clear zones | 7/10 |
| **Button hierarchy** | Primary (filled), secondary (outlined) — clear | 7/10 |

### Issues to Fix

| Issue | Where | Fix |
|-------|-------|-----|
| **Price and category compete for attention** | PostCard | Price should be larger/bolder than category badge (it's the key decision factor for lainaa/tarjoan) |
| **Trust badge and distance text same visual weight** | PostCard | Trust badge is more important — make distance smaller/lighter |
| **Action icons (like, save, message) all same weight** | PostCard | Primary action (message) should be slightly more prominent |
| **Form labels compete with values** | Create screen | De-emphasize labels: smaller, uppercase, lighter color |
| **Event cards lack clear visual hierarchy** | Events tab | Event date should be the most prominent element (not title) |

### Recommendation: Three-Level Hierarchy System

```
Level 1 (Primary):   16-18px, semibold (600), foreground color
  → Post titles, prices, key metrics, CTAs

Level 2 (Secondary): 14px, medium (500), secondaryText color
  → Descriptions, event details, form values

Level 3 (Tertiary):  12-13px, regular (400), muted color
  → Metadata, timestamps, distances, labels
```

**Current state:** Mostly follows this but not consistently enforced. Some Level 2 elements rendered at Level 3 weight (event descriptions too faint) and some Level 3 elements too prominent (timestamp competing with title).

---

## 2. Spacing & Sizing Audit

### Current Spacing Scale (from Helsinki Monochrome v3)

```
4px  → icon-to-label coupling
8px  → within-component padding (chip, badge)
12px → related element gap (label-to-input)
16px → card internal padding
20px → section gap within card
24px → between cards in list
32px → between major page sections
48px → page-level header/footer separation
```

### What's Working

| Element | Spacing | Score |
|---------|---------|-------|
| **Card padding** | 16px uniform — consistent | 8/10 |
| **Feed list gap** | 12px between cards — comfortable density | 7/10 |
| **Tab bar** | Safe area respected, icons well-spaced | 8/10 |
| **Form fields** | 16px between fields — clear grouping | 7/10 |

### Issues to Fix

| Issue | Where | Fix |
|-------|-------|-----|
| **Cards feel dense on small screens** | PostCard on iPhone SE (375px) | Reduce internal padding from 16→12px on small screens, or reduce font size |
| **Section headers lack sufficient breathing room** | Feed filters vs. post list | Add 8px more space between FilterBar and first PostCard |
| **Comment input area cramped** | Post detail comments | Increase input area height to 48px min (touch target compliance) |
| **Profile stats too tightly packed** | Profile screen | Add 16px between stat groups (posts/reviews/followers) |
| **Horizontal padding inconsistent** | Some screens 16px, others 20px | Standardize to 16px horizontal padding across all screens |

### Text Width

**Current:** Post descriptions run full-width on tablet. No `maxWidth` constraint.

**Fix:** Add `maxWidth: 560` (approximately 65 characters at 16px) for description text blocks. Important for any future tablet/landscape support.

---

## 3. Typography Audit

### Current Type Scale (from fonts.ts)

| Usage | Size | Weight | Line Height | Score |
|-------|------|--------|-------------|-------|
| Screen titles | 24px | Bold (700) | ~1.2 | 8/10 |
| Card titles | 15px | SemiBold (600) | ~1.3 | 8/10 |
| Body text | 14px | Regular (400) | ~1.5 | 7/10 |
| Metadata | 12-13px | Regular-Medium | ~1.4 | 7/10 |
| Labels | 11-12px | Medium (500) | ~1.3 | 7/10 |

### Issues to Fix

| Issue | Fix |
|-------|-----|
| **Body text at 14px is slightly small for extended reading** | Use 15-16px for post descriptions (detail view) |
| **Bold used too frequently** | Reserve bold (700) for titles only. Use semibold (600) for emphasis |
| **No consistent heading scale** | Define: H1=24, H2=20, H3=17, Body=15, Caption=13, Tiny=11 |
| **Letter-spacing not controlled** | Add 0.5-1px letter-spacing on uppercase labels for readability |
| **Number alignment** | Prices and stats should use tabular figures (monospace numbers) for alignment |

### Font Strategy

**Current:** System fonts via `fonts.ts` constants.

**Recommendation:** System fonts are correct for React Native — they match platform conventions (SF Pro on iOS, Roboto on Android). No change needed. The key improvement is **consistent application** of the type scale, not the font choice.

---

## 4. Color Audit

### Current Palette (Helsinki Monochrome v3)

| Token | Light | Dark | Contrast on bg | Score |
|-------|-------|------|----------------|-------|
| primary | #2D6B5E | #6FCF97 | 5.1:1 on white ✅ | 8/10 |
| foreground | #1A1A1A | #E8E6E0 | 14:1 on #F5F5F5 ✅ | 9/10 |
| secondaryText | ~#666 | ~#999 | ~4.6:1 on bg ✅ (barely) | 7/10 |
| muted | #F0F0F0 | #1A1A1A | — | 7/10 |
| destructive | #D94F4F | #EF4444 | 4.5:1 ✅ | 7/10 |
| border | #E5E5E5 | #333333 | 1.8:1 (decorative, OK) | 7/10 |

### Category Colors

| Category | Color | Use | Score |
|----------|-------|-----|-------|
| tarvitsen | #C75B3A | Badge bg + text | 7/10 |
| tarjoan | #7C5CBF | Badge bg + text | 7/10 |
| ilmaista | #3B7DD8 | Badge bg + text | 8/10 |
| nappaa | #E8A050 | Badge bg + text | 6/10 — amber on white can be low contrast |
| lainaa | #C98B2E | Badge bg + text | 6/10 — gold on white risky |
| tapahtuma | #2B8A62 | Badge bg + text | 8/10 |

### Issues to Fix

| Issue | Fix |
|-------|-----|
| **nappaa and lainaa badges may fail 4.5:1 on white** | Darken nappaa to #D48B30 and lainaa to #B07A20 (or use colored text on light tinted bg instead) |
| **secondaryText barely passes contrast** | Darken to #555 in light mode for comfortable readability |
| **No saturated gray** | Current grays are pure. Add subtle warm tint (Kallio/wood warmth) for more life |
| **Pro badge color (amber) may clash with nappaa/lainaa** | Use distinct pro color — consider #7C5CBF (purple, premium) or keep #F59E0B but only on dark bg |
| **Dark mode not extensively tested** | Several components may have contrast issues in dark mode (borders invisible, text too faint) |

### Color Usage Principles

```
✅ Good:
- Category colors on their own bg (e.g., #C75B3A text on #FEF0EC background)
- Primary green for CTAs, links, active states
- Destructive red for delete/block actions only
- Gray scale for hierarchy (900 → 400 for text levels)

❌ Avoid:
- Category colors as background fills (too saturated, accessibility issue)
- Primary green for error states
- Pure black (#000) anywhere — use #1A1A1A
- Color as only differentiator — always pair with icon/text
```

---

## 5. Depth & Shadows Audit

### Current State

**Helsinki Monochrome v3 eliminated shadows** in favor of flat borders + background color shifts. This is intentional and consistent with the design system.

| Element | Current Depth | Score |
|---------|--------------|-------|
| PostCard | Border (#E5E5E5) + white bg on gray page bg | 7/10 |
| Modals | Overlay dimming + card bg | 7/10 |
| Tab bar | Top border separation | 7/10 |
| Header | Bottom border | 7/10 |
| Buttons | No shadow, color fill only | 7/10 |

### Assessment

The flat approach works well for TackBird's clean, content-first aesthetic. **Do not add shadows.** The design system correctly uses border + background contrast for depth.

### One Exception

**Floating elements** (toast notifications, bottom sheets, action sheets) should have subtle shadow for visual separation from scrollable content:

```
Toast/Sheet shadow: {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 4,  // Android
}
```

---

## 6. Images & Icons Audit

### Icons (Lucide React Native)

| Aspect | Current State | Score |
|--------|--------------|-------|
| **Consistency** | All Lucide — same stroke width, style | 9/10 |
| **Sizing** | 20-24px in cards, 24-28px in navigation | 8/10 |
| **Color** | Theme-aware (foreground/muted) | 8/10 |
| **Touch targets** | Most icons in Pressable with 44px+ area | 7/10 |

### Issues to Fix

| Issue | Fix |
|-------|-----|
| **Some icon buttons lack sufficient hitSlop** | Ensure ALL icon-only buttons have `hitSlop={8}` minimum |
| **Category icons in PostCard are tiny** | Increase from 12→14px in badge for better readability |
| **No fallback for missing user avatars** | Implement initials-based avatar (first letter of name, colored bg) |

### Images

| Aspect | Current State | Score |
|--------|--------------|-------|
| **expo-image** | ✅ Using optimized image component | 9/10 |
| **Aspect ratio** | PostCard images use 16:9 with `contentFit="cover"` | 8/10 |
| **Error handling** | Fallback icon when image fails to load | 7/10 |
| **Placeholder** | No blur-up or shimmer while loading | 5/10 |

**Fix:** Add `placeholder` prop to `<Image>` with blurhash or low-res thumbnail for progressive loading.

---

## 7. Layout & Composition Audit

### What's Working

| Element | Implementation | Score |
|---------|---------------|-------|
| **Feed layout** | Left-aligned cards, full-width on phone | 8/10 |
| **Card composition** | Image → content → actions (logical top-to-bottom flow) | 8/10 |
| **Form layout** | Stacked fields, clear grouping | 7/10 |
| **Safe area** | `useSafeAreaInsets()` respected on all screens | 8/10 |

### Issues to Fix

| Issue | Where | Fix |
|-------|-------|-----|
| **All cards identical height** | Feed | Consider hero card for first/featured post (larger image, more prominent) |
| **Tab content starts too close to header** | Several screens | Add 8-12px top margin after header on all tab screens |
| **Landscape mode untested** | All screens | Test and fix horizontal padding for landscape (increase gutters) |
| **Profile screen centered layout** | Profile tab | Left-align stats and bio for better readability |
| **Event card layout identical to post card** | Events tab | Differentiate: lead with date (large day number), then title. Events need time prominence |

---

## Quick Diagnostic Summary

| Question | Answer | Action |
|----------|--------|--------|
| Does hierarchy read when squinting? | **Mostly yes** — title/metadata distinction is clear | Strengthen price prominence on lending posts |
| Does it work in grayscale? | **Yes** — Helsinki Monochrome designed for this | ✅ No action |
| Enough white space? | **Almost** — some cards feel dense on small screens | Add 4px more breathing room in cards on <375px |
| Labels de-emphasized vs values? | **Partially** — form labels too prominent | De-emphasize: smaller, lighter, uppercase |
| Consistent spacing scale? | **Mostly** — a few arbitrary values exist | Audit all screens for 4/8/12/16/20/24/32 compliance |
| Text width constrained? | **No** — descriptions go full-width | Add maxWidth on detail view description text |
| Sufficient contrast? | **Mostly** — nappaa/lainaa badges borderline | Darken amber/gold category colors |
| Shadows appropriate? | **N/A** — intentionally flat design | ✅ Correct for design system |

---

## Priority Fixes

### Quick Wins (< 1 day each)

| # | Fix | Impact |
|---|-----|--------|
| 1 | Darken nappaa (#D48B30) and lainaa (#B07A20) badge colors for contrast | Accessibility |
| 2 | Add `hitSlop={8}` to all icon-only buttons | Touch accessibility |
| 3 | De-emphasize form labels (smaller, lighter, uppercase) | Visual hierarchy |
| 4 | Add letter-spacing (0.5px) to uppercase labels | Readability |
| 5 | Standardize horizontal padding to 16px across all screens | Consistency |

### Medium Effort (1-2 days)

| # | Fix | Impact |
|---|-----|--------|
| 6 | Implement initials-based avatar fallback | Visual polish |
| 7 | Add image placeholder/blurhash for progressive loading | Perceived performance |
| 8 | Differentiate event card layout (date-first design) | Content clarity |
| 9 | Add maxWidth on description text in detail views | Readability on larger devices |
| 10 | Audit dark mode contrast (all text/bg combinations) | Accessibility |

### Design System Enhancement (2-3 days)

| # | Fix | Impact |
|---|-----|--------|
| 11 | Formalize type scale: H1/H2/H3/Body/Caption/Tiny with line-heights | Consistency |
| 12 | Add warm tint to gray scale | Visual warmth |
| 13 | Create hero card variant for featured/promoted posts | Visual variety |
| 14 | Test on iPhone SE (375px) and adjust dense layouts | Small screen support |

---

## Updated Score: 8/10 (after implementing quick wins + medium fixes)

TackBird's visual design is already strong thanks to the Helsinki Monochrome v3 system. The flat, content-first approach is intentional and works well. The main improvements are about **consistency of application** (spacing, hierarchy, contrast) rather than fundamental design changes. The category color contrast issues and form label hierarchy are the most impactful quick fixes.

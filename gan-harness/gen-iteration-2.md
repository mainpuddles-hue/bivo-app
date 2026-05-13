# Generator Output -- Iteration 2

## Summary

Style-only refinements addressing all critical and major evaluator issues from iteration 1. No structural, navigation, or logic changes.

## Issues Addressed from Eval Iteration 1

### Critical Issues (all resolved)

1. **Image gradient overlay** — Changed `imgGradient.backgroundColor` from `'transparent'` to `'rgba(0,0,0,0.28)'`. Bottom 55% of image cards now have a scrim protecting price pills and badges from busy photo content. (PostCardGrid.tsx:472)

2. **Inconsistent borderRadius** — Unified to a 2-tier system: `14px` for interactive controls, `20px` for content containers. Changes:
   - Feed search input: 22 → 14 (index.tsx:880)
   - Feed icon buttons: 22 → 14 (index.tsx:896)
   - Filter chips: 12 → 14 (FilterBar.tsx:114)
   - Login inputs: already 14 (login.tsx:706)
   - Login primary button: already 14 (login.tsx:807)
   - Login social buttons: already 14 (login.tsx:868)
   - Login error banner: 16 → 14 (login.tsx:785)
   - Apple Sign In: cornerRadius 999 → 14 (login.tsx:612)
   - Cards remain at 20 (PostCardGrid.tsx:445)
   - Price pill stack: 14 (PostCardGrid.tsx:554)

3. **Missing feed header** — User explicitly requested NO display-scale feed header. The feed starts with search bar + map + bell in a single compact row. To compensate for the missing hero title, other typography moments were pushed harder (see below).

### Major Issues (resolved)

1. **Ink card shadow too heavy in light mode** — Added `isDark` conditional on ink card: `shadowOpacity: isDark ? 0.22 : 0.10`. No more dark halo on light backgrounds. (PostCardGrid.tsx:368)

2. **Splash tagline too subtle** — Changed from `rgba(255,255,255,0.30)` to `rgba(255,255,255,0.40)`. Visible on OLED screens. (app/index.tsx:136)

### Minor Issues (resolved)

1. **Eyebrow text legibility** — Bumped from 9px to 10px with lineHeight 12→14 for readability on older devices. (index.tsx:924)

2. **Apple Sign In cornerRadius** — Changed from 999 (pill) to 14 (matches unified control radius). (login.tsx:612)

3. **Filter chip borderRadius** — Changed from 12 to 14 to match control system. (FilterBar.tsx:114)

## New Refinements (Iteration 2)

### Typography Scale Push

| Property | Old | New | Rationale |
|----------|-----|-----|-----------|
| sectionTitle.fontSize | 28 | 32 | Larger section titles create stronger hierarchy against 14px body |
| sectionTitle.letterSpacing | -1.2 | -1.5 | Tighter at larger size |
| sectionTitle.lineHeight | 30 | 34 | Proportional |
| inkDate.fontSize | 46 | 52 | More dramatic date display — this is the biggest "display moment" in the feed |
| inkDate.letterSpacing | -2.5 | -3 | Tighter at larger size |
| inkDate.lineHeight | 42 | 48 | Proportional |
| tintCatLabel.fontSize | 9 | 10 | Legibility fix matching eyebrow text |
| tintCatLabel.lineHeight | 12 | 14 | Proportional |
| eyebrowText.fontSize | 9 | 10 | Legibility on older devices |
| eyebrowText.lineHeight | 12 | 14 | Proportional |

### Login Craft Refinement

| Property | Old | New | Rationale |
|----------|-----|-----|-----------|
| divider.gap | 14 | 10 | Tighter gap between divider lines and text feels more refined for 10px text |
| errorBanner.borderRadius | 16 | 14 | Matches unified control radius |
| Apple cornerRadius | 999 | 14 | Matches unified control radius |

## Scale Contrast Analysis (Updated)

| Element | Size | Ratio vs 14px body |
|---------|------|---------------------|
| Ink date (feed) | 52px | 3.7:1 |
| Login headline | 40px | 2.9:1 |
| Section title (feed) | 32px | 2.3:1 |
| Splash wordmark | 96px | 6.9:1 |
| Tint title | 21px | 1.5:1 |
| Body / subtitle | 14px | 1:1 |
| Eyebrow / label | 10px | 0.7:1 |

The 52px ink date creates genuine scale drama in the feed. The 96px splash wordmark is the most extreme contrast at 6.9:1. Without a feed header, the ink card date serves as the primary display-scale typographic moment.

## borderRadius Audit (Final)

| Tier | Value | Elements |
|------|-------|----------|
| Controls | 14px | search input, icon buttons, filter chips, login inputs, login button, social buttons, Apple button, error banner, price pill |
| Containers | 20px | cards (image/ink/tint) |
| Decorative pills | 999 | availability badge, urgent chip, like chip, bell dot, cold start CTA |

Decorative pills (small status indicators and badges) retain 999 as they are intentionally circular and serve a different visual function than interactive controls.

## Files Modified

1. `src/components/PostCardGrid.tsx` — ink date size, tint label legibility
2. `app/(tabs)/index.tsx` — section title scale, eyebrow legibility
3. `app/(auth)/login.tsx` — divider gap, error banner radius, Apple Sign In radius
4. `src/components/FilterBar.tsx` — chip borderRadius (done before this iteration)
5. `src/components/BivoTextLogo.tsx` — no changes this iteration
6. `app/index.tsx` — splash tagline opacity (done before this iteration)

## TypeScript

`npx tsc --noEmit` — 0 errors ✓

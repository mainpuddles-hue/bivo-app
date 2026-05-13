# Generator Output -- Iteration 3

## Summary

iOS HIG compliance pass. All text raised to 11pt minimum, body text scaled up, display lineHeights fixed, accessibility labels enriched, dark mode gaps filled, touch targets improved. Style-only changes — no logic, navigation, or state changes.

## Issues Addressed from iOS HIG Audit

### HIGH Issues (all 6 resolved)

1. **Body text 14pt → 15pt** — Card title (`imgTitle`) raised from 14/18 to 15/20. Search placeholder raised from 14/20 to 15/21. `typeScale.body` updated from 14/20 to 15/21, `typeScale.bodyLarge` from 16/22 to 16/22 (unchanged, now labeled as HIG default).

2. **All sub-11pt text raised to 11pt minimum:**
   - `pricePillUnit`: 8 → 11 (PostCardGrid.tsx:577)
   - `availText`: 9 → 11 (PostCardGrid.tsx:617)
   - `urgentInlineText`: 9 → 11 (PostCardGrid.tsx:729)
   - `catChipText`: 10 → 11 (PostCardGrid.tsx:494)
   - `urgentChipText`: 10 → 11 (PostCardGrid.tsx:513)
   - `tintCatLabel`: 10 → 11 (PostCardGrid.tsx:716)
   - `inkDay`: 10 → 11 (PostCardGrid.tsx:659)
   - `eyebrowText`: 10 → 11 (index.tsx:924)
   - `sectionSub`: 10 → 11 (index.tsx:960)
   - `allLoadedText`: 10 → 11 (index.tsx:1045)
   - `sectionLabel`: 10 → 11 (login.tsx:695)
   - `dividerText`: 10 → 11 (login.tsx:847)
   - `miniAvatar fallback`: 9 → 11 (PostCardGrid.tsx inline)

3. **Display lineHeight = fontSize fixed:**
   - Login headline: 40/40 → 40/44 (login.tsx:675)
   - `typeScale.displayXL`: 44/44 → 44/50 (fonts.ts)
   - `typeScale.displayHero`: 64/62 → 64/70 (fonts.ts)

4. **Availability badge dark mode variant added:**
   - New `availBadgeDark` style: `backgroundColor: 'rgba(30,30,30,0.92)'` (PostCardGrid.tsx)
   - Applied conditionally: `isDark && styles.availBadgeDark`

5. **Filter chip height increased:**
   - `chip.height`: 34 → 38 (FilterBar.tsx:111)
   - Combined with hitSlop=8: effective touch target = 54pt (exceeds 44pt minimum)

6. **Card accessibility label enriched:**
   - Added price (`formatPrice`) to a11y label (PostCardGrid.tsx:113-114)
   - Added urgency status when `isUrgent` (PostCardGrid.tsx:115)
   - VoiceOver now announces: "category, title, price, urgent, author, location, time"

### MEDIUM Issues (resolved)

1. **Verified badge accessibility** — Added `accessibilityLabel` to ShieldCheck icon in MetaFooter (PostCardGrid.tsx:212)

2. **Bell notification accessibility** — Updated to include notification state in label: "Ilmoitukset, uusia ilmoituksia" (index.tsx:670)

3. **Sort button touch target** — Added `minHeight: 44` to `sortBtn` style (index.tsx:996)

4. **Like chip touch target improved** — Increased padding (9→10 horizontal, 5→6 vertical) and added `minHeight: 32` (PostCardGrid.tsx:520-526). Combined with hitSlop=8: effective touch target = 48x48pt.

### LOW Issues (resolved)

1. **Login padding standardized** — `scrollContent.paddingHorizontal`: 24 → 22 (login.tsx:662), matching feed's 22pt margins

2. **typeScale micro tier added** — New `micro: { fontSize: 11, lineHeight: 15 }` for absolute minimum text (fonts.ts)

## Type Scale (Updated)

| Tier | Old | New | Purpose |
|------|-----|-----|---------|
| micro | — | 11/15 | Badges, status indicators (new) |
| caption | 12/16 | 12/17 | Pills, captions |
| bodySmall | 13/18 | 13/18 | Compact body (unchanged) |
| body | 14/20 | 15/21 | Card titles, secondary body |
| bodyLarge | 16/22 | 16/22 | Default body (HIG: 17pt rec.) |
| displayXL | 44/44 | 44/50 | Dramatic display (lineHeight fixed) |
| displayHero | 64/62 | 64/70 | Hero moment (lineHeight fixed) |

## Files Modified

1. `src/lib/fonts.ts` — typeScale updates, micro tier, lineHeight fixes
2. `src/components/PostCardGrid.tsx` — 11pt minimum, a11y labels, dark mode, touch targets
3. `app/(tabs)/index.tsx` — 11pt minimum, sort target, bell a11y, search placeholder
4. `app/(auth)/login.tsx` — headline lineHeight, section label, divider text, padding
5. `src/components/FilterBar.tsx` — chip height 34→38

## TypeScript

`npx tsc --noEmit` — 0 errors

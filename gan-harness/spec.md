# Bivo App — Design Excellence Brief

## What
Push the Bivo React Native app (Expo SDK 54) to award-winning visual quality. The app is a hyperlocal neighborhood marketplace for Finland — feed, cards, login, splash, profiles, events.

## Current State (6.75/10)
- Typography: Bricolage Grotesque (display) + Instrument Sans (body) — good pairing, scale pushed to 34px feed header, 40px ink date, 96px splash wordmark
- Cards: Three variants (image/ink/tint) with spring press feedback and entry animations (fade + translateY)
- Color: Helsinki Monochrome — near-black (#0A0A0A), warm tints, category dot colors
- Motion: Card entry stagger, splash choreography, filter chip springs — but no scroll-driven effects
- Composition: Uniform padding, no grid-breaking moments, no scale surprises

## Constraint: STYLE ONLY
**DO NOT change any logic, data flow, navigation, API calls, or state management.** Only StyleSheet values, animation parameters, typography tokens, layout proportions, and color values may be modified.

## Target Screens (priority order)
1. **Feed** — `app/(tabs)/index.tsx` — primary surface, cards + header + search + filters
2. **PostCardGrid** — `src/components/PostCardGrid.tsx` — the 3-variant card system
3. **Splash** — `app/index.tsx` — first impression, brand moment
4. **Login** — `app/(auth)/login.tsx` — trust + brand
5. **FilterBar** — `src/components/FilterBar.tsx` — category chips
6. **BivoTextLogo** — `src/components/BivoTextLogo.tsx` — wordmark lockup

## Design Direction
Helsinki Monochrome v3 — ink + warm neutrals. References: Zipline, Birchmore, ref.digital, FCTRY Lab, sakazuki. The feel is: restrained luxury, intentional space, typographic confidence, quiet drama.

## What 8+/10 Looks Like
- Typography that makes you pause — dramatic scale jumps, tight display tracking, generous body spacing
- Cards that feel like objects — depth through shadow/radius/padding, not flat rectangles
- Motion that tells stories — staggered reveals, scroll-driven effects, spring physics everywhere
- Breathing room — sections separated by generous white space, not uniform gaps
- Details that reward attention — refined badges, precise pill proportions, considered dividers

## Tech Stack Constraints
- React Native StyleSheet.create only (no CSS, no NativeWind)
- Animated API (not Reanimated for these files)
- No new dependencies allowed
- Must respect `prefers-reduced-motion` via useReduceMotion hook
- All font families from `src/lib/fonts.ts` (Bricolage Grotesque + Instrument Sans)

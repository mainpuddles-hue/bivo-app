# Generator State -- Iteration 1

## What Was Built
- Card depth system: shadows on all card variants (softer on image, deeper on ink)
- Rounded rectangle design language: 16px radius on search bar, icon buttons, filter chips, login inputs, CTAs
- 4:5 image card aspect ratio (from square)
- Non-uniform spacing rhythm across feed sections
- Pushed all display typography tighter (negative tracking) and all labels wider (positive tracking)
- Refined splash choreography with more dramatic timing
- Bouncier spring physics on filter chips and card entry

## What Changed This Iteration
- Added: Shadow system to PostCardGrid base card, deeper shadows on ink variant
- Changed: All pill shapes (borderRadius 999) to rounded rectangles (borderRadius 16) across search, buttons, chips, login
- Pushed: Feed header 34px->38px, section titles 26px->28px, ink date 40px->46px, login headline 36px->40px
- Pushed: Ink card minHeight 260->280, padding 18->22, day letter-spacing 1.8->3
- Pushed: Card entry translateY 14->22, stagger 50ms->60ms, duration 350->420ms
- Pushed: Splash wordmark scale 0.92->0.88, dot delay 800->900ms, tagline delay 1400->1600ms
- Changed: Price pill amount 20px->22px, unit 9px->8px for more contrast
- Refined: Eyebrow text 10px->9px with 2.8 letter-spacing
- Refined: Footer line width 60%->40%, text 11px->10px with 1.6 tracking

## Known Issues
- Image gradient overlay is still transparent (RN limitation, would need LinearGradient package to fix)
- Apple Sign In button retains native borderRadius, cannot be 16px through style alone
- No scroll-driven animations (would require adding react-native-reanimated ScrollHandler, out of scope)

## Dev Server
- URL: http://localhost:8081 (Expo Metro)
- Status: not started (run `npx expo start`)
- Command: npx expo start

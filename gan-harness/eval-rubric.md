# Bivo Design Evaluation Rubric

## Scoring Categories

### Design Quality (weight: 0.35)
Rate 0-10 on visual sophistication, hierarchy, and intentionality.

| Score | Criteria |
|-------|----------|
| 0-3 | Generic template feel, default spacing, no hierarchy |
| 4-6 | Clean but forgettable, decent typography but no wow moments |
| 7-8 | Strong hierarchy, intentional spacing rhythm, premium feel |
| 9-10 | Would screenshot and share, gasping typography moments, atmosphere you can feel |

Checkpoints:
- Is there dramatic scale contrast between display and body text (10:1+ ratio)?
- Do cards feel like physical objects or flat rectangles?
- Is negative tracking used effectively on display type?
- Are section transitions paced with breathing room?
- Does the feed header command attention?

### Originality (weight: 0.30)
Rate 0-10 on creative distinction and memorable moments.

| Score | Criteria |
|-------|----------|
| 0-3 | Looks like any React Native app, could be a template |
| 4-6 | Some personality, decent brand expression |
| 7-8 | Distinctive card system, memorable typography moments, own visual language |
| 9-10 | Creative leaps — unexpected layouts, signature animations, colors that feel invented for this app |

Checkpoints:
- Does the three-variant card system (image/ink/tint) create genuine visual rhythm?
- Are there "signature moments" (splash reveal, card entry, price pill) that feel designed?
- Does the Helsinki Monochrome palette feel owned or generic monochrome?
- Would a designer recognize this app from a screenshot?

### Craft (weight: 0.25)
Rate 0-10 on micro-detail quality and polish.

| Score | Criteria |
|-------|----------|
| 0-3 | Default states, no hover/press feedback, inconsistent spacing |
| 4-6 | Basic press states, some animation, decent consistency |
| 7-8 | Spring physics on interactions, refined badges/pills/chips, consistent type scale |
| 9-10 | Every micro-detail considered — loading shimmers, entry stagger, press scale, divider weight |

Checkpoints:
- Do cards have spring-physics press feedback?
- Are entry animations staggered with appropriate delay?
- Is the price pill typography stack refined (amount + unit)?
- Are availability badges, category chips, and sort controls well-crafted?
- Does the "all caught up" footer feel designed, not default?
- Does the splash choreography build anticipation?

### Functionality (weight: 0.10)
Rate 0-10 that no existing functionality was broken.

| Score | Criteria |
|-------|----------|
| 0-5 | Logic changed, navigation broken, data flow altered |
| 6-8 | Style-only changes but some layout issues (overflow, truncation) |
| 9-10 | Pure style changes, all screens render correctly, no TS errors |

Checkpoints:
- Does `npx tsc --noEmit` pass with 0 errors?
- Are all changes limited to StyleSheet values, animation params, and layout props?
- No navigation, API, or state management code was touched?

## Pass Threshold
**Weighted score >= 7.5 to pass.**

Formula: `(Design × 0.35) + (Originality × 0.30) + (Craft × 0.25) + (Functionality × 0.10)`

## Evaluation Method
The evaluator should:
1. Read all modified files and compare style values
2. Run `npx tsc --noEmit` to verify no errors
3. Check the iOS simulator if available (Metro on port 8081)
4. Score each category with specific evidence
5. Provide 3-5 actionable improvements for the next iteration

# Bivo App — CLAUDE.md

## What This Is

Bivo is a hyperlocal neighborhood platform for Finland. It combines a marketplace, peer lending, community events, building management (taloyhtiö), messaging, and trust-based reputation — all scoped to your naapurusto. Built Finnish-first (fi/en/sv).

**This project:** `https://github.com/mainpuddles-hue/bivo-app` (Expo, private)
**Company:** Puddles Oy (Y-tunnus 3610705-3)

## Target Users

| Segment | Description |
|---------|-------------|
| **Beachhead** | Kallio renters, 25–40yo, kerrostalo, sustainability-oriented |
| **Residents** | Find/share/lend items, discover local events, connect with neighbors |
| **Providers** | Earn from idle tools/items, offer services, organize events |
| **Taloyhtiö** | Building management: announcements, maintenance requests, polls, chat |
| **Local businesses** | Pro listings, promoted posts, hyperlocal advertising |

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + Expo Router |
| Language | TypeScript (strict) |
| UI | React Native + StyleSheet.create + Lucide React Native |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| Auth | Supabase Auth + SecureStore (fallback AsyncStorage) |
| Images | expo-image + expo-image-picker |
| Navigation | Expo Router (file-based) |
| Animations | react-native-reanimated |
| i18n | Custom I18nProvider (fi/en/sv) |
| Typography | Bricolage Grotesque (display) + Inter (body) |
| Deploy | EAS Build (development/production) |
| Payments | Stripe (Connect + Checkout) — activation pending |

## Working Instructions

- **Älä kysy lupaa. Tee automaattisesti.** (Don't ask permission. Do it automatically.)
- Always run `npx tsc --noEmit` before committing
- Always push after commit: `git push`
- Remote: `https://github.com/mainpuddles-hue/bivo-app` (private)
- gh CLI: `~/.local/bin/gh`

## Tool Priority — Ruflo MCP First

**Ruflo MCP is the PRIMARY tool for all development work.** Use Ruflo agents for:
- **Coding tasks** → `mcp__ruflo__agent_spawn` with coding role
- **Task management** → `mcp__ruflo__task_create`, `mcp__ruflo__task_list`, `mcp__ruflo__task_update`
- **Code analysis** → `mcp__ruflo__analyze_diff`, `mcp__ruflo__analyze_file-risk`
- **Testing/QA** → `mcp__ruflo__browser_*` tools for UI testing
- **Coordination** → `mcp__ruflo__coordination_*` for multi-agent workflows
- **Memory** → `mcp__ruflo__memory_*` for persistent context

**DO NOT use Claude's built-in Agent tool.** Ruflo agents handle all parallel/background work.

**When to use other plugins instead of Ruflo:**
- `/code-review` or `/simplify` — quick code quality checks (built-in skills)
- `/commit` — git commits (built-in skill)
- `ui-ux-pro-max` — UI/UX design decisions, color palettes, typography, layout patterns
- `superpowers` — brainstorming, TDD workflow, git worktrees, subagent-driven development
- `everything-claude-code` — language-specific reviews, security scans, session management
- `obsidian-skills` — Obsidian vault/markdown file creation
- `claude-mem` — persistent memory across sessions (automatic, no manual use needed)
- Supabase MCP (`mcp__claude_ai_Supabase__*`) — direct database operations, migrations, Edge Functions
- Figma MCP (`mcp__claude_ai_Figma__*`) — reading designs from Figma files
- Playwright MCP (`mcp__playwright__*`) — browser automation when Ruflo browser tools are insufficient

**Decision flow:**
1. Can Ruflo do it? → Use Ruflo
2. Is it a specialized skill (UI design, code review, commit)? → Use the matching plugin/skill
3. Is it a direct service operation (Supabase SQL, Figma design)? → Use that service's MCP
4. Last resort → Use Claude's built-in tools directly

## Persistent Memory — ALWAYS USE

**Always use Obsidian (obsidian-vault MCP) or claude-mem for persistent context across sessions.**
- At session start: check claude-mem observations and Obsidian vault for relevant prior context
- During work: save significant discoveries, decisions, and task completions immediately
- Never rely only on conversation memory — it is lost at session boundaries

## Architecture

### Data Flow
```
Screen (app/*.tsx) → Supabase client query → useState → render
User mutations → Supabase client → insert/update/delete → re-fetch
Realtime → Supabase channels → postgres_changes → state update
```

### Supabase Client
Single client in `src/lib/supabase/client.ts` using `@supabase/supabase-js` with SecureStore (fallback AsyncStorage) for session persistence.

### Key Directories
```
app/                    — Expo Router screens (file-based routing)
  (tabs)/               — Tab bar: Feed, Explore, Create, Messages, Profile
  (auth)/               — Login/register
  building/             — Taloyhtiö management (announcements, maintenance, chat)
  post/[id].tsx         — Post detail (gallery, comments, booking, offers)
  event/[id].tsx        — Community event detail
  messages/[id].tsx     — Conversation thread
  booking/[id].tsx      — Booking lifecycle (pending → active → completed → review)
src/
  components/           — Shared components (PostCard, EmptyState, Avatar, FilterBar, etc.)
  hooks/                — Custom hooks (useFeedData, usePresence, useStripePayment, etc.)
  lib/                  — Utilities, types, constants, Supabase client
    i18n/               — Translations (fi.json, en.json, sv.json)
    supabase/           — Supabase client
    feedAlgorithm.ts    — Client-side feed ranking
    linkedevents.ts     — Helsinki LinkedEvents API integration
    ticketmaster.ts     — Ticketmaster events
    kide.ts             — Kide.app events
    meteli.ts           — Meteli.net events
```

## Screens (48 total)

### Tab Bar
| Screen | File | Description |
|--------|------|-------------|
| Feed | `app/(tabs)/index.tsx` | v3 Bricolage header, filters, carousel, ranked posts, realtime |
| Explore | `app/(tabs)/explore.tsx` | Map view + discovery, city events, nearby places |
| Create | `app/(tabs)/create.tsx` | Post creation (2-step, images, tags, expiration) |
| Messages | `app/(tabs)/messages.tsx` | Conversations, search, archive, online indicators |
| Profile | `app/(tabs)/profile.tsx` | User profile, listings, reviews, settings |

### Core Screens
| Screen | File |
|--------|------|
| Post detail | `app/post/[id].tsx` — gallery, like, save, comments, booking, offers |
| Conversation | `app/messages/[id].tsx` — images, typing, date separators, read receipts |
| Event detail | `app/event/[id].tsx` — attend, participants, event chat |
| Community events | `app/community-events.tsx` — create + browse events |
| Search | `app/search.tsx` — full-text search |
| Notifications | `app/notifications.tsx` — filter tabs, time groups |
| Settings | `app/settings.tsx` — language, theme, visibility, security, GDPR |
| Login | `app/(auth)/login.tsx` — login/register, Google placeholder |
| Onboarding | `app/onboarding.tsx` — address-based, purpose selection, building join |

### Taloyhtiö (Building Management)
| Screen | File |
|--------|------|
| Building hub | `app/building/[id].tsx` — announcements, maintenance, members, rules |
| Announcement | `app/building/announcement/[id].tsx` |
| Maintenance | `app/building/maintenance/[id].tsx` |
| Building chat | `app/building/chat/[id].tsx` |

### Commerce & Payments
| Screen | File |
|--------|------|
| Booking lifecycle | `app/booking/[id].tsx` — 6 states: pending → confirmed → active → completed → review → disputed |
| My listings | `app/my-listings.tsx` |
| Bookings list | `app/bookings.tsx` |
| New listing wizard | `app/new-listing.tsx` |
| Payment checkout | `app/payment-checkout.tsx` |
| Payment history | `app/payment-history.tsx` |
| Payment settings | `app/payment-settings.tsx` |
| Payouts | `app/payouts.tsx` |

### Other
| Screen | File |
|--------|------|
| Create event | `app/create-event.tsx` |
| Create poll | `app/create-poll.tsx` |
| Event chat | `app/event-chat/[id].tsx` |
| User profile | `app/profile/[userId].tsx` |
| Saved items | `app/saved.tsx` |
| Activities | `app/activities.tsx` |
| Verification | `app/verification.tsx` — phone, address, ID |
| OTP verify | `app/verify-otp.tsx` |
| Admin panel | `app/admin.tsx` — content flags, user management, stats |
| Blocked users | `app/blocked.tsx` |
| Return item | `app/return-item.tsx` |
| Review borrower | `app/review-borrower.tsx` |
| Invite code | `app/invite/[code].tsx` |
| About/Terms/Privacy/Help | `app/about.tsx`, `app/terms.tsx`, `app/privacy.tsx`, `app/help.tsx` |

## Edge Functions (31)

| Category | Functions |
|----------|-----------|
| **Auth** | auth-verify, send-otp, verify-otp-code, send-phone-otp, verify-phone-otp |
| **Payments** | stripe-checkout, stripe-webhook, stripe-connect-onboard, pro-subscribe, verify-boost-purchase, use-boost, grant-tier-boosts |
| **Content** | moderate-content, embed-post, semantic-search, semantic-match, price-suggestion |
| **Events** | kide-proxy, meteli-proxy, ticketmaster-proxy |
| **Notifications** | send-push, send-email, send-digest, match-saved-searches |
| **Admin** | admin-api, db-backup, ads-scheduler, check-overdue-rentals, validate-business |
| **User** | delete-account, verify-identity |
| **Health** | health-check |

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| LENDING | true | Peer lending (lainaa) category |
| LENDING_PAYMENTS | false | Deposit/fees for lending — hidden for pivot |
| PAYMENTS | false | Stripe payment flows |
| AD_CAMPAIGNS | false | Business ad system |
| BUSINESS_ACCOUNT | false | Pro business accounts |
| IDENTITY_VERIFICATION | false | ID verification flow |
| EVENTS_TAPAHTUMA_TYPE | true | Event post type |
| POLLS | true | Community polls |

## Design System — Helsinki Monochrome v3

| Token | Light | Dark |
|-------|-------|------|
| background | #F5F5F5 | #121212 |
| foreground | #1A1A1A | #E8E6E0 |
| card | #FFFFFF | #1E1E1E |
| border | #E5E5E5 | #333333 |
| primary | #2D6B5E | #6FCF97 |
| destructive | #D94F4F | #EF4444 |

Typography: Bricolage Grotesque (headings/display), Inter (body/UI)
Category colors: tarvitsen=#C75B3A, tarjoan=#7C5CBF, ilmaista=#3B7DD8, tapahtuma=#2B8A62, lainaa=#A97A1E

## Trust System

3-tier progressive trust:
- **Tier 1** (Basic) — email verified, can lend, max daily fee 50€
- **Tier 2** (Verified) — phone + address verified, paid services up to 200€
- **Tier 3** (Trusted) — ID verified, unlimited, priority in feed, trusted badge

## TypeScript Pattern for Supabase

Without generated types, use `as any` cast on mutations:
```ts
await (supabase.from('posts') as any).insert({ ... })
```

## UI Conventions

- **StyleSheet.create** for all styling (no NativeWind/Tailwind)
- **Lucide React Native** for icons
- **expo-image** for optimized image display
- **useTheme()** hook returns `{ colors, isDark }`
- **useI18n()** hook returns `{ t, locale, setLocale }`
- **PressableOpacity** for all interactive elements (not Pressable/TouchableOpacity)
- **ScreenErrorBoundary** wraps every screen
- **Toast** (non-blocking) instead of Alert.alert for non-destructive feedback

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
```

## Scripts

```bash
npx expo start              # Dev server
npx tsc --noEmit            # Type check
npx eas-cli build:list      # List EAS builds
```

## Product Analysis

Comprehensive analyses in `docs/product-analysis/`:
- JTBD analysis, user personas, journey maps, empathy maps
- Positioning canvas (Obviously Awesome), Crossing the Chasm strategy
- Hook model, microinteractions audit, visual audit
- Competitive analysis, metrics definition, opportunity framework
- Mom Test plan, UX writing audit, design principles

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bivo-app** (1859 symbols, 4845 relationships, 137 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/bivo-app/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bivo-app/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bivo-app/clusters` | All functional areas |
| `gitnexus://repo/bivo-app/processes` | All execution flows |
| `gitnexus://repo/bivo-app/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

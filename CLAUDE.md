# TackBird Mobile — CLAUDE.md

## What This Is

TackBird Mobile is the React Native (Expo) version of the TackBird neighborhood bulletin board app. It mirrors the web app's functionality for iOS and Android via Expo Go.

**Web version:** `https://github.com/mainpuddles-hue/tackbird-v2` (Next.js)
**This project:** `https://github.com/mainpuddles-hue/tackbird-mobile` (Expo)

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + Expo Router |
| Language | TypeScript (strict) |
| UI | React Native + StyleSheet.create + Lucide React Native |
| Backend | Supabase (shared with web — same project) |
| Auth | Supabase Auth + AsyncStorage |
| Images | expo-image + expo-image-picker |
| Navigation | Expo Router (file-based, like Next.js App Router) |
| Animations | react-native-reanimated |
| i18n | Custom I18nProvider (fi/en/sv) — same translations as web |
| Deploy | Expo Go (dev) / EAS Build (production) |

## Working Instructions

- **Älä kysy lupaa. Tee automaattisesti.** (Don't ask permission. Do it automatically.)
- Always run `npx tsc --noEmit` before committing
- Always push after commit: `git push`
- Remote: `https://github.com/mainpuddles-hue/tackbird-mobile` (private)
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
- `everything-claude-code` — language-specific reviews (flutter, kotlin, rust, etc.), security scans, session management
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

## Architecture

### Data Flow
```
Screen (app/*.tsx) → Supabase client query → useState → render
User mutations → Supabase client → insert/update/delete → re-fetch
```

### Supabase Client
Single client in `src/lib/supabase/client.ts` using `@supabase/supabase-js` with `AsyncStorage` for session persistence. Same Supabase project as web — **no separate backend needed**.

### Key Directories
```
app/                    — Expo Router screens (file-based routing)
  (tabs)/               — Tab navigator screens (feed, events, create, messages, profile)
  (auth)/               — Login/register
  post/[id].tsx         — Post detail
  messages/[id].tsx     — Conversation thread
  notifications.tsx     — Notifications
  settings.tsx          — Settings
  search.tsx            — Search
src/
  components/           — Shared components (Header, PostCard, FilterBar, etc.)
  hooks/                — Custom hooks (useTheme)
  lib/                  — Utilities, types, constants, Supabase client
    i18n/               — Translations (fi.json, en.json, sv.json)
    supabase/           — Supabase client
```

## Shared with Web App

These are **identical** between web and mobile:
- **Supabase project** — same database, RLS, storage buckets, auth
- **Types** (`src/lib/types.ts`) — same data models
- **Constants** (`src/lib/constants.ts`) — same categories, neighborhoods
- **Translations** (`src/lib/i18n/*.json`) — same fi/en/sv translations
- **Format utilities** (`src/lib/format.ts`) — same time/price formatting

## Theme — Helsinki Dusk

| Token | Light | Dark |
|-------|-------|------|
| primary | #2D6B5E | #6FCF97 |
| accent | #4CAF6A | #6FCF97 |
| background | #F5F5F5 | #121212 |
| foreground | #1A1A1A | #E8E6E0 |
| card | #FFFFFF | #1E1E1E |
| border | #E5E5E5 | #333333 |
| muted | #F0F0F0 | #1A1A1A |
| destructive | #D94F4F | #EF4444 |
| pro | #F59E0B | #FBBF24 |

Category colors: tarvitsen=#C75B3A, tarjoan=#7C5CBF, ilmaista=#3B7DD8, nappaa=#E8A050, lainaa=#C98B2E, tapahtuma=#2B8A62

## Screens

| Screen | File | Status |
|--------|------|--------|
| Feed (home) | `app/(tabs)/index.tsx` | Full — header, filters, carousel, posts, realtime |
| Events | `app/(tabs)/events.tsx` | Full — community + city tabs, attend, save |
| Create | `app/(tabs)/create.tsx` | Full — 2-step, images, tags, expiration |
| Messages | `app/(tabs)/messages.tsx` | Full — search, archive, online, read receipts |
| Profile | `app/(tabs)/profile.tsx` | Basic — needs tabs, reviews, followers |
| Login | `app/(auth)/login.tsx` | Full — login/register, Google placeholder, forgot pw |
| Post detail | `app/post/[id].tsx` | Full — gallery, like, save, comments, message |
| Conversation | `app/messages/[id].tsx` | Full — images, typing, date separators, read receipts |
| Notifications | `app/notifications.tsx` | Full — filter tabs, time groups, rich types |
| Settings | `app/settings.tsx` | Full — language, theme, visibility, notifications, security, GDPR |
| Search | `app/search.tsx` | Basic — text search |

## Supabase Tables Used

Same as web: `profiles`, `posts`, `post_images`, `events`, `event_attendees`, `city_events`, `conversations`, `messages`, `notifications`, `reviews`, `post_likes`, `post_comments`, `saved_posts`, `saved_events`, `user_follows`, `user_badges`, `notification_preferences`

## TypeScript Pattern for Supabase

Without generated types, use `as any` cast on mutations:
```ts
await (supabase.from('posts') as any).insert({ ... })
await (supabase.from('posts') as any).update({ ... }).eq('id', id)
```

Read queries work fine without casts.

## UI Conventions

- **StyleSheet.create** for all styling (no NativeWind/Tailwind)
- **Lucide React Native** for icons (same names as web)
- **expo-image** for optimized image display
- **expo-image-picker** for camera/gallery
- **useTheme()** hook returns `{ colors, isDark }`
- **useI18n()** hook returns `{ t, locale, setLocale }`
- Colors match web's Helsinki Dusk palette exactly

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
```

Same Supabase project as web. Copy values from web's `.env.local` (rename NEXT_PUBLIC_ → EXPO_PUBLIC_).

## Scripts

```bash
npx expo start              # Dev server (Expo Go)
npx expo start --web        # Web preview
npx tsc --noEmit            # Type check
npx expo export --platform ios   # iOS bundle
```

## Known Differences from Web

1. **No server components** — all data fetching is client-side via Supabase JS client
2. **No middleware** — auth checks happen in each screen
3. **No rate limiting** — client-side app, rate limiting is on the API/Supabase side
4. **No SSR/ISR** — everything is client-rendered
5. **Google OAuth** — requires EAS native build (placeholder in Expo Go)
6. **Maps** — not yet implemented (web uses Leaflet)
7. **Stripe** — not yet implemented (web handles payments)
8. **Push notifications** — not yet implemented (needs expo-notifications + EAS)

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **tackbird-mobile** (1859 symbols, 4845 relationships, 137 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
3. `READ gitnexus://repo/tackbird-mobile/process/{processName}` — trace the full execution flow step by step
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
| `gitnexus://repo/tackbird-mobile/context` | Codebase overview, check index freshness |
| `gitnexus://repo/tackbird-mobile/clusters` | All functional areas |
| `gitnexus://repo/tackbird-mobile/processes` | All execution flows |
| `gitnexus://repo/tackbird-mobile/process/{name}` | Step-by-step execution trace |

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

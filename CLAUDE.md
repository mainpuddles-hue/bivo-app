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
- **Käytä AINA Rufloa** — kaikki työ Ruflo MCP -agenteilla (task tracking, koordinointi, toteutus)
- Always run `npx tsc --noEmit` before committing
- Always push after commit: `git push`
- Remote: `https://github.com/mainpuddles-hue/tackbird-mobile` (private)
- gh CLI: `~/.local/bin/gh`

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

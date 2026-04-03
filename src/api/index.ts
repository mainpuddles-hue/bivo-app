/**
 * Centralized API layer for TackBird Mobile.
 *
 * Usage:
 *   import { posts, profiles, messages } from '@/api'
 *   const { posts, hasMore } = await posts.fetchPosts({ filter: 'tarjoan' })
 *
 * Benefits:
 * - All Supabase queries in one place
 * - Consistent error handling + retry
 * - Easy to add caching or mock for testing
 * - Schema changes require edits in only one file
 */
export * as posts from './posts'
export * as profiles from './profiles'
export * as messages from './messages'

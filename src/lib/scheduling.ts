import { InteractionManager } from 'react-native'

/**
 * Run a heavy operation after animations/transitions complete.
 * Prevents janky transitions when loading data or computing rankings.
 *
 * Usage:
 *   import { runAfterTransition } from '@/lib/scheduling'
 *   runAfterTransition(() => {
 *     // Heavy computation or data fetch
 *     rankFeed(posts)
 *   })
 */
export function runAfterTransition(fn: () => void): { cancel: () => void } {
  const handle = InteractionManager.runAfterInteractions(() => {
    fn()
  })
  return handle
}

/**
 * Run a heavy async operation after animations complete.
 * Returns a promise that resolves with the result.
 *
 * Usage:
 *   const posts = await runAfterTransitionAsync(() => fetchPosts())
 */
export function runAfterTransitionAsync<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    InteractionManager.runAfterInteractions(() => {
      fn().then(resolve).catch(reject)
    })
  })
}

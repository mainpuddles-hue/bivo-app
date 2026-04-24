import { Alert } from 'react-native'

type TFunction = (key: string, params?: Record<string, string | number>) => string

/**
 * Supabase mutation builder shape — accepts anything that resolves to the
 * standard `{ data, error }` envelope. We intentionally avoid importing
 * PostgrestError types so this file can be used in any screen/hook
 * without coupling to @supabase/supabase-js type internals.
 */
interface SupabaseMutationResult<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

/**
 * Await a Supabase mutation and alert the user if it fails.
 *
 * Supabase mutations (insert/update/delete/upsert) return `{ data, error }`
 * — they do NOT throw on RLS, schema or validation errors. A lot of legacy
 * code in this app used `try { await supabase.from(x).update(...) } catch`
 * which only catches network errors, so RLS failures silently left local
 * state diverged from the database.
 *
 * This helper centralizes the correct pattern:
 *   1. Await the mutation
 *   2. If `error` is set → show a localized alert and return null
 *   3. Otherwise return the data (may be null if no `.select()`)
 *
 * Usage:
 *   const result = await mutateWithErrorAlert(
 *     (supabase.from('profiles') as any).update({ name }).eq('id', uid),
 *     t,
 *     'profile.updateFailed',
 *   )
 *   if (result === null) return  // alert already shown
 *   setProfile(...)
 *
 * IMPORTANT: `null` here means "error occurred and alert was shown". If
 * the mutation succeeded but the builder did not include `.select()`, the
 * mutation still returns null as data — use `mutateOk` for success/fail
 * checks without data.
 */
export async function mutateWithErrorAlert<T = unknown>(
  mutation: PromiseLike<SupabaseMutationResult<T>>,
  t: TFunction,
  errorKey: string,
  opts?: { titleKey?: string; devTag?: string },
): Promise<T | null> {
  const { data, error } = await mutation
  if (error) {
    if (__DEV__ && opts?.devTag) {
      console.warn(`[${opts.devTag}] ${errorKey}:`, error.message)
    }
    Alert.alert(t(opts?.titleKey ?? 'common.error'), t(errorKey))
    return null
  }
  return data
}

/**
 * Same as `mutateWithErrorAlert` but returns `true` on success / `false`
 * on error. Useful for inserts/updates/deletes where the caller doesn't
 * need the returned row — just a success/failure signal.
 *
 * Usage:
 *   const ok = await mutateOk(
 *     (supabase.from('posts') as any).delete().eq('id', postId),
 *     t,
 *     'profile.postActionFailed',
 *   )
 *   if (!ok) return
 *   setPosts(prev => prev.filter(p => p.id !== postId))
 */
export async function mutateOk(
  mutation: PromiseLike<SupabaseMutationResult<unknown>>,
  t: TFunction,
  errorKey: string,
  opts?: { titleKey?: string; devTag?: string },
): Promise<boolean> {
  const { error } = await mutation
  if (error) {
    if (__DEV__ && opts?.devTag) {
      console.warn(`[${opts.devTag}] ${errorKey}:`, error.message)
    }
    Alert.alert(t(opts?.titleKey ?? 'common.error'), t(errorKey))
    return false
  }
  return true
}

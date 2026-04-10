declare const __DEV__: boolean

/**
 * Re-query a counter from the source of truth and sync it into a
 * parent row. Used wherever we maintain a denormalized count column
 * (e.g. `posts.comment_count`, `groups.member_count`, `forum_posts.
 * comment_count`) and want to avoid race conditions from computing the
 * new value off of stale local state.
 *
 * The Supabase client parameter is typed as `any` because the generated
 * Supabase query builder types are extremely deep and cause
 * "Type instantiation is excessively deep" errors when we try to
 * thread them through a generic helper. Since all callers already use
 * `as any` casts on their own Supabase calls, losing a bit more type
 * safety here is acceptable — the runtime behavior of `.select(...)`
 * and `.update(...)` is stable across all tables.
 *
 * Pattern this replaces:
 *
 *   // RACE-UNSAFE — two concurrent commenters both compute N+1 and
 *   // overwrite each other
 *   await supabase.from('posts').update({
 *     comment_count: post.comment_count + 1
 *   }).eq('id', postId)
 *
 *   // RACE-SAFE with this helper
 *   const count = await syncCounter(supabase, {
 *     sourceTable: 'post_comments',
 *     sourceFilter: ['post_id', postId],
 *     parentTable: 'posts',
 *     parentRowId: postId,
 *     counterColumn: 'comment_count',
 *   })
 *
 * Returns the new count on success, or null on any failure (the count
 * re-query is treated as best-effort: if it fails we return null and
 * the caller should fall back to an optimistic value).
 */
export async function syncCounter(
  supabase: any,
  opts: {
    /** Table where the individual rows live (e.g. `post_comments`) */
    sourceTable: string
    /** [column, value] filter to count rows belonging to the parent */
    sourceFilter: [string, string | number]
    /** Table where the denormalized count column lives (e.g. `posts`) */
    parentTable: string
    /** Primary key of the parent row whose counter is being updated */
    parentRowId: string | number
    /** Column on the parent row that holds the denormalized count */
    counterColumn: string
    /** Optional log tag for __DEV__ warnings */
    devTag?: string
  },
): Promise<number | null> {
  const { sourceTable, sourceFilter, parentTable, parentRowId, counterColumn, devTag } = opts

  // 1. Count live rows from source of truth
  const countResult = await supabase
    .from(sourceTable)
    .select('id', { count: 'exact', head: true })
    .eq(sourceFilter[0], sourceFilter[1])

  if (countResult.error) {
    if (__DEV__ && devTag) console.warn(`[${devTag}] count query failed:`, countResult.error)
    return null
  }

  const count = countResult.count ?? 0

  // 2. Write the true count into the parent row
  const updateResult = await supabase
    .from(parentTable)
    .update({ [counterColumn]: count })
    .eq('id', parentRowId)

  if (updateResult.error) {
    if (__DEV__ && devTag) console.warn(`[${devTag}] counter update failed:`, updateResult.error)
    // Still return the count — the caller can use it for local state
    // even if the DB write didn't land, and a later refresh will re-sync
  }

  return count
}

/**
 * Posts API — centralized data access for posts.
 * All Supabase queries for posts go through here.
 * Screens import from @/api/posts instead of calling supabase directly.
 *
 * Benefits:
 * - Single place to update queries when schema changes
 * - Consistent error handling and typing
 * - Easy to add caching, retry, or mock for testing
 */
import { createClient } from '@/lib/supabase/client'
import { withRetry, isRetryableError } from '@/lib/retry'
import { POST_SELECT } from '@/lib/constants'
import type { Post, PostType } from '@/lib/types'

const supabase = () => createClient()

export interface FetchPostsOptions {
  filter?: PostType | null
  neighborhood?: string | null
  limit?: number
  offset?: number
  userId?: string | null
  sortBy?: 'newest' | 'popular'
}

/** Fetch paginated posts with optional filters */
export async function fetchPosts(options: FetchPostsOptions = {}): Promise<{ posts: Post[]; hasMore: boolean }> {
  const { filter, neighborhood, limit = 20, offset = 0, sortBy = 'newest' } = options

  let query = supabase()
    .from('posts')
    .select(POST_SELECT)
    .eq('is_active', true)
    .order(sortBy === 'popular' ? 'like_count' : 'created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filter) query = query.eq('type', filter)
  if (neighborhood) query = query.or(`target_naapurusto.eq.${neighborhood},target_naapurusto.is.null`)

  const { data, error } = await query

  if (error) throw error
  const posts = (data ?? []) as unknown as Post[]
  return { posts, hasMore: posts.length >= limit }
}

/** Fetch single post by ID */
export async function fetchPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase()
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .single()

  if (error) return null
  return data as unknown as Post
}

/** Toggle like on a post — returns new like state */
export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
  if (currentlyLiked) {
    await (supabase().from('post_likes') as any).delete().eq('post_id', postId).eq('user_id', userId)
    return false
  } else {
    await (supabase().from('post_likes') as any).insert({ post_id: postId, user_id: userId })
    return true
  }
}

/** Toggle save on a post — returns new save state */
export async function toggleSave(postId: string, userId: string, currentlySaved: boolean): Promise<boolean> {
  if (currentlySaved) {
    await (supabase().from('saved_posts') as any).delete().eq('post_id', postId).eq('user_id', userId)
    return false
  } else {
    await (supabase().from('saved_posts') as any).insert({ post_id: postId, user_id: userId })
    return true
  }
}

/** Create a new comment on a post */
export async function createComment(postId: string, userId: string, content: string): Promise<{ id: string } | null> {
  const { data, error } = await (supabase().from('post_comments') as any)
    .insert({ post_id: postId, user_id: userId, content: content.trim() })
    .select('id')
    .single()

  if (error) throw error
  return data
}

/** Delete a post and all related data */
export async function deletePost(postId: string): Promise<void> {
  await Promise.allSettled([
    (supabase().from('post_comments') as any).delete().eq('post_id', postId),
    (supabase().from('post_likes') as any).delete().eq('post_id', postId),
    (supabase().from('post_images') as any).delete().eq('post_id', postId),
    (supabase().from('saved_posts') as any).delete().eq('post_id', postId),
    (supabase().from('post_embeddings') as any).delete().eq('post_id', postId),
    (supabase().from('notifications') as any).delete().eq('link_id', postId).eq('link_type', 'post'),
  ])
  const { error } = await (supabase().from('posts') as any).delete().eq('id', postId)
  if (error) throw error
}

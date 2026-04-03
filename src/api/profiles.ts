/**
 * Profiles API — centralized data access for user profiles.
 */
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

const supabase = () => createClient()

/** Fetch current authenticated user's profile */
export async function fetchCurrentProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase().auth.getUser()
  if (!user) return null

  const { data, error } = await supabase()
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) return null
  return data as unknown as Profile
}

/** Fetch public profile by user ID */
export async function fetchPublicProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) return null
  return data as unknown as Profile
}

/** Update profile fields */
export async function updateProfile(userId: string, fields: Partial<Profile>): Promise<void> {
  const { error } = await (supabase().from('profiles') as any)
    .update(fields)
    .eq('id', userId)

  if (error) throw error
}

/** Follow/unfollow a user — returns new follow state */
export async function toggleFollow(followerId: string, followedId: string, currentlyFollowing: boolean): Promise<boolean> {
  if (currentlyFollowing) {
    await (supabase().from('user_follows') as any).delete()
      .eq('follower_id', followerId)
      .eq('followed_id', followedId)
    return false
  } else {
    await (supabase().from('user_follows') as any).insert({
      follower_id: followerId,
      followed_id: followedId,
    })
    return true
  }
}

/** Block/unblock a user — returns new block state */
export async function toggleBlock(blockerId: string, blockedId: string, currentlyBlocked: boolean): Promise<boolean> {
  if (currentlyBlocked) {
    await (supabase().from('blocked_users') as any).delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
    return false
  } else {
    await (supabase().from('blocked_users') as any).insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
    })
    return true
  }
}

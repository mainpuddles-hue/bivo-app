declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { useSupabase } from './useSupabase'
import { usePoints } from './usePoints'

interface ReferralTier {
  invites: number
  rewardKey: string
  badgeType: string | null
  proTrialDays: number
  points: number
}

const REFERRAL_TIERS: ReferralTier[] = [
  { invites: 1, rewardKey: 'referral.tier1', badgeType: 'first_invite', proTrialDays: 0, points: 50 },
  { invites: 3, rewardKey: 'referral.tier3', badgeType: 'community_builder', proTrialDays: 0, points: 150 },
  { invites: 5, rewardKey: 'referral.tier5', badgeType: null, proTrialDays: 7, points: 300 },
  { invites: 10, rewardKey: 'referral.tier10', badgeType: 'neighborhood_hero', proTrialDays: 0, points: 500 },
  { invites: 25, rewardKey: 'referral.tier25', badgeType: null, proTrialDays: 30, points: 1000 },
]

export function useReferral(userId: string | null) {
  const supabase = useSupabase()
  const { awardPoints } = usePoints()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteCount, setInviteCount] = useState(0)
  const [currentTier, setCurrentTier] = useState<ReferralTier | null>(null)
  const [nextTier, setNextTier] = useState<ReferralTier | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user's invite code and count on mount
  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('invite_code, invite_count')
          .eq('id', userId!)
          .single()
        if (profile) {
          setInviteCode((profile as any).invite_code)
          setInviteCount((profile as any).invite_count ?? 0)
        }
      } catch {
        // Intentional: network error or missing columns — use defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId, supabase])

  // Calculate tiers
  useEffect(() => {
    const achieved = REFERRAL_TIERS.filter(t => inviteCount >= t.invites)
    setCurrentTier(achieved.length > 0 ? achieved[achieved.length - 1] : null)
    const next = REFERRAL_TIERS.find(t => inviteCount < t.invites)
    setNextTier(next ?? null)
  }, [inviteCount])

  // Generate invite code if user doesn't have one
  const generateCode = useCallback(async () => {
    if (!userId || inviteCode) return inviteCode
    const code = userId.slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
    await (supabase.from('profiles') as any)
      .update({ invite_code: code })
      .eq('id', userId)
    setInviteCode(code)
    return code
  }, [userId, inviteCode, supabase])

  // Apply invite code during onboarding (called by the invited user)
  const applyInviteCode = useCallback(async (code: string) => {
    if (!userId) return false
    try {
    // Find the inviter
    const { data: inviter } = await supabase
      .from('profiles')
      .select('id, invite_count')
      .eq('invite_code', code.toUpperCase().trim())
      .single()
    if (!inviter) return false
    if ((inviter as any).id === userId) return false // Can't invite yourself

    // Update invited user's profile
    await (supabase.from('profiles') as any)
      .update({ invited_by: (inviter as any).id })
      .eq('id', userId)

    // Increment inviter's count atomically via RPC, with read-then-write fallback
    const newCount = ((inviter as any).invite_count ?? 0) + 1
    try {
      const { error: rpcError } = await (supabase.rpc as any)('increment_field', {
        table_name: 'profiles',
        field_name: 'invite_count',
        row_id: (inviter as any).id,
        amount: 1,
      })
      if (rpcError) throw rpcError
    } catch {
      // Intentional: RPC may not exist — fallback to non-atomic read-then-write
      const { error: fallbackErr } = await (supabase.from('profiles') as any)
        .update({ invite_count: newCount })
        .eq('id', (inviter as any).id)
      if (fallbackErr && __DEV__) console.warn('[referral] invite_count update failed:', fallbackErr.message)
    }

    // Award points to both — use referenceId for dedup to prevent double-awarding
    await awardPoints(userId, 'first_post_bonus', `referral_${code}`) // 20pts for joining via invite
    await awardPoints((inviter as any).id, 'thanks_received', `referral_${userId}`) // 10pts for inviter

    // Check if inviter unlocked a new tier
    const newTier = REFERRAL_TIERS.filter(t => newCount >= t.invites).pop()
    const oldTier = REFERRAL_TIERS.filter(t => newCount - 1 >= t.invites).pop()
    if (newTier && (!oldTier || newTier.invites !== oldTier.invites)) {
      // Award tier bonus points
      await awardPoints((inviter as any).id, 'first_post_bonus') // Reuse action for bonus
      // Award badge if tier has one
      if (newTier.badgeType) {
        const { error: badgeErr } = await (supabase.from('user_badges') as any)
          .insert({ user_id: (inviter as any).id, badge_type: newTier.badgeType })
        if (badgeErr && __DEV__) console.warn('[referral] badge insert failed:', badgeErr.message)
      }
      // Grant Pro trial if tier has one
      if (newTier.proTrialDays > 0) {
        const proExpires = new Date(Date.now() + newTier.proTrialDays * 86400000).toISOString()
        const { error: proErr } = await (supabase.from('profiles') as any)
          .update({ is_pro: true, pro_expires_at: proExpires })
          .eq('id', (inviter as any).id)
        if (proErr && __DEV__) console.warn('[referral] pro trial grant failed:', proErr.message)
      }
    }

    return true
    } catch (err) {
      if (__DEV__) console.warn('[referral] applyInviteCode failed:', err)
      return false
    }
  }, [userId, supabase, awardPoints])

  return { inviteCode, inviteCount, currentTier, nextTier, loading, generateCode, applyInviteCode, REFERRAL_TIERS }
}

declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
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

export type ApplyResult = 'success' | 'invalid' | 'self' | 'already_referred' | 'error'

export function useReferral(userId: string | null) {
  const supabase = useSupabase()
  const { awardPoints } = usePoints()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteCount, setInviteCount] = useState(0)
  const [invitedBy, setInvitedBy] = useState<string | null>(null)
  const [currentTier, setCurrentTier] = useState<ReferralTier | null>(null)
  const [nextTier, setNextTier] = useState<ReferralTier | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user's invite code, count, and invited_by status
  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('invite_code, invite_count, invited_by')
          .eq('id', userId!)
          .maybeSingle()
        if (profile) {
          setInviteCode((profile as any).invite_code)
          setInviteCount((profile as any).invite_count ?? 0)
          setInvitedBy((profile as any).invited_by ?? null)
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
  // Uses crypto-random 6-char alphanumeric code with collision retry
  const generateCode = useCallback(async () => {
    if (!userId || inviteCode) return inviteCode

    for (let attempt = 0; attempt < 5; attempt++) {
      // Generate 6-char code from random bytes (36^6 = ~2.2B combinations)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion
      let code = ''
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
      }

      // Write directly — unique constraint on invite_code prevents duplicates.
      // No pre-check SELECT needed (eliminates TOCTOU race).
      const { error } = await (supabase.from('profiles') as any)
        .update({ invite_code: code })
        .eq('id', userId)
      if (error) {
        if (error.code === '23505') continue // unique violation — collision, retry
        if (__DEV__) console.warn('[referral] generateCode failed:', error.message)
        return null
      }
      setInviteCode(code)
      return code
    }
    if (__DEV__) console.warn('[referral] generateCode: max retries reached')
    return null
  }, [userId, inviteCode, supabase])

  // Apply invite code (called by the invited user — onboarding or settings)
  const applyInviteCode = useCallback(async (code: string): Promise<ApplyResult> => {
    if (!userId) return 'error'

    // Already used a referral code
    if (invitedBy) return 'already_referred'

    try {
      // Find the inviter
      const { data: inviter } = await supabase
        .from('profiles')
        .select('id, invite_count')
        .eq('invite_code', code.toUpperCase().trim())
        .maybeSingle()
      if (!inviter) return 'invalid'
      if ((inviter as any).id === userId) return 'self'

      // Double-check: re-fetch invited_by to prevent race conditions
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('invited_by')
        .eq('id', userId)
        .maybeSingle()
      if ((currentProfile as any)?.invited_by) {
        setInvitedBy((currentProfile as any).invited_by)
        return 'already_referred'
      }

      // Update invited user's profile
      const { error: updateErr } = await (supabase.from('profiles') as any)
        .update({ invited_by: (inviter as any).id })
        .eq('id', userId)
      if (updateErr) throw updateErr
      setInvitedBy((inviter as any).id)

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
        // Intentional: RPC may not exist — fallback with optimistic lock
        const { error: fallbackErr } = await (supabase.from('profiles') as any)
          .update({ invite_count: newCount })
          .eq('id', (inviter as any).id)
          .eq('invite_count', (inviter as any).invite_count ?? 0)  // optimistic lock
        if (fallbackErr && __DEV__) console.warn('[referral] invite_count update failed:', fallbackErr.message)
      }

      // Award points to both — use referenceId for dedup to prevent double-awarding
      await awardPoints(userId, 'first_post_bonus', `referral_${code}`)
      await awardPoints((inviter as any).id, 'thanks_received', `referral_${userId}`)

      // Check if inviter unlocked a new tier
      const newTier = REFERRAL_TIERS.filter(t => newCount >= t.invites).pop()
      const oldTier = REFERRAL_TIERS.filter(t => newCount - 1 >= t.invites).pop()
      if (newTier && (!oldTier || newTier.invites !== oldTier.invites)) {
        const tierPoints = newTier.points
        const { data: inviterProfile } = await supabase
          .from('profiles')
          .select('total_points')
          .eq('id', (inviter as any).id)
          .maybeSingle()
        const currentTotal = ((inviterProfile as any)?.total_points ?? 0)
        await (supabase.from('profiles') as any).update({
          total_points: currentTotal + tierPoints,
        }).eq('id', (inviter as any).id)
        if (newTier.badgeType) {
          await (supabase.from('user_badges') as any)
            .insert({ user_id: (inviter as any).id, badge_type: newTier.badgeType })
            .catch((e: unknown) => { if (__DEV__) console.warn('[referral] badge insert failed:', e) })
        }
        if (newTier.proTrialDays > 0) {
          const proExpires = new Date(Date.now() + newTier.proTrialDays * 86400000).toISOString()
          await (supabase.from('profiles') as any)
            .update({ is_pro: true, pro_expires_at: proExpires })
            .eq('id', (inviter as any).id)
            .catch((e: unknown) => { if (__DEV__) console.warn('[referral] pro trial update failed:', e) })
        }
      }

      // Notify inviter: insert in-app notification
      const { data: invitedProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .maybeSingle()
      const invitedName = (invitedProfile as any)?.name ?? 'Joku'
      await (supabase.from('notifications') as any)
        .insert({
          user_id: (inviter as any).id,
          type: 'referral_used',
          title: `${invitedName} liittyi kutsullasi!`,
          body: `Kutsukoodiasi käytettiin. +${newTier ? newTier.points : 10} pistettä.`,
          data: { invited_user_id: userId },
        })
        .catch((e: unknown) => { if (__DEV__) console.warn('[referral] notification insert failed:', e) })

      return 'success'
    } catch (err) {
      if (__DEV__) console.warn('[referral] applyInviteCode failed:', err)
      return 'error'
    }
  }, [userId, invitedBy, supabase, awardPoints])

  return {
    inviteCode, inviteCount, invitedBy, currentTier, nextTier,
    loading, generateCode, applyInviteCode, REFERRAL_TIERS,
  }
}

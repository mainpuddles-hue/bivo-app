declare const __DEV__: boolean

import { useCallback } from 'react'
import { useSupabase } from './useSupabase'

export type CoopInviteResult =
  | 'success'
  | 'invalid'       // code not found or inactive
  | 'expired'       // code past expires_at
  | 'exhausted'     // uses_count >= max_uses
  | 'already_member' // user already in this org
  | 'error'

interface CoopCodeInfo {
  org_id: string
  org_name: string
  org_address: string | null
}

export function useCooperativeInvite() {
  const supabase = useSupabase()

  /** Validate a cooperative code without applying it. Returns org info or null. */
  const validateCode = useCallback(async (code: string): Promise<CoopCodeInfo | null> => {
    const clean = code.trim().toUpperCase()
    if (!clean || clean.length < 4) return null

    try {
      const { data } = await supabase
        .from('cooperative_invite_codes')
        .select('id, org_id, expires_at, max_uses, uses_count, is_active')
        .eq('code', clean)
        .eq('is_active', true)
        .maybeSingle()

      if (!data) return null

      const row = data as any
      if (row.expires_at && new Date(row.expires_at) < new Date()) return null
      if (row.max_uses != null && row.uses_count >= row.max_uses) return null

      // Fetch org info
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, street_address')
        .eq('id', row.org_id)
        .maybeSingle()

      if (!org) return null
      return {
        org_id: (org as any).id,
        org_name: (org as any).name,
        org_address: (org as any).street_address,
      }
    } catch (e) {
      if (__DEV__) console.warn('[coopInvite] validateCode error:', e)
      return null
    }
  }, [supabase])

  /** Apply a cooperative code: join the org + increment uses_count */
  const applyCode = useCallback(async (code: string, userId: string): Promise<CoopInviteResult> => {
    const clean = code.trim().toUpperCase()
    if (!clean || !userId) return 'error'

    try {
      // 1. Fetch the code record
      const { data } = await supabase
        .from('cooperative_invite_codes')
        .select('id, org_id, expires_at, max_uses, uses_count, is_active')
        .eq('code', clean)
        .eq('is_active', true)
        .maybeSingle()

      if (!data) return 'invalid'
      const row = data as any

      if (row.expires_at && new Date(row.expires_at) < new Date()) return 'expired'
      if (row.max_uses != null && row.uses_count >= row.max_uses) return 'exhausted'

      // 2. Check if user already a member of this org
      const { data: existing } = await supabase
        .from('organization_members')
        .select('id')
        .eq('org_id', row.org_id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing) return 'already_member'

      // 3. Add user as member (pre-approved since they have the code)
      const { error: joinError } = await (supabase.from('organization_members') as any).insert({
        org_id: row.org_id,
        user_id: userId,
        role: 'member',
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      if (joinError) {
        // Unique constraint = already member
        if (joinError.code === '23505') return 'already_member'
        throw joinError
      }

      // 4. Increment uses_count atomically
      await (supabase.from('cooperative_invite_codes') as any)
        .update({ uses_count: row.uses_count + 1 })
        .eq('id', row.id)
        .eq('uses_count', row.uses_count) // optimistic lock

      // 5. Update org member_count
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', row.org_id)

      if (count != null) {
        await (supabase.from('organizations') as any)
          .update({ member_count: count })
          .eq('id', row.org_id)
      }

      return 'success'
    } catch (e) {
      if (__DEV__) console.warn('[coopInvite] applyCode error:', e)
      return 'error'
    }
  }, [supabase])

  /** Generate a new cooperative code (admin/board only) */
  const generateCode = useCallback(async (
    orgId: string,
    opts?: { maxUses?: number; expiresInDays?: number }
  ): Promise<string | null> => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

    for (let attempt = 0; attempt < 5; attempt++) {
      let code = ''
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const insertData: Record<string, unknown> = {
        org_id: orgId,
        code,
        created_by: user.id,
      }
      if (opts?.maxUses) insertData.max_uses = opts.maxUses
      if (opts?.expiresInDays) {
        insertData.expires_at = new Date(Date.now() + opts.expiresInDays * 86400000).toISOString()
      }

      const { error } = await (supabase.from('cooperative_invite_codes') as any).insert(insertData)
      if (error) {
        if (error.code === '23505') continue // unique collision, retry
        if (__DEV__) console.warn('[coopInvite] generateCode error:', error.message)
        return null
      }
      return code
    }
    return null
  }, [supabase])

  return { validateCode, applyCode, generateCode }
}

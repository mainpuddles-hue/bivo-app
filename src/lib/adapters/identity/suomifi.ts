declare const __DEV__: boolean

import type { IdentityAdapter, IdentityBranding } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

/**
 * Suomi.fi identity verification adapter (Finland).
 *
 * Production flow:
 * 1. Client calls startVerification → Edge Function returns Suomi.fi OIDC URL
 * 2. User completes bank auth in browser
 * 3. Suomi.fi callback hits Edge Function → badge inserted server-side
 * 4. Client polls checkStatus until verified
 *
 * Dev flow: in-app confirmation writes badge directly (see useIdentityVerification hook).
 */
const suomifiAdapter: IdentityAdapter = {
  type: 'suomifi',
  name: 'Suomi.fi',

  async startVerification(userId: string): Promise<{ url?: string; inApp?: boolean }> {
    try {
      // In production: call Edge Function to get Suomi.fi OIDC redirect URL
      const res = await fetch(`${FUNCTIONS_URL}/identity-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'suomifi', userId }),
      })

      if (res.ok) {
        const { url } = await res.json()
        if (url) return { url }
      }
    } catch (err) {
      if (__DEV__) console.log('[suomifi] Edge Function not available, falling back to in-app flow')
    }

    // Fallback: in-app flow (dev/testing — handled by useIdentityVerification hook)
    return { inApp: true }
  },

  async checkStatus(userId: string): Promise<{ verified: boolean; pending: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-status?userId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        return { verified: !!data.verified, pending: !!data.pending }
      }
    } catch {
      // Edge Function not available
    }
    return { verified: false, pending: false }
  },

  getBranding(): IdentityBranding {
    return {
      color: '#003580',
      icon: 'ShieldCheck',
      title: 'Suomi.fi',
      description: 'verification.suomifiInfo',
    }
  },
}

export default suomifiAdapter

declare const __DEV__: boolean

import type { IdentityAdapter, IdentityBranding } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

/**
 * Smart-ID identity verification adapter (Estonia / Latvia / Lithuania).
 *
 * Smart-ID is the dominant mobile e-ID in the Baltic states.
 * Flow: user enters personal code, gets a verification code on their Smart-ID app.
 *
 * Production: requires Relying Party agreement with SK ID Solutions.
 * API docs: https://github.com/SK-EID/smart-id-documentation
 */
const smartidAdapter: IdentityAdapter = {
  type: 'smartid',
  name: 'Smart-ID',

  async startVerification(userId: string): Promise<{ url?: string; inApp?: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'smartid', userId }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.url) return { url: data.url }
        // Smart-ID uses in-app verification code display
        // The server initiates the session, user confirms on Smart-ID app
        if (data.verificationCode) {
          return { inApp: true }
        }
      }
    } catch (err) {
      if (__DEV__) console.log('[smartid] Edge Function not available')
    }

    return { inApp: true }
  },

  async checkStatus(userId: string): Promise<{ verified: boolean; pending: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-status?userId=${userId}&provider=smartid`)
      if (res.ok) {
        const data = await res.json()
        return { verified: !!data.verified, pending: !!data.pending }
      }
    } catch {
      // Intentional: Edge Function may not be deployed yet
    }
    return { verified: false, pending: false }
  },

  getBranding(): IdentityBranding {
    return {
      color: '#0066CC',
      icon: 'Smartphone',
      title: 'Smart-ID',
      description: 'verification.smartidDesc',
    }
  },
}

export default smartidAdapter

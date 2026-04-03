declare const __DEV__: boolean

import type { IdentityAdapter, IdentityBranding } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

/**
 * eIDAS identity verification adapter (EU-wide).
 *
 * eIDAS (Electronic Identification, Authentication and Trust Services)
 * is the EU-wide framework for cross-border electronic identification.
 *
 * Used for countries that don't have a country-specific adapter (e.g., Germany, France).
 * Requires eIDAS node integration via the national eID scheme.
 *
 * For Germany specifically: uses the nPA (neuer Personalausweis) eID function
 * via the AusweisApp2 / eID-Server.
 */
const eidasAdapter: IdentityAdapter = {
  type: 'eidas',
  name: 'eIDAS',

  async startVerification(userId: string): Promise<{ url?: string; inApp?: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'eidas', userId }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.url) return { url: data.url }
      }
    } catch (err) {
      if (__DEV__) console.log('[eidas] Edge Function not available')
    }

    // eIDAS always requires server-side flow
    return { inApp: true }
  },

  async checkStatus(userId: string): Promise<{ verified: boolean; pending: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-status?userId=${userId}&provider=eidas`)
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
      color: '#003399',
      icon: 'Globe',
      title: 'eIDAS',
      description: 'verification.eidasDesc',
    }
  },
}

export default eidasAdapter

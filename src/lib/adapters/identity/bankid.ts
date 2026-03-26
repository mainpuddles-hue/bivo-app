declare const __DEV__: boolean

import type { IdentityAdapter, IdentityBranding } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

/**
 * BankID identity verification adapter (Sweden / Norway).
 *
 * BankID is the primary e-ID in Sweden and Norway.
 * Flow: redirect to BankID app via deep link or QR code.
 *
 * Production:
 * - Sweden: integration via Svensk e-identitet (CGI / BankID RP API)
 * - Norway: integration via BankID Norge (BankID on Mobile / BankID med kodebrikke)
 *
 * Both require signed RP agreements and server-side integration.
 */
const bankidAdapter: IdentityAdapter = {
  type: 'bankid',
  name: 'BankID',

  async startVerification(userId: string): Promise<{ url?: string; inApp?: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'bankid', userId }),
      })

      if (res.ok) {
        const data = await res.json()
        // BankID returns either:
        // - autoStartToken for BankID app deep link (mobile)
        // - QR code data for desktop flow
        if (data.url) return { url: data.url }
        if (data.autoStartToken) {
          // Deep link to BankID app: bankid:///?autostarttoken=xxx&redirect=tackbird://
          const bankidUrl = `bankid:///?autostarttoken=${data.autoStartToken}&redirect=tackbird%3A%2F%2Fverify-callback`
          return { url: bankidUrl }
        }
      }
    } catch (err) {
      if (__DEV__) console.log('[bankid] Edge Function not available')
    }

    // Fallback: in-app flow (pending server-side BankID integration)
    return { inApp: true }
  },

  async checkStatus(userId: string): Promise<{ verified: boolean; pending: boolean }> {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/identity-status?userId=${userId}&provider=bankid`)
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
      color: '#235971',
      icon: 'ShieldCheck',
      title: 'BankID',
      description: 'verification.bankidDesc',
    }
  },
}

export default bankidAdapter

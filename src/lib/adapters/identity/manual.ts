import type { IdentityAdapter, IdentityBranding } from '../types'

/**
 * Manual identity verification fallback.
 *
 * For countries without automated e-ID integration.
 * User is directed to contact support for manual ID verification.
 */
const manualIdentityAdapter: IdentityAdapter = {
  type: 'manual',
  name: 'Manual',

  async startVerification(_userId: string): Promise<{ url?: string; inApp?: boolean }> {
    // Manual verification: no automated flow
    return { inApp: true }
  },

  async checkStatus(_userId: string): Promise<{ verified: boolean; pending: boolean }> {
    // Manual verification status must be checked via profile.identity_verified_at
    return { verified: false, pending: false }
  },

  getBranding(): IdentityBranding {
    return {
      color: '#6B7280',
      icon: 'Mail',
      title: 'Manual',
      description: 'verification.manualDesc',
    }
  },
}

export default manualIdentityAdapter

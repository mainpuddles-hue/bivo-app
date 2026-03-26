declare const __DEV__: boolean

import type { BusinessAdapter, BusinessIdFormat, BusinessValidationResult } from '../types'

/**
 * Estonian e-Business Register (Ariregister) adapter.
 *
 * Registry code format: 8-digit number (e.g., 12345678)
 *
 * Public search at: https://ariregister.rik.ee/
 * API docs: https://ariregister.rik.ee/lihtparing.html
 *
 * The public search endpoint can be queried directly for basic validation.
 * Full API access requires a contract with RIK (Centre of Registers and Information Systems).
 */
const ebrAdapter: BusinessAdapter = {
  type: 'ebr',
  name: 'Ariregister (e-Business Register)',

  async validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null> {
    const cleaned = businessId.trim().replace(/\s/g, '')

    // Validate format: 8 digits
    if (!/^\d{8}$/.test(cleaned)) {
      return null
    }

    // Try the public search API
    try {
      const res = await fetch(
        `https://ariregister.rik.ee/est/api/autocomplete?q=${cleaned}`,
        { headers: { 'Accept': 'application/json' } }
      )

      if (res.ok) {
        const data = await res.json()
        const match = data?.items?.find((item: any) =>
          String(item.reg_code) === cleaned || String(item.ariregistri_kood) === cleaned
        )

        if (match) {
          return {
            valid: true,
            autoApproved: false, // Public API: mark for review
            officialName: match.nimi ?? match.name ?? businessName ?? '',
            businessId: cleaned,
            status: match.staatus === 'R' ? 'active' : 'inactive',
            address: match.aadress ?? undefined,
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.log('[ebr] API query failed:', err)
    }

    // Fallback: format valid, manual review needed
    return {
      valid: true,
      autoApproved: false,
      officialName: businessName ?? '',
      businessId: cleaned,
      status: 'pending_review',
    }
  },

  getIdFormat(): BusinessIdFormat {
    return {
      placeholder: '12345678',
      regex: /^\d{8}$/,
      label: 'business.formatEE',
      example: '12345678',
    }
  },
}

export default ebrAdapter

declare const __DEV__: boolean

import type { BusinessAdapter, BusinessIdFormat, BusinessValidationResult } from '../types'

/**
 * Bolagsverket business validation adapter (Sweden).
 *
 * Swedish Companies Registration Office.
 * Organisationsnummer format: 556xxx-xxxx (10 digits, optional dash after 6th)
 *
 * No free public API available — validates format only and marks for manual review.
 * Future: integrate via Bolagsverket's e-tjänster or InfoTorg.
 */
const bolagsverketAdapter: BusinessAdapter = {
  type: 'bolagsverket',
  name: 'Bolagsverket',

  async validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null> {
    // Normalize: remove spaces, add dash if missing
    let cleaned = businessId.trim().replace(/\s/g, '')

    // Accept with or without dash
    if (/^\d{10}$/.test(cleaned)) {
      cleaned = `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`
    }

    // Validate format: 6 digits, dash, 4 digits
    if (!/^\d{6}-\d{4}$/.test(cleaned)) {
      return null
    }

    // Validate Luhn check digit (Swedish org numbers use Luhn on digits 2-10)
    const digits = cleaned.replace('-', '').split('').map(Number)
    let sum = 0
    for (let i = 0; i < digits.length; i++) {
      let d = digits[i]
      // Luhn: double every other digit starting from the first
      if (i % 2 === 0) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
    }

    if (sum % 10 !== 0) {
      if (__DEV__) console.log('[bolagsverket] Luhn check failed for', cleaned)
      return null
    }

    // Format is valid — mark for manual review (no free API)
    return {
      valid: true,
      autoApproved: false,
      officialName: businessName ?? '',
      businessId: cleaned,
      status: 'pending_review',
      companyForm: undefined,
    }
  },

  getIdFormat(): BusinessIdFormat {
    return {
      placeholder: '556XXX-XXXX',
      regex: /^\d{6}-?\d{4}$/,
      label: 'business.formatSE',
      example: '556123-4567',
    }
  },
}

export default bolagsverketAdapter

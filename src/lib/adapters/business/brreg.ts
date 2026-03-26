declare const __DEV__: boolean

import type { BusinessAdapter, BusinessIdFormat, BusinessValidationResult } from '../types'

/**
 * Brønnøysund Register Centre (brreg.no) adapter (Norway).
 *
 * FREE open API: https://data.brreg.no/enhetsregisteret/api/enheter/{organisasjonsnummer}
 * No API key required. Returns full company details including name, status, address.
 *
 * Organisasjonsnummer format: 9 digits (e.g., 123456789)
 */
const brregAdapter: BusinessAdapter = {
  type: 'brreg',
  name: 'Brønnøysundregistrene',

  async validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null> {
    const cleaned = businessId.trim().replace(/[\s-]/g, '')

    // Validate format: 9 digits
    if (!/^\d{9}$/.test(cleaned)) {
      return null
    }

    // Norwegian org numbers: first digit must be 8 or 9 for organizations
    // (other prefixes exist but 8/9 are most common for businesses)

    try {
      const res = await fetch(
        `https://data.brreg.no/enhetsregisteret/api/enheter/${cleaned}`,
        {
          headers: { 'Accept': 'application/json' },
        }
      )

      if (res.status === 404) {
        // Not found in register
        return {
          valid: false,
          autoApproved: false,
          officialName: '',
          businessId: cleaned,
          status: 'not_found',
        }
      }

      if (!res.ok) {
        if (__DEV__) console.log('[brreg] API returned', res.status)
        return null
      }

      const data = await res.json()

      // Extract address
      const addr = data.forretningsadresse
      const addressParts = [
        addr?.adresse?.[0],
        addr?.postnummer,
        addr?.poststed,
      ].filter(Boolean)
      const address = addressParts.join(', ') || undefined

      // Check if the company is active
      const isActive = !data.slettedato && !data.konkurs
      const statusStr = data.konkurs ? 'bankrupt' : data.slettedato ? 'deleted' : 'active'

      // Name matching (optional extra check)
      const officialName = data.navn ?? ''
      const nameMatch = !businessName ||
        officialName.toLowerCase().includes(businessName.toLowerCase()) ||
        businessName.toLowerCase().includes(officialName.toLowerCase())

      return {
        valid: true,
        autoApproved: isActive && nameMatch,
        officialName,
        businessId: data.organisasjonsnummer ?? cleaned,
        status: statusStr,
        address,
        companyForm: data.organisasjonsform?.beskrivelse ?? undefined,
      }
    } catch (err) {
      if (__DEV__) console.log('[brreg] API error:', err)

      // Network error: format is valid, mark for review
      return {
        valid: true,
        autoApproved: false,
        officialName: businessName ?? '',
        businessId: cleaned,
        status: 'pending_review',
      }
    }
  },

  getIdFormat(): BusinessIdFormat {
    return {
      placeholder: '123456789',
      regex: /^\d{9}$/,
      label: 'business.formatNO',
      example: '987654321',
    }
  },
}

export default brregAdapter

import type { BusinessAdapter, BusinessIdFormat, BusinessValidationResult } from '../types'

/**
 * Handelsregister (German trade register) adapter.
 *
 * No free public API available. The Gemeinsames Registerportal
 * (www.handelsregister.de) offers only manual searches.
 *
 * HRB number format: HRB xxxxx (or HRA for partnerships)
 * Combined with the registering court (Amtsgericht), e.g., "HRB 12345 Amtsgericht München"
 *
 * For now: validates format pattern only, marks for manual review.
 * Future: integrate via a commercial register data provider (e.g., North Data, CompanyHouse DE).
 */
const handelsregisterAdapter: BusinessAdapter = {
  type: 'handelsregister',
  name: 'Handelsregister',

  async validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null> {
    const cleaned = businessId.trim()

    // Validate format: HRB/HRA followed by digits, optional spaces
    // Accept: "HRB 12345", "HRA12345", "HRB12345"
    const match = cleaned.match(/^(HR[AB])\s*(\d{1,7})$/i)
    if (!match) {
      return null
    }

    const registerType = match[1].toUpperCase()
    const registerNumber = match[2]
    const normalizedId = `${registerType} ${registerNumber}`

    // No API available — always manual review
    return {
      valid: true,
      autoApproved: false,
      officialName: businessName ?? '',
      businessId: normalizedId,
      status: 'pending_review',
      companyForm: registerType === 'HRB' ? 'Kapitalgesellschaft' : 'Personengesellschaft',
    }
  },

  getIdFormat(): BusinessIdFormat {
    return {
      placeholder: 'HRB 12345',
      regex: /^HR[AB]\s*\d{1,7}$/i,
      label: 'business.formatDE',
      example: 'HRB 12345',
    }
  },
}

export default handelsregisterAdapter

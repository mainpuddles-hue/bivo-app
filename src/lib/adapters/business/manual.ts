import type { BusinessAdapter, BusinessIdFormat, BusinessValidationResult } from '../types'

/**
 * Manual business validation fallback.
 *
 * For countries without automated business register integration.
 * Always marks submissions for manual review by admin.
 */
const manualBusinessAdapter: BusinessAdapter = {
  type: 'manual',
  name: 'Manual',

  async validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null> {
    const cleaned = businessId.trim()
    if (!cleaned) return null

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
      placeholder: '',
      regex: /.+/,
      label: 'business.vatId',
      example: '',
    }
  },
}

export default manualBusinessAdapter

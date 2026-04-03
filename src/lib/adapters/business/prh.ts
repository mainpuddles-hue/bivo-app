declare const __DEV__: boolean

import type { BusinessAdapter, BusinessIdFormat, BusinessValidationResult } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

/**
 * PRH (Patent and Registration Office) business validation adapter (Finland).
 *
 * Uses the existing validate-business Edge Function which calls:
 * https://avoindata.prh.fi/bis/v1/{businessId}
 *
 * Y-tunnus format: 1234567-8 (7 digits, dash, check digit)
 */
const prhAdapter: BusinessAdapter = {
  type: 'prh',
  name: 'PRH (Patentti- ja rekisterihallitus)',

  async validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null> {
    // Clean the input
    const cleaned = businessId.trim().replace(/\s/g, '')

    // Validate format locally first
    if (!/^\d{7}-\d$/.test(cleaned)) {
      return null
    }

    try {
      // Call the existing Edge Function
      const res = await fetch(`${FUNCTIONS_URL}/validate-business`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ytunnus: cleaned,
          business_name: businessName?.trim() ?? '',
        }),
      })

      if (!res.ok) {
        if (__DEV__) console.log('[prh] Edge Function returned', res.status)
        return null
      }

      const data = await res.json()

      if (!data.valid) {
        return {
          valid: false,
          autoApproved: false,
          officialName: '',
          businessId: cleaned,
          status: 'not_found',
        }
      }

      return {
        valid: true,
        autoApproved: data.auto_approved ?? false,
        officialName: data.prh_company?.name ?? businessName ?? '',
        businessId: cleaned,
        status: data.prh_company?.status ?? 'active',
        address: data.prh_company?.address ?? undefined,
        companyForm: data.prh_company?.companyForm ?? undefined,
      }
    } catch (err) {
      if (__DEV__) console.log('[prh] validation error:', err)

      // Fallback: call PRH open data API directly
      try {
        const directRes = await fetch(
          `https://avoindata.prh.fi/bis/v1/${cleaned}`
        )
        if (!directRes.ok) return null

        const directData = await directRes.json()
        const company = directData?.results?.[0]
        if (!company) return null

        return {
          valid: true,
          autoApproved: false, // Direct API call: needs manual review
          officialName: company.name ?? '',
          businessId: company.businessId ?? cleaned,
          status: company.companyRegistrations?.[0]?.status?.toLowerCase() ?? 'unknown',
          address: company.addresses?.[0]?.street ?? undefined,
          companyForm: company.companyForms?.[0]?.name ?? undefined,
        }
      } catch (err) {
        if (__DEV__) console.warn('[prh] direct API fallback failed:', err)
        return null
      }
    }
  },

  getIdFormat(): BusinessIdFormat {
    return {
      placeholder: '1234567-8',
      regex: /^\d{7}-\d$/,
      label: 'business.vatId',
      example: '1234567-8',
    }
  },
}

export default prhAdapter

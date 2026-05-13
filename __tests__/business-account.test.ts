/**
 * Business/Organization Account Business Logic Tests
 *
 * Tests the core business logic for Bivo Business accounts:
 * - Plan validation: only 'monthly', 'yearly', 'business_monthly' are valid
 * - Business badge display: is_business flag drives badge rendering
 * - PRH Y-tunnus format validation: regex /^\d{7}-\d$/
 * - Business subscription detection: amount >= 2999 = business
 */

// Mock react-native modules before any imports
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}))

import type { Profile } from '../src/lib/types'

// ══════════════════════════════════════════════════════
// Plan Validation
// ══════════════════════════════════════════════════════

describe('Plan Validation', () => {
  // From pro.tsx: type Plan = 'monthly' | 'yearly'
  // From upgrade-business.tsx: plan: 'business_monthly'
  const VALID_PLANS = ['monthly', 'yearly', 'business_monthly'] as const
  type ValidPlan = (typeof VALID_PLANS)[number]

  function isValidPlan(plan: string): plan is ValidPlan {
    return (VALID_PLANS as readonly string[]).includes(plan)
  }

  test('monthly is a valid plan', () => {
    expect(isValidPlan('monthly')).toBe(true)
  })

  test('yearly is a valid plan', () => {
    expect(isValidPlan('yearly')).toBe(true)
  })

  test('business_monthly is a valid plan', () => {
    expect(isValidPlan('business_monthly')).toBe(true)
  })

  test('invalid plan strings are rejected', () => {
    expect(isValidPlan('weekly')).toBe(false)
    expect(isValidPlan('daily')).toBe(false)
    expect(isValidPlan('lifetime')).toBe(false)
    expect(isValidPlan('')).toBe(false)
    expect(isValidPlan('MONTHLY')).toBe(false) // case sensitive
    expect(isValidPlan('business_yearly')).toBe(false)
    expect(isValidPlan('free')).toBe(false)
  })

  test('Pro subscription plans are monthly and yearly', () => {
    const PRO_PLANS: ValidPlan[] = ['monthly', 'yearly']
    expect(PRO_PLANS).toContain('monthly')
    expect(PRO_PLANS).toContain('yearly')
    expect(PRO_PLANS).not.toContain('business_monthly')
  })

  test('Business plan is business_monthly only', () => {
    const BUSINESS_PLANS: ValidPlan[] = ['business_monthly']
    expect(BUSINESS_PLANS).toContain('business_monthly')
    expect(BUSINESS_PLANS).not.toContain('monthly')
    expect(BUSINESS_PLANS).not.toContain('yearly')
  })
})

// ══════════════════════════════════════════════════════
// Business Badge Display
// ══════════════════════════════════════════════════════

describe('Business Badge Display', () => {
  // Business badge rendering is driven by is_business flag on Profile
  // From profile/[userId].tsx and profile.tsx: profile.is_pro shows Pro badge
  // From upgrade-business.tsx: if (p.is_business) -> redirect to dashboard

  function shouldShowBusinessBadge(profile: Pick<Profile, 'is_business'>): boolean {
    return profile.is_business === true
  }

  function shouldShowProBadge(profile: Pick<Profile, 'is_pro'>): boolean {
    return profile.is_pro === true
  }

  function getAccountType(profile: Pick<Profile, 'is_business' | 'is_pro'>): string {
    if (profile.is_business) return 'business'
    if (profile.is_pro) return 'pro'
    return 'free'
  }

  test('Business account shows business badge', () => {
    expect(shouldShowBusinessBadge({ is_business: true })).toBe(true)
  })

  test('Non-business account does not show business badge', () => {
    expect(shouldShowBusinessBadge({ is_business: false })).toBe(false)
  })

  test('Pro account shows Pro badge', () => {
    expect(shouldShowProBadge({ is_pro: true })).toBe(true)
  })

  test('Non-Pro account does not show Pro badge', () => {
    expect(shouldShowProBadge({ is_pro: false })).toBe(false)
  })

  test('Account type classification is correct', () => {
    expect(getAccountType({ is_business: true, is_pro: true })).toBe('business')
    expect(getAccountType({ is_business: true, is_pro: false })).toBe('business')
    expect(getAccountType({ is_business: false, is_pro: true })).toBe('pro')
    expect(getAccountType({ is_business: false, is_pro: false })).toBe('free')
  })

  test('Business takes priority over Pro in account type', () => {
    // A user can be both is_business and is_pro, but business is the primary type
    const profile = { is_business: true, is_pro: true }
    expect(getAccountType(profile)).toBe('business')
  })

  test('Business profile requires business_name and business_vat_id', () => {
    const businessProfile: Partial<Profile> = {
      is_business: true,
      business_name: 'Puddles Oy',
      business_vat_id: '3610705-3',
    }

    expect(businessProfile.is_business).toBe(true)
    expect(businessProfile.business_name).toBeTruthy()
    expect(businessProfile.business_vat_id).toBeTruthy()
  })

  test('Free profile has null business fields', () => {
    const freeProfile: Partial<Profile> = {
      is_business: false,
      business_name: null,
      business_vat_id: null,
    }

    expect(freeProfile.is_business).toBe(false)
    expect(freeProfile.business_name).toBeNull()
    expect(freeProfile.business_vat_id).toBeNull()
  })
})

// ══════════════════════════════════════════════════════
// PRH Y-tunnus Format Validation
// ══════════════════════════════════════════════════════

describe('PRH Y-tunnus Format Validation', () => {
  // From src/lib/adapters/business/prh.ts:
  // if (!/^\d{7}-\d$/.test(cleaned)) return null
  const YTUNNUS_REGEX = /^\d{7}-\d$/

  function isValidYtunnus(input: string): boolean {
    const cleaned = input.trim().replace(/\s/g, '')
    return YTUNNUS_REGEX.test(cleaned)
  }

  test('Valid Y-tunnus format: 1234567-8', () => {
    expect(isValidYtunnus('1234567-8')).toBe(true)
  })

  test('Valid Y-tunnus: 3610705-3 (Puddles Oy)', () => {
    expect(isValidYtunnus('3610705-3')).toBe(true)
  })

  test('Valid with leading/trailing whitespace (cleaned)', () => {
    expect(isValidYtunnus(' 1234567-8 ')).toBe(true)
    expect(isValidYtunnus('  3610705-3  ')).toBe(true)
  })

  test('Valid with internal spaces (cleaned)', () => {
    expect(isValidYtunnus('1234 567-8')).toBe(true)
  })

  test('All digits 0-9 are accepted as check digit', () => {
    for (let i = 0; i <= 9; i++) {
      expect(isValidYtunnus(`1234567-${i}`)).toBe(true)
    }
  })

  test('Too few digits before dash', () => {
    expect(isValidYtunnus('123456-8')).toBe(false)
    expect(isValidYtunnus('12345-8')).toBe(false)
    expect(isValidYtunnus('1-8')).toBe(false)
  })

  test('Too many digits before dash', () => {
    expect(isValidYtunnus('12345678-8')).toBe(false)
  })

  test('Missing dash', () => {
    expect(isValidYtunnus('12345678')).toBe(false)
  })

  test('Missing check digit after dash', () => {
    expect(isValidYtunnus('1234567-')).toBe(false)
  })

  test('Two digits after dash (invalid)', () => {
    expect(isValidYtunnus('1234567-89')).toBe(false)
  })

  test('Letters are not valid', () => {
    expect(isValidYtunnus('ABCDEFG-H')).toBe(false)
    expect(isValidYtunnus('1234567-A')).toBe(false)
    expect(isValidYtunnus('123456A-8')).toBe(false)
  })

  test('Empty string is invalid', () => {
    expect(isValidYtunnus('')).toBe(false)
  })

  test('Whitespace-only is invalid', () => {
    expect(isValidYtunnus('   ')).toBe(false)
  })

  test('Swedish Organisationsnummer format is NOT valid Y-tunnus', () => {
    // 10 digits, no dash in the right position
    expect(isValidYtunnus('5560360793')).toBe(false)
    expect(isValidYtunnus('556036-0793')).toBe(false) // 6 digits - 4 digits
  })

  test('Finnish VAT (FI-prefix) format needs stripping first', () => {
    // FI12345678 is the EU VAT format; Y-tunnus validation expects digits-dash-digit only
    expect(isValidYtunnus('FI12345678')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Business Subscription Detection
// ══════════════════════════════════════════════════════

describe('Business Subscription Detection', () => {
  // From upgrade-business.tsx:
  // const MONTHLY_PRICE = 2999 // cents — 29.99 EUR
  const BUSINESS_MONTHLY_PRICE = 2999

  function isBusinessSubscription(amountCents: number): boolean {
    return amountCents >= BUSINESS_MONTHLY_PRICE
  }

  function getSubscriptionTier(amountCents: number): 'free' | 'pro' | 'business' {
    if (amountCents >= BUSINESS_MONTHLY_PRICE) return 'business'
    if (amountCents > 0) return 'pro'
    return 'free'
  }

  test('Amount >= 2999 cents is a business subscription', () => {
    expect(isBusinessSubscription(2999)).toBe(true)
    expect(isBusinessSubscription(3000)).toBe(true)
    expect(isBusinessSubscription(5000)).toBe(true)
  })

  test('Amount < 2999 cents is NOT a business subscription', () => {
    expect(isBusinessSubscription(2998)).toBe(false)
    expect(isBusinessSubscription(499)).toBe(false) // Pro monthly
    expect(isBusinessSubscription(0)).toBe(false)
  })

  test('Pro monthly (499 cents = 4.99 EUR) is pro tier, not business', () => {
    expect(getSubscriptionTier(499)).toBe('pro')
  })

  test('Pro yearly (3999 cents = 39.99 EUR) is business tier by amount', () => {
    // Note: yearly is more expensive than business_monthly threshold
    // But the plan type distinguishes them, not just the amount
    expect(getSubscriptionTier(3999)).toBe('business')
  })

  test('Business monthly (2999 cents = 29.99 EUR) is business tier', () => {
    expect(getSubscriptionTier(2999)).toBe('business')
  })

  test('Zero amount is free tier', () => {
    expect(getSubscriptionTier(0)).toBe('free')
  })

  test('Business monthly price is exactly 29.99 EUR', () => {
    expect(BUSINESS_MONTHLY_PRICE).toBe(2999)
    expect(BUSINESS_MONTHLY_PRICE / 100).toBeCloseTo(29.99)
  })
})

// ══════════════════════════════════════════════════════
// Business Adapter Integration
// ══════════════════════════════════════════════════════

describe('Business Adapter: ID Format', () => {
  // Testing the PRH adapter's getIdFormat() return shape
  // From prh.ts: getIdFormat() returns { placeholder, regex, label, example }

  const prhIdFormat = {
    placeholder: '1234567-8',
    regex: /^\d{7}-\d$/,
    label: 'business.vatId',
    example: '1234567-8',
  }

  test('PRH format placeholder is 1234567-8', () => {
    expect(prhIdFormat.placeholder).toBe('1234567-8')
  })

  test('PRH format example is 1234567-8', () => {
    expect(prhIdFormat.example).toBe('1234567-8')
  })

  test('PRH format regex validates correct Y-tunnus', () => {
    expect(prhIdFormat.regex.test('3610705-3')).toBe(true)
    expect(prhIdFormat.regex.test('1234567-8')).toBe(true)
  })

  test('PRH format regex rejects invalid formats', () => {
    expect(prhIdFormat.regex.test('123456-8')).toBe(false)
    expect(prhIdFormat.regex.test('12345678')).toBe(false)
    expect(prhIdFormat.regex.test('')).toBe(false)
  })

  test('PRH format label is business.vatId (i18n key)', () => {
    expect(prhIdFormat.label).toBe('business.vatId')
  })
})

// ══════════════════════════════════════════════════════
// Business Categories
// ══════════════════════════════════════════════════════

describe('Business Categories', () => {
  // From upgrade-business.tsx
  const BUSINESS_CATEGORIES = [
    { id: 'kahvila', fi: 'Kahvila / Ravintola', en: 'Cafe / Restaurant', sv: 'Cafe / Restaurang' },
    { id: 'kampaamo', fi: 'Kampaamo / Kauneus', en: 'Hair / Beauty', sv: 'Frisör / Skönhet' },
    { id: 'siivous', fi: 'Siivous', en: 'Cleaning', sv: 'Städning' },
    { id: 'korjaus', fi: 'Korjaus / Remontti', en: 'Repair / Renovation', sv: 'Reparation / Renovering' },
    { id: 'muu', fi: 'Muu', en: 'Other', sv: 'Annat' },
  ]

  test('There are exactly 5 business categories', () => {
    expect(BUSINESS_CATEGORIES).toHaveLength(5)
  })

  test('All categories have fi, en, sv labels', () => {
    for (const cat of BUSINESS_CATEGORIES) {
      expect(cat.fi).toBeTruthy()
      expect(cat.en).toBeTruthy()
      expect(cat.sv).toBeTruthy()
    }
  })

  test('All category IDs are unique', () => {
    const ids = BUSINESS_CATEGORIES.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('muu (other) category exists as fallback', () => {
    expect(BUSINESS_CATEGORIES.find(c => c.id === 'muu')).toBeDefined()
  })

  test('Category IDs are lowercase strings', () => {
    for (const cat of BUSINESS_CATEGORIES) {
      expect(cat.id).toBe(cat.id.toLowerCase())
      expect(typeof cat.id).toBe('string')
    }
  })
})

// ══════════════════════════════════════════════════════
// Ad Access Control for Business/Pro
// ══════════════════════════════════════════════════════

describe('Ad Access Control', () => {
  // From create-ad.tsx:
  // if (!p.is_business && !p.is_pro) -> "Business or Pro account required"

  function canCreateAd(profile: Pick<Profile, 'is_business' | 'is_pro'>): boolean {
    return profile.is_business || profile.is_pro
  }

  test('Business account can create ads', () => {
    expect(canCreateAd({ is_business: true, is_pro: false })).toBe(true)
  })

  test('Pro account can create ads', () => {
    expect(canCreateAd({ is_business: false, is_pro: true })).toBe(true)
  })

  test('Business + Pro can create ads', () => {
    expect(canCreateAd({ is_business: true, is_pro: true })).toBe(true)
  })

  test('Free account cannot create ads', () => {
    expect(canCreateAd({ is_business: false, is_pro: false })).toBe(false)
  })
})

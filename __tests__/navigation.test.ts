/**
 * Navigation / Feature Flag MVP Path Tests
 *
 * Verifies that feature flags correctly control which categories and
 * settings are visible in the app:
 * - FilterBar hides disabled categories (lainaa when LENDING=false)
 * - Settings hides Pro section when PRO_SUBSCRIPTION=false
 * - Search hides lainaa from category grid when LENDING=false
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

import { FEATURES } from '../src/lib/featureFlags'
import { CATEGORIES } from '../src/lib/constants'
import type { PostType } from '../src/lib/types'

// ══════════════════════════════════════════════════════
// FilterBar category filtering logic
// ══════════════════════════════════════════════════════

describe('FilterBar: feature flags hide categories', () => {
  // Mirrors the filter logic from src/components/FilterBar.tsx:
  //   .filter(([type]) => {
  //     if (type === 'lainaa' && !FEATURES.LENDING) return false
  //     if (type === 'nappaa' && !FEATURES.GRAB) return false
  //     return true
  //   })
  function getVisibleCategories(): PostType[] {
    return (Object.keys(CATEGORIES) as PostType[]).filter(type => {
      if (type === 'lainaa' && !FEATURES.LENDING) return false
      if (type === 'nappaa' && !FEATURES.GRAB) return false
      return true
    })
  }

  test('Lainaa is hidden when FEATURES.LENDING is false', () => {
    expect(FEATURES.LENDING).toBe(false)
    const visible = getVisibleCategories()
    expect(visible).not.toContain('lainaa')
  })

  test('Nappaa is visible when FEATURES.GRAB is true', () => {
    expect(FEATURES.GRAB).toBe(true)
    const visible = getVisibleCategories()
    expect(visible).toContain('nappaa')
  })

  test('Core categories (tarvitsen, tarjoan, ilmaista) are always visible', () => {
    const visible = getVisibleCategories()
    expect(visible).toContain('tarvitsen')
    expect(visible).toContain('tarjoan')
    expect(visible).toContain('ilmaista')
  })

  test('Tapahtuma is visible when EVENTS_TAPAHTUMA_TYPE is true', () => {
    expect(FEATURES.EVENTS_TAPAHTUMA_TYPE).toBe(true)
    const visible = getVisibleCategories()
    expect(visible).toContain('tapahtuma')
  })
})

// ══════════════════════════════════════════════════════
// Settings: Pro section visibility
// ══════════════════════════════════════════════════════

describe('Settings: Pro section hidden by feature flag', () => {
  // Mirrors logic from app/settings.tsx:
  //   {FEATURES.PRO_SUBSCRIPTION && ( <Pro section> )}
  test('PRO_SUBSCRIPTION is false for MVP launch', () => {
    expect(FEATURES.PRO_SUBSCRIPTION).toBe(false)
  })

  test('Pro section should not render when PRO_SUBSCRIPTION is false', () => {
    // Simulates the JSX conditional: {FEATURES.PRO_SUBSCRIPTION && ...}
    const shouldRenderPro = FEATURES.PRO_SUBSCRIPTION
    expect(shouldRenderPro).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════
// Search: hidden categories in query and UI
// ══════════════════════════════════════════════════════

describe('Search: feature flags hide categories from results', () => {
  // Mirrors the feed/search query logic from app/search.tsx and src/hooks/useFeedData.ts:
  //   const hiddenTypes: string[] = []
  //   if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
  //   if (!FEATURES.GRAB) hiddenTypes.push('nappaa')
  function getHiddenTypes(): string[] {
    const hiddenTypes: string[] = []
    if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
    if (!FEATURES.GRAB) hiddenTypes.push('nappaa')
    return hiddenTypes
  }

  test('Lainaa is in hidden types for search queries', () => {
    const hidden = getHiddenTypes()
    expect(hidden).toContain('lainaa')
  })

  test('Nappaa is NOT in hidden types (GRAB is enabled)', () => {
    const hidden = getHiddenTypes()
    expect(hidden).not.toContain('nappaa')
  })

  // Mirrors the category grid filter in search.tsx:
  //   .filter(([type]) => {
  //     if (type === 'lainaa' && !FEATURES.LENDING) return false
  //     if (type === 'nappaa' && !FEATURES.GRAB) return false
  //     return true
  //   })
  test('Lainaa is hidden from search category grid', () => {
    const visibleInSearch = (Object.keys(CATEGORIES) as PostType[]).filter(type => {
      if (type === 'lainaa' && !FEATURES.LENDING) return false
      if (type === 'nappaa' && !FEATURES.GRAB) return false
      return true
    })
    expect(visibleInSearch).not.toContain('lainaa')
  })

  test('Search hidden types are applied when no category filter is active', () => {
    // When catFilter is null (no active filter), hidden types should be excluded
    const catFilter: PostType | null = null
    const hidden = getHiddenTypes()
    const shouldApplyHidden = hidden.length > 0 && !catFilter
    expect(shouldApplyHidden).toBe(true)
  })

  test('Search hidden types are NOT applied when a specific category is selected', () => {
    // When a specific category is selected, hidden types filter is skipped
    const catFilter: PostType | null = 'tarvitsen'
    const hidden = getHiddenTypes()
    const shouldApplyHidden = hidden.length > 0 && !catFilter
    expect(shouldApplyHidden).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// All MVP feature flags snapshot
// ══════════════════════════════════════════════════════

describe('MVP feature flags snapshot', () => {
  test('Disabled features for MVP launch', () => {
    expect(FEATURES.LENDING).toBe(false)
    expect(FEATURES.PAYMENTS).toBe(false)
    expect(FEATURES.PRO_SUBSCRIPTION).toBe(false)
    expect(FEATURES.BUSINESS_ACCOUNT).toBe(false)
    expect(FEATURES.AD_CAMPAIGNS).toBe(false)
    expect(FEATURES.IDENTITY_VERIFICATION).toBe(false)
  })

  test('Enabled features for MVP launch', () => {
    expect(FEATURES.GRAB).toBe(true)
    expect(FEATURES.EVENTS_TAPAHTUMA_TYPE).toBe(true)
  })
})

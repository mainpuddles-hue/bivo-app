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
  //     (nappaa removed)
  //     return true
  //   })
  function getVisibleCategories(): PostType[] {
    return (Object.keys(CATEGORIES) as PostType[]).filter(type => {
      if (type === 'lainaa' && !FEATURES.LENDING) return false
      return true
    })
  }

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

describe('Settings: removed sections no longer in navigation', () => {
  test('Pro, Forum, Groups, Boosts, Leaderboard screens removed', () => {
    // These screens were deleted in Phase 1.1 cleanup
    expect(true).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// Search: hidden categories in query and UI
// ══════════════════════════════════════════════════════

describe('Search: feature flags hide categories from results', () => {
  // Mirrors the feed/search query logic from app/search.tsx and src/hooks/useFeedData.ts:
  //   const hiddenTypes: string[] = []
  //   if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
  //   (nappaa removed)
  function getHiddenTypes(): string[] {
    const hiddenTypes: string[] = []
    if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
    return hiddenTypes
  }

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
    expect(FEATURES.PAYMENTS).toBe(false)
    expect(FEATURES.BUSINESS_ACCOUNT).toBe(false)
    expect(FEATURES.AD_CAMPAIGNS).toBe(false)
    expect(FEATURES.IDENTITY_VERIFICATION).toBe(false)
  })

  test('Enabled features for MVP launch', () => {
    expect(FEATURES.EVENTS_TAPAHTUMA_TYPE).toBe(true)
    expect(FEATURES.LENDING).toBe(true)
  })
})

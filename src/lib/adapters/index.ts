// ── Adapter Factory ──
// Returns the correct country-specific adapter based on config type string.
// Uses lazy require() to avoid loading all adapters at startup.
//
// Only the business adapter is wired up to the app today (via upgrade-business
// screen). Identity / Events / Places adapters exist as scaffolding for
// future multi-country expansion — when they're actually needed, add the
// corresponding factory back here.

import type { BusinessAdapter } from './types'

// ── Business Adapters ──

const BUSINESS_ADAPTERS: Record<string, () => BusinessAdapter> = {
  prh: () => require('./business/prh').default,
  bolagsverket: () => require('./business/bolagsverket').default,
  ebr: () => require('./business/ebr').default,
  brreg: () => require('./business/brreg').default,
  handelsregister: () => require('./business/handelsregister').default,
  manual: () => require('./business/manual').default,
}

export function getBusinessAdapter(type: string): BusinessAdapter {
  const factory = BUSINESS_ADAPTERS[type] ?? BUSINESS_ADAPTERS.manual
  return factory()
}

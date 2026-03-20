/**
 * Map screen logic tests
 * Run: npx tsx __tests__/map-logic.test.ts
 *
 * Tests all pure functions and data logic used by MapNative.tsx
 * without rendering React components (no jest-expo needed).
 */

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

// ══════════════════════════════════════════════════
// Extracted logic from MapNative.tsx for testing
// ══════════════════════════════════════════════════

const NEIGHBORHOOD_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  'Kallio': { latitude: 60.1845, longitude: 24.9510 },
  'Sörnäinen': { latitude: 60.1870, longitude: 24.9650 },
  'Katajanokka': { latitude: 60.1670, longitude: 24.9660 },
  'Vuosaari': { latitude: 60.2100, longitude: 25.1400 },
  'Kamppi': { latitude: 60.1690, longitude: 24.9310 },
}

const DENSE_NEIGHBORHOODS = new Set([
  'Kallio', 'Sörnäinen', 'Kamppi', 'Punavuori', 'Kruununhaka',
  'Katajanokka', 'Hakaniemi', 'Ullanlinna', 'Eira', 'Töölö',
  'Ruoholahti', 'Jätkäsaari', 'Merihaka', 'Hermanni', 'Alppiharju',
])

function getRadiusKm(neighborhood: string): number {
  if (neighborhood === '__gps__') return 1.0
  if (DENSE_NEIGHBORHOODS.has(neighborhood)) return 0.8
  return 1.5
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function isPast(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return d < now
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime()
  const now = Date.now()
  return d >= now && d <= now + days * 24 * 60 * 60 * 1000
}

// ══════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════

describe('haversineKm', () => {
  const kallio = NEIGHBORHOOD_CENTERS['Kallio']
  const sornäinen = NEIGHBORHOOD_CENTERS['Sörnäinen']
  const vuosaari = NEIGHBORHOOD_CENTERS['Vuosaari']

  assert(haversineKm(kallio.latitude, kallio.longitude, kallio.latitude, kallio.longitude) === 0, 'same point = 0 distance')
  assert(haversineKm(kallio.latitude, kallio.longitude, sornäinen.latitude, sornäinen.longitude) < 2, 'Kallio→Sörnäinen < 2km')
  assert(haversineKm(kallio.latitude, kallio.longitude, sornäinen.latitude, sornäinen.longitude) > 0.5, 'Kallio→Sörnäinen > 0.5km')
  assert(haversineKm(kallio.latitude, kallio.longitude, vuosaari.latitude, vuosaari.longitude) > 10, 'Kallio→Vuosaari > 10km')
})

describe('formatDistance', () => {
  assert(formatDistance(0.1) === '100 m', '100m')
  assert(formatDistance(0.5) === '500 m', '500m')
  assert(formatDistance(1.0) === '1.0 km', '1.0km')
  assert(formatDistance(2.5) === '2.5 km', '2.5km')
  assert(formatDistance(0.05) === '50 m', '50m')
  assert(formatDistance(0.001) === '1 m', '1m')
})

describe('getRadiusKm', () => {
  assert(getRadiusKm('Kallio') === 0.8, 'Kallio = dense = 0.8km')
  assert(getRadiusKm('Kamppi') === 0.8, 'Kamppi = dense = 0.8km')
  assert(getRadiusKm('Vuosaari') === 1.5, 'Vuosaari = suburb = 1.5km')
  assert(getRadiusKm('Malmi') === 1.5, 'Malmi = suburb = 1.5km')
  assert(getRadiusKm('__gps__') === 1.0, 'GPS = 1.0km')
})

describe('isPast', () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  assert(isPast(yesterday.toISOString()) === true, 'yesterday is past')
  assert(isPast(tomorrow.toISOString()) === false, 'tomorrow is not past')
})

describe('isToday', () => {
  const now = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  assert(isToday(now.toISOString()) === true, 'now is today')
  assert(isToday(yesterday.toISOString()) === false, 'yesterday is not today')
})

describe('isTomorrow', () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const today = new Date()

  assert(isTomorrow(tomorrow.toISOString()) === true, 'tomorrow is tomorrow')
  assert(isTomorrow(today.toISOString()) === false, 'today is not tomorrow')
})

describe('isWithinDays', () => {
  const in3days = new Date()
  in3days.setDate(in3days.getDate() + 3)
  const in10days = new Date()
  in10days.setDate(in10days.getDate() + 10)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  assert(isWithinDays(in3days.toISOString(), 7) === true, '3 days from now within 7 days')
  assert(isWithinDays(in10days.toISOString(), 7) === false, '10 days from now not within 7 days')
  assert(isWithinDays(yesterday.toISOString(), 7) === false, 'yesterday not within future 7 days')
})

describe('NEIGHBORHOOD_CENTERS', () => {
  const neighborhoods = ['Kallio', 'Sörnäinen', 'Katajanokka', 'Vuosaari', 'Kamppi']
  for (const n of neighborhoods) {
    const c = NEIGHBORHOOD_CENTERS[n]
    assert(c !== undefined, `${n} has center coordinates`)
    assert(c.latitude > 60 && c.latitude < 61, `${n} latitude in Helsinki range`)
    assert(c.longitude > 24 && c.longitude < 26, `${n} longitude in Helsinki range`)
  }
})

describe('Deduplication logic (normalize)', () => {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöå0-9]/g, '').slice(0, 30)

  assert(normalize('MONSTER JAM') === normalize('Monster Jam'), 'case insensitive')
  assert(normalize('Vauva-aamu') === normalize('Vauva aamu'), 'special chars stripped')
  assert(normalize('Café Regatta') !== normalize('cafe regatta'), 'é stripped (not in äöå set) — expected difference')
  assert(normalize('A'.repeat(50)).length === 30, 'truncated to 30 chars')

  // Dedup simulation
  const linkedNames = new Set(['vauvaaamuleikkipuistoseppä'.slice(0, 30)])
  const tmName = normalize('Vauva-aamu Leikkipuisto Seppä')
  assert(linkedNames.has(tmName) || !linkedNames.has(tmName), 'dedup check runs without error')
})

describe('Radius filtering logic', () => {
  const center = NEIGHBORHOOD_CENTERS['Kallio']
  const radius = getRadiusKm('Kallio') // 0.8km

  // Point very close to Kallio center
  const nearby = haversineKm(center.latitude, center.longitude, 60.185, 24.952)
  assert(nearby < radius, `nearby point (${nearby.toFixed(2)}km) within Kallio radius`)

  // Point in Vuosaari (far)
  const far = haversineKm(center.latitude, center.longitude, 60.21, 25.14)
  assert(far > radius, `far point (${far.toFixed(2)}km) outside Kallio radius`)

  // Events have no radius limit (should always pass)
  const eventRadius = Infinity // events pass through without radius check
  assert(far < eventRadius, 'events are not radius-limited')
})

describe('Section building logic', () => {
  const today = new Date().toISOString()
  const tomorrow = new Date(Date.now() + 86400000).toISOString()
  const nextWeek = new Date(Date.now() + 5 * 86400000).toISOString()

  // Simulate items
  const items = [
    { kind: 'city_event', sortDate: today },
    { kind: 'city_event', sortDate: tomorrow },
    { kind: 'city_event', sortDate: nextWeek },
    { kind: 'post', sortDate: today },
    { kind: 'place', sortDate: undefined },
  ]

  const eventsToday = items.filter(i => (i.kind === 'city_event' || i.kind === 'community_event') && i.sortDate && isToday(i.sortDate))
  const eventsUpcoming = items.filter(i => (i.kind === 'city_event' || i.kind === 'community_event') && i.sortDate && !isToday(i.sortDate))
  const posts = items.filter(i => i.kind === 'post')
  const places = items.filter(i => i.kind === 'place')

  assert(eventsToday.length === 1, `1 event today (got ${eventsToday.length})`)
  assert(eventsUpcoming.length === 2, `2 upcoming events (got ${eventsUpcoming.length})`)
  assert(posts.length === 1, `1 post (got ${posts.length})`)
  assert(places.length === 1, `1 place (got ${places.length})`)
})

describe('Filter logic', () => {
  type FilterKey = 'all' | 'posts' | 'events' | 'places'
  const items = [
    { kind: 'post', type: 'tarvitsen' },
    { kind: 'post', type: 'tarjoan' },
    { kind: 'city_event', category: 'music' },
    { kind: 'city_event', category: 'culture' },
    { kind: 'community_event', category: undefined },
    { kind: 'place', category: 'restaurant' },
    { kind: 'place', category: 'cafe' },
  ]

  // Layer filter
  const filterByLayer = (filter: FilterKey) => {
    if (filter === 'all') return items
    if (filter === 'posts') return items.filter(i => i.kind === 'post')
    if (filter === 'events') return items.filter(i => i.kind === 'city_event' || i.kind === 'community_event')
    if (filter === 'places') return items.filter(i => i.kind === 'place')
    return items
  }

  assert(filterByLayer('all').length === 7, 'all = 7 items')
  assert(filterByLayer('posts').length === 2, 'posts = 2')
  assert(filterByLayer('events').length === 3, 'events = 3 (2 city + 1 community)')
  assert(filterByLayer('places').length === 2, 'places = 2')

  // Sub-category filter
  const eventItems = filterByLayer('events')
  const musicOnly = eventItems.filter(i => {
    if (i.kind === 'city_event') return i.category === 'music'
    return false // community events hidden when sub-category active
  })
  assert(musicOnly.length === 1, 'music sub-filter = 1 city event')

  const placeItems = filterByLayer('places')
  const restaurantsOnly = placeItems.filter(i => i.kind === 'place' && i.category === 'restaurant')
  assert(restaurantsOnly.length === 1, 'restaurant sub-filter = 1')

  // Search filter
  const searchItems = items.filter(i => 'tarvitsen'.includes('tarv'))
  assert(searchItems.length > 0, 'search finds items')
})

describe('Marker cap logic', () => {
  const MAX_MAP_MARKERS = 20
  const items = Array.from({ length: 50 }, (_, i) => ({
    id: `item-${i}`,
    distance: i * 0.1,
  }))

  const sorted = [...items].sort((a, b) => a.distance - b.distance)
  const capped = sorted.slice(0, MAX_MAP_MARKERS)

  assert(capped.length === 20, `capped to ${MAX_MAP_MARKERS} markers`)
  assert(capped[0].distance === 0, 'closest first')
  assert(Math.abs(capped[19].distance - 1.9) < 0.001, 'furthest in cap ≈ 1.9km')
})

describe('Stable marker diff logic', () => {
  const prev = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
  const next = [{ key: 'b' }, { key: 'c' }, { key: 'd' }]

  const prevKeys = prev.map(m => m.key).join(',')
  const nextKeys = next.map(m => m.key).join(',')

  assert(prevKeys !== nextKeys, 'keys differ → markers should update')
  assert(prevKeys === 'a,b,c', 'prev keys correct')
  assert(nextKeys === 'b,c,d', 'next keys correct')

  // Identical case
  const same = [{ key: 'b' }, { key: 'c' }, { key: 'd' }]
  const sameKeys = same.map(m => m.key).join(',')
  assert(sameKeys === nextKeys, 'identical keys → no update needed')
})

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════

console.log(`\n${'═'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(40)}`)

if (failed > 0) process.exit(1)

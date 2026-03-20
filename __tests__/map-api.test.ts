/**
 * Map API integration tests
 * Run: npx tsx __tests__/map-api.test.ts
 *
 * Tests real API calls to LinkedEvents, Ticketmaster, Palvelukartta.
 * Requires network access.
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

async function describe(name: string, fn: () => Promise<void>) {
  console.log(`\n${name}`)
  await fn()
}

async function main() {

// ══════════════════════════════════════════════════
// LinkedEvents API
// ══════════════════════════════════════════════════

await describe('LinkedEvents API — nearby events', async () => {
  const today = new Date().toISOString().split('T')[0]
  const lat = 60.1699, lng = 24.9384, radiusKm = 5
  const dLat = radiusKm / 111
  const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  const bbox = `${(lng - dLng).toFixed(4)},${(lat - dLat).toFixed(4)},${(lng + dLng).toFixed(4)},${(lat + dLat).toFixed(4)}`

  const url = `https://api.hel.fi/linkedevents/v1/event/?start=${today}&sort=start_time&page_size=10&include=location&language=fi&bbox=${bbox}`
  const res = await fetch(url)
  assert(res.ok, `API responds OK (${res.status})`)

  const json = await res.json()
  assert(json.meta?.count > 0, `has events (${json.meta.count} total)`)
  assert(json.data?.length > 0, `returns event data (${json.data.length} on page)`)
  assert(json.meta?.next !== undefined, 'has pagination (next field)')

  const first = json.data[0]
  assert(first.name?.fi || first.name?.en, `event has name: "${first.name?.fi}"`)
  assert(first.start_time, `event has start_time: "${first.start_time}"`)

  const loc = first.location
  assert(loc !== null && loc !== undefined, 'event has location object')

  // Check that Internet events exist (we filter them)
  const internetEvents = json.data.filter((e: any) => e.location?.name?.fi === 'Internet')
  console.log(`    (${internetEvents.length}/10 are "Internet" events — these get filtered)`)
})

// ══════════════════════════════════════════════════
// Ticketmaster API
// ══════════════════════════════════════════════════

await describe('Ticketmaster API — Helsinki events', async () => {
  const apiKey = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY ?? ''
  if (!apiKey) {
    console.log('  ⚠ EXPO_PUBLIC_TICKETMASTER_API_KEY not set, skipping')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?city=Helsinki&countryCode=FI&startDateTime=${today}T00:00:00Z&size=5&sort=date,asc&apikey=${apiKey}`
  const res = await fetch(url)
  assert(res.ok, `API responds OK (${res.status})`)

  const json = await res.json()
  const total = json.page?.totalElements ?? 0
  assert(total > 0, `has events (${total} total)`)

  const events = json._embedded?.events ?? []
  assert(events.length > 0, `returns event data (${events.length} on page)`)

  const first = events[0]
  assert(!!first.name, `event has name: "${first.name}"`)
  assert(!!first.dates?.start?.localDate, `event has date: "${first.dates.start.localDate}"`)

  const venue = first._embedded?.venues?.[0]
  assert(venue !== undefined, `event has venue object`)
  assert(!!venue?.location?.latitude || !!venue?.name, `venue has coordinates or name`)
})

// ══════════════════════════════════════════════════
// Helsinki Palvelukartta API
// ══════════════════════════════════════════════════

await describe('Palvelukartta API — places near Kallio', async () => {
  const url = `https://api.hel.fi/servicemap/v2/unit/?lat=60.1845&lon=24.9510&distance=1000&page_size=5&format=json&include=location`
  const res = await fetch(url)
  assert(res.ok, `API responds OK (${res.status})`)

  const json = await res.json()
  assert(json.count > 0, `has places (${json.count} total within 1km)`)
  assert(json.results?.length > 0, `returns place data (${json.results.length} on page)`)

  const first = json.results[0]
  assert(!!first.name?.fi, `place has Finnish name: "${first.name.fi}"`)
  assert(!!first.street_address?.fi, `place has address: "${first.street_address.fi}"`)

  const loc = first.location
  if (loc?.coordinates) {
    assert(loc.coordinates.length === 2, 'has [lng, lat] coordinates')
    assert(loc.coordinates[0] > 24 && loc.coordinates[0] < 26, 'longitude in Helsinki range')
    assert(loc.coordinates[1] > 60 && loc.coordinates[1] < 61, 'latitude in Helsinki range')
  }

  // Check pagination
  assert(json.next !== undefined, 'has pagination support')
})

// ══════════════════════════════════════════════════
// Cross-API: deduplication sanity check
// ══════════════════════════════════════════════════

await describe('Cross-API deduplication', async () => {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöå0-9]/g, '').slice(0, 30)

  // Simulate: same event from both sources
  const linkedName = 'Helsingin juhlaviikot 2026'
  const tmName = 'Helsingin Juhlaviikot 2026'

  assert(normalize(linkedName) === normalize(tmName), 'same event deduplicated correctly')

  // Different events should NOT match
  const different1 = 'Monster Jam Arena Show'
  const different2 = 'Vauva-aamu leikkipuistossa'
  assert(normalize(different1) !== normalize(different2), 'different events not deduplicated')
})

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════

console.log(`\n${'═'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(40)}`)

if (failed > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })

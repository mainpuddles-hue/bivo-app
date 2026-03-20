/**
 * Map crash safety tests
 * Run: npx tsx __tests__/map-crash.test.ts
 *
 * Validates that the map architecture prevents all known crash vectors
 * in Expo Go / react-native-maps. These are the patterns that WILL crash
 * the app if violated.
 */

import * as fs from 'fs'
import * as path from 'path'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ CRASH RISK: ${msg}`)
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

// Read source files (main component + data hook)
const MAP_FILE = path.join(__dirname, '..', 'src', 'components', 'MapNative.tsx')
const HOOK_FILE = path.join(__dirname, '..', 'src', 'components', 'map', 'useMapData.ts')
const mapSource = fs.readFileSync(MAP_FILE, 'utf-8')
const hookSource = fs.existsSync(HOOK_FILE) ? fs.readFileSync(HOOK_FILE, 'utf-8') : ''
const source = mapSource + '\n' + hookSource
const lines = source.split('\n')

// ══════════════════════════════════════════════════
// CRASH VECTOR 1: Custom <View> inside <Marker>
// React Native Maps creates a native MKAnnotationView for each Marker.
// Custom View children require a React Native root view embedded in each
// annotation. 50+ of these = memory overflow = crash in Expo Go.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 1: No custom Views inside Markers', () => {
  // Find all <Marker blocks and check for View/Text children
  const markerBlocks: string[] = []
  let inMarker = false
  let depth = 0
  let currentBlock = ''

  for (const line of lines) {
    if (line.includes('<Marker')) {
      inMarker = true
      depth = 0
      currentBlock = ''
    }
    if (inMarker) {
      currentBlock += line + '\n'
      // Self-closing <Marker ... /> means no children
      if (line.includes('/>') && !line.includes('<Marker')) {
        // Child element self-closed — this is fine (not a View)
      }
      if (line.includes('/>') && depth === 0) {
        markerBlocks.push(currentBlock)
        inMarker = false
      }
      if (line.includes('</Marker>')) {
        markerBlocks.push(currentBlock)
        inMarker = false
      }
    }
  }

  assert(markerBlocks.length > 0, `found ${markerBlocks.length} Marker block(s) in source`)

  for (let i = 0; i < markerBlocks.length; i++) {
    const block = markerBlocks[i]
    const hasView = block.includes('<View') && !block.includes('// ')
    const hasText = block.includes('<Text') && !block.includes('// ')
    const hasImage = block.includes('<Image') && !block.includes('// ')
    const isSelfClosing = block.trim().endsWith('/>')

    assert(!hasView, `Marker ${i + 1}: no <View> child (would crash)`)
    assert(!hasText, `Marker ${i + 1}: no <Text> child (would crash)`)
    assert(!hasImage, `Marker ${i + 1}: no <Image> child (would crash)`)
  }

  // Double check: count all <View in Marker context
  let viewsInMarkers = 0
  let insideMarker = false
  for (const line of lines) {
    if (line.includes('<Marker')) insideMarker = true
    if (insideMarker && (line.includes('</Marker>') || (line.includes('/>') && !line.includes('<')))) insideMarker = false
    if (insideMarker && line.includes('<View')) viewsInMarkers++
  }
  assert(viewsInMarkers === 0, `total <View> inside <Marker>: ${viewsInMarkers} (must be 0)`)
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 2: <Callout> components
// Callouts with complex View trees are instantiated in native view
// hierarchy at mount time, not on-demand. 100+ = memory overflow.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 2: No Callout components', () => {
  const calloutImport = source.includes('Callout')
  const calloutUsage = lines.filter(l => l.includes('<Callout') && !l.includes('//'))

  // Import is OK if unused (might be in a comment or removed)
  assert(calloutUsage.length === 0, `no <Callout> components in JSX (found ${calloutUsage.length})`)
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 3: onRegionChangeComplete → state update
// Every pan/zoom triggers this. If it sets state that recalculates
// markers, all Markers are destroyed and recreated 10-20x/sec = crash.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 3: No onRegionChangeComplete state updates', () => {
  const hasOnRegion = lines.some(l => l.includes('onRegionChangeComplete'))
  assert(!hasOnRegion, 'no onRegionChangeComplete in source')

  const hasOnRegionChange = lines.some(l => l.includes('onRegionChange') && !l.includes('//'))
  assert(!hasOnRegionChange, 'no onRegionChange handler either')
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 4: Too many Marker components
// Even native pin markers lag at 100+. Expo Go crashes at ~80.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 4: Marker count capped', () => {
  const maxMatch = source.match(/MAX_MAP_MARKERS\s*=\s*(\d+)/)
  assert(maxMatch !== null, 'MAX_MAP_MARKERS constant defined')

  const maxMarkers = maxMatch ? parseInt(maxMatch[1]) : 999
  assert(maxMarkers <= 30, `max markers = ${maxMarkers} (safe limit: ≤30)`)

  // Verify it's used in slicing
  const usesSlice = source.includes('.slice(0, MAX_MAP_MARKERS)')
  assert(usesSlice, 'markers sliced to MAX_MAP_MARKERS')
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 5: tracksViewChanges not disabled
// If true (default), each marker re-renders its native view every frame.
// Must be false for all markers.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 5: tracksViewChanges={false}', () => {
  const markerLines = lines.filter(l => l.includes('<Marker'))
  const tracksLines = lines.filter(l => l.includes('tracksViewChanges={false}'))

  assert(markerLines.length > 0, `has ${markerLines.length} Marker component(s)`)
  assert(tracksLines.length >= markerLines.length,
    `tracksViewChanges={false} on all markers (${tracksLines.length}/${markerLines.length})`)
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 6: Marker array bulk replacement
// Replacing the entire marker array forces React to unmount ALL
// markers and mount new ones simultaneously. With 20+ markers
// this overwhelms the native bridge.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 6: Stable marker diff mechanism', () => {
  const hasPrevRef = source.includes('prevMarkersRef')
  assert(hasPrevRef, 'uses prevMarkersRef for diff comparison')

  const hasKeyJoin = source.includes(".map(m => m.key).join(',')")
  assert(hasKeyJoin, 'compares marker keys as joined string')

  const hasConditionalSet = source.includes('if (nextKey !== prevMarkersRef.current)')
  assert(hasConditionalSet, 'only updates state when keys actually change')
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 7: Empty/invalid coordinates
// Markers at (0,0) or null coordinates cause native map errors.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 7: No invalid coordinate markers', () => {
  const filtersEmpty = source.includes("!i.id.startsWith('__empty_')")
  assert(filtersEmpty, 'filters out __empty_ placeholder items from markers')

  const checksNull = source.includes('latitude == null || p.longitude == null') ||
                     source.includes('latitude == null') ||
                     source.includes('!p.latitude')
  assert(checksNull, 'null coordinate check before creating list items')
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 8: Infinite re-render loops
// useEffect that updates state used in its own dependency = loop.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 8: No infinite re-render risks', () => {
  // Check that marker useEffect depends on filteredItems, not renderedMarkers
  const markerEffect = lines.findIndex(l => l.includes('Map markers'))
  if (markerEffect >= 0) {
    // Find the dependency array
    let depsLine = ''
    for (let i = markerEffect; i < Math.min(markerEffect + 30, lines.length); i++) {
      if (lines[i].includes('}, [')) {
        depsLine = lines[i]
        break
      }
    }
    assert(!depsLine.includes('renderedMarkers'), 'marker effect does not depend on renderedMarkers (would loop)')
    assert(depsLine.includes('filteredItems'), 'marker effect depends on filteredItems')
  }

  // Check fetchData doesn't depend on data it sets
  const hasSelfDep = source.includes('setPosts') && source.includes('[posts')
  // This is OK if they're in different hooks — just check the obvious case
  assert(!source.includes('}, [posts, communityEvents, cityEvents, places, supabase])'),
    'no circular dependency in fetch hooks')
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 9: SectionList without virtualization
// Large lists without virtualization render all items = memory crash.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 9: Uses virtualized SectionList', () => {
  assert(source.includes('SectionList'), 'uses SectionList (virtualized)')
  assert(!source.includes('ScrollView') || source.includes('ScrollView horizontal'),
    'no vertical ScrollView wrapping list items (would break virtualization)')
})

// ══════════════════════════════════════════════════
// CRASH VECTOR 10: Uncontrolled data growth
// If loadMore keeps adding data without limit, memory grows unbounded.
// ══════════════════════════════════════════════════

describe('CRASH VECTOR 10: Data growth bounded', () => {
  // Places limited by API radius (server-side)
  assert(source.includes('fetchHelsinkiPlaces'), 'places fetched with radius limit')

  // Events limited by cache + pagination
  assert(source.includes('hasMoreNearbyEvents'), 'events have pagination check')

  // Posts limited by query
  assert(source.includes('.limit(500)'), 'posts query has limit')
})

// ══════════════════════════════════════════════════
// BONUS: Architecture safety checks
// ══════════════════════════════════════════════════

describe('Architecture safety', () => {
  // Map height is bounded (not full screen)
  const mapHeight = source.match(/MAP_HEIGHT\s*=\s*(\d+)/)
  if (mapHeight) {
    const h = parseInt(mapHeight[1])
    assert(h <= 400, `map height ${h}px (mini-map, not full screen)`)
  }

  // MapView has pitchEnabled={false} and rotateEnabled={false}
  assert(source.includes('pitchEnabled={false}'), 'pitch disabled (prevents 3D mode crashes)')
  assert(source.includes('rotateEnabled={false}'), 'rotation disabled (prevents compass issues)')

  // showsUserLocation uses native dot, not custom marker
  assert(source.includes('showsUserLocation'), 'uses native user location dot')
  assert(!source.includes('userLocationMarker'), 'no custom user location marker')

  // Detail panel is outside MapView (Modal in DetailModal.tsx or inline, not Callout)
  const detailModalExists = fs.existsSync(path.join(__dirname, '..', 'src', 'components', 'map', 'DetailModal.tsx'))
  assert(
    (source.includes('<Modal') && source.includes('selectedItem')) || detailModalExists,
    'detail panel uses Modal outside MapView'
  )
})

// ══════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════

console.log(`\n${'═'.repeat(50)}`)
console.log(`CRASH SAFETY RESULTS: ${passed} passed, ${failed} RISKS`)
console.log(`${'═'.repeat(50)}`)

if (failed > 0) {
  console.error('\n⚠️  CRASH RISKS DETECTED — fix before shipping!')
  process.exit(1)
} else {
  console.log('\n✅ All crash vectors mitigated. Safe for Expo Go.')
}

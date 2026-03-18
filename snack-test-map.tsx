// TackBird MapNative — Expo Snack test version
// Paste this into snack.expo.dev to preview native map
// Dependencies needed in Snack: react-native-maps

import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps'

const HELSINKI = { latitude: 60.1699, longitude: 24.9384, latitudeDelta: 0.08, longitudeDelta: 0.08 }

// Test data — mimics real TackBird data
const POSTS = [
  { id: '1', type: 'tarvitsen', title: 'Tarvitsen porakoneen', location: 'Kallio', lat: 60.1844, lng: 24.9496, color: '#C75B3A' },
  { id: '2', type: 'tarjoan', title: 'Tarjoan apua muutossa', location: 'Sörnäinen', lat: 60.1870, lng: 24.9700, color: '#7C5CBF' },
  { id: '3', type: 'ilmaista', title: 'Ilmainen sohva', location: 'Vallila', lat: 60.1930, lng: 24.9530, color: '#3B7DD8' },
  { id: '4', type: 'nappaa', title: 'Nappaa: vintage-kirjoja', location: 'Kamppi', lat: 60.1686, lng: 24.9316, color: '#E8A050' },
  { id: '5', type: 'lainaa', title: 'Lainattavana polkupyörä', location: 'Töölö', lat: 60.1810, lng: 24.9220, color: '#C98B2E' },
]

const EVENTS = [
  { id: 'e1', title: 'Naapuruston grilli-ilta', date: '2026-03-20', location: 'Kallio', lat: 60.1850, lng: 24.9510 },
  { id: 'e2', title: 'Kirppis Sörnäisissä', date: '2026-03-22', location: 'Sörnäinen', lat: 60.1880, lng: 24.9680 },
]

const CITY_EVENTS = [
  { id: 'ce1', name: 'Helsinki Design Week', category: 'culture', lat: 60.1699, lng: 24.9384, color: '#8E44AD', free: true },
  { id: 'ce2', name: 'Musiikkitalo: Jazz Night', category: 'music', lat: 60.1745, lng: 24.9310, color: '#E91E63', free: false },
  { id: 'ce3', name: 'Lasten lauantai', category: 'family', lat: 60.1730, lng: 24.9560, color: '#FF9800', free: true },
]

const PLACES = [
  { id: 'p1', name: 'Café Regatta', category: 'cafe', lat: 60.1790, lng: 24.9110, color: '#8B5E3C' },
  { id: 'p2', name: 'Ravintola Savotta', category: 'restaurant', lat: 60.1685, lng: 24.9525, color: '#E74C3C' },
  { id: 'p3', name: 'Oodi-kirjasto', category: 'library', lat: 60.1740, lng: 24.9380, color: '#27AE60' },
  { id: 'p4', name: 'Allas Sea Pool', category: 'sport', lat: 60.1670, lng: 24.9570, color: '#F39C12' },
]

export default function MapNativeTest() {
  const [showPosts, setShowPosts] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showPlaces, setShowPlaces] = useState(true)

  const totalVisible =
    (showPosts ? POSTS.length : 0) +
    (showEvents ? EVENTS.length + CITY_EVENTS.length : 0) +
    (showPlaces ? PLACES.length : 0)

  return (
    <View style={s.container}>
      <MapView style={s.map} initialRegion={HELSINKI} provider={PROVIDER_DEFAULT} showsUserLocation>
        {/* Posts */}
        {showPosts && POSTS.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} pinColor={p.color}>
            <Callout>
              <View style={s.callout}>
                <View style={[s.catDot, { backgroundColor: p.color }]} />
                <Text style={s.calloutTitle}>{p.title}</Text>
                <Text style={s.calloutSub}>{p.location}</Text>
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Community events */}
        {showEvents && EVENTS.map((e) => (
          <Marker key={e.id} coordinate={{ latitude: e.lat, longitude: e.lng }} pinColor="#2B8A62">
            <Callout>
              <View style={s.callout}>
                <Text style={[s.calloutTitle, { color: '#2B8A62' }]}>{e.title}</Text>
                <Text style={s.calloutSub}>{e.date} · {e.location}</Text>
              </View>
            </Callout>
          </Marker>
        ))}

        {/* City events */}
        {showEvents && CITY_EVENTS.map((ce) => (
          <Marker key={ce.id} coordinate={{ latitude: ce.lat, longitude: ce.lng }} pinColor={ce.color}>
            <Callout>
              <View style={s.callout}>
                <Text style={[s.calloutTitle, { color: ce.color }]}>{ce.name}</Text>
                <Text style={s.calloutSub}>{ce.category}{ce.free ? ' · Ilmainen' : ''}</Text>
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Places */}
        {showPlaces && PLACES.map((pl) => (
          <Marker key={pl.id} coordinate={{ latitude: pl.lat, longitude: pl.lng }} pinColor={pl.color}>
            <Callout>
              <View style={s.callout}>
                <Text style={s.calloutTitle}>{pl.name}</Text>
                <Text style={s.calloutSub}>{pl.category}</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Layer pills */}
      <View style={s.pills}>
        <Pressable onPress={() => setShowPosts(!showPosts)} style={[s.pill, { backgroundColor: showPosts ? '#2D6B5E' : '#fff' }]}>
          <Text style={[s.pillText, { color: showPosts ? '#fff' : '#666' }]}>Ilmoitukset ({POSTS.length})</Text>
        </Pressable>
        <Pressable onPress={() => setShowEvents(!showEvents)} style={[s.pill, { backgroundColor: showEvents ? '#2B8A62' : '#fff' }]}>
          <Text style={[s.pillText, { color: showEvents ? '#fff' : '#666' }]}>Tapahtumat ({EVENTS.length + CITY_EVENTS.length})</Text>
        </Pressable>
        <Pressable onPress={() => setShowPlaces(!showPlaces)} style={[s.pill, { backgroundColor: showPlaces ? '#78716C' : '#fff' }]}>
          <Text style={[s.pillText, { color: showPlaces ? '#fff' : '#666' }]}>Paikat ({PLACES.length})</Text>
        </Pressable>
      </View>

      {/* Count bar */}
      <View style={s.countBar}>
        <Text style={s.countText}>{totalVisible} kohdetta kartalla</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  pills: { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', gap: 6 },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
  countBar: { position: 'absolute', bottom: 30, left: 60, right: 60, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  countText: { fontSize: 13, fontWeight: '500', color: '#333' },
  callout: { padding: 4, maxWidth: 200 },
  calloutTitle: { fontSize: 14, fontWeight: '600' },
  calloutSub: { fontSize: 11, color: '#666', marginTop: 2 },
  catDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
})

import { useState, useRef, useCallback } from 'react'
import { View, TextInput, Text, Pressable, StyleSheet, ActivityIndicator, Keyboard } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

/** Photon API feature properties */
interface PhotonProps {
  name?: string
  street?: string
  housenumber?: string
  postcode?: string
  city?: string
  district?: string
  suburb?: string       // used for neighborhoods like Katajanokka
  state?: string
  country?: string
  osm_value?: string    // suburb, residential, house, etc.
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] } // [lng, lat]
  properties: PhotonProps
}

interface LocationAutocompleteProps {
  value: string
  onChangeText: (text: string) => void
  onSelect?: (location: { name: string; lat: number; lng: number }) => void
  placeholder?: string
  maxLength?: number
  accessibilityLabel?: string
  /** Additional style for the outer container */
  style?: object
  /** Show MapPin icon on the left */
  showIcon?: boolean
}

// Helsinki center for location bias
const HELSINKI_LAT = 60.17
const HELSINKI_LNG = 24.94

/**
 * TextInput with Photon (Komoot) address autocomplete.
 * Supports partial/prefix search (e.g. "kataj" → "Katajanokka").
 * Biased towards Helsinki area. Free, no API key required.
 */
export function LocationAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder,
  maxLength = 200,
  accessibilityLabel,
  style,
  showIcon = false,
}: LocationAutocompleteProps) {
  const { colors } = useTheme()
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectingRef = useRef(false)

  const search = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoading(true)
    try {
      const encoded = encodeURIComponent(query)
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encoded}&limit=5&lat=${HELSINKI_LAT}&lon=${HELSINKI_LNG}&lang=default`,
      )
      if (!res.ok) throw new Error('Network error')
      const data = await res.json()
      const features: PhotonFeature[] = data.features ?? []
      // Filter to Finland only and deduplicate by label
      const seen = new Set<string>()
      const filtered = features.filter(f => {
        const c = f.properties.country
        if (c && c !== 'Suomi' && c !== 'Finland') return false
        const label = formatSuggestion(f)
        if (seen.has(label)) return false
        seen.add(label)
        return true
      })
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } catch {
      setSuggestions([])
      setShowSuggestions(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChangeText = useCallback((text: string) => {
    onChangeText(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 300)
  }, [onChangeText, search])

  const handleSelect = useCallback((f: PhotonFeature) => {
    selectingRef.current = true
    const formatted = formatSuggestion(f)
    const [lng, lat] = f.geometry.coordinates
    onChangeText(formatted)
    setSuggestions([])
    setShowSuggestions(false)
    Keyboard.dismiss()
    onSelect?.({ name: formatted, lat, lng })
    setTimeout(() => { selectingRef.current = false }, 300)
  }, [onChangeText, onSelect])

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.inputRow, showIcon && styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {showIcon && <MapPin size={18} color={colors.mutedForeground} />}
        <TextInput
          style={[styles.input, !showIcon && styles.inputStandalone, { color: colors.foreground, fontFamily: fonts.body }]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          maxLength={maxLength}
          accessibilityLabel={accessibilityLabel}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
          onBlur={() => { if (!selectingRef.current) setTimeout(() => setShowSuggestions(false), 250) }}
        />
        {loading && <ActivityIndicator size="small" color={colors.foreground} style={styles.loader} />}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {suggestions.map((f, i) => (
            <Pressable
              key={`${f.geometry.coordinates[0]}-${f.geometry.coordinates[1]}-${i}`}
              onPress={() => handleSelect(f)}
              style={({ pressed }) => [
                styles.suggestion,
                { borderBottomColor: colors.border },
                i === suggestions.length - 1 && { borderBottomWidth: 0 },
                pressed && { backgroundColor: `${colors.foreground}14` },
              ]}
            >
              <MapPin size={14} color={colors.mutedForeground} />
              <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>
                {formatSuggestion(f)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

/** Format a Photon feature into a human-readable label */
function formatSuggestion(f: PhotonFeature): string {
  const p = f.properties
  const parts: string[] = []

  // Street + housenumber
  if (p.street) {
    parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street)
  }

  // Name (place name, POI, neighborhood) — only if different from street
  if (p.name && p.name !== p.street && p.name !== p.city) {
    // If no street, name goes first; otherwise append
    if (!p.street) {
      parts.unshift(p.name)
    } else {
      parts.push(p.name)
    }
  }

  // Suburb/district (neighborhood)
  if (p.suburb && p.suburb !== p.name) {
    parts.push(p.suburb)
  } else if (p.district && p.district !== p.name && p.district !== p.suburb) {
    parts.push(p.district)
  }

  // City with postcode
  if (p.city) {
    parts.push(p.postcode ? `${p.postcode} ${p.city}` : p.city)
  }

  return parts.length > 0 ? parts.join(', ') : p.name ?? ''
}

const styles = StyleSheet.create({
  container: { zIndex: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
  },
  inputWithIcon: {
    gap: 8,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 16,
  },
  inputStandalone: {
    paddingHorizontal: 16,
  },
  loader: { marginRight: 12 },
  dropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    marginTop: -4,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
})

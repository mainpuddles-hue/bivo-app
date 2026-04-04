import { useState, useRef, useCallback } from 'react'
import { View, TextInput, Text, Pressable, StyleSheet, ActivityIndicator, Keyboard } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface Suggestion {
  display_name: string
  lat: string
  lon: string
  address?: {
    road?: string
    house_number?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    postcode?: string
    neighbourhood?: string
  }
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

/**
 * TextInput with Nominatim address autocomplete.
 * Debounces input by 400ms, searches Finland (countrycodes=fi).
 * Returns formatted address + coordinates on selection.
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoading(true)
    try {
      const encoded = encodeURIComponent(query)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=fi&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'fi,en', 'User-Agent': 'TackBird-Mobile/1.0' } },
      )
      if (!res.ok) throw new Error('Network error')
      const data: Suggestion[] = await res.json()
      setSuggestions(data)
      setShowSuggestions(data.length > 0)
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
    debounceRef.current = setTimeout(() => search(text), 400)
  }, [onChangeText, search])

  const formatSuggestion = (s: Suggestion): string => {
    const addr = s.address
    if (!addr) return s.display_name.split(',').slice(0, 3).join(', ')

    const parts: string[] = []
    if (addr.road) {
      parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road)
    }
    if (addr.neighbourhood || addr.suburb) {
      parts.push(addr.neighbourhood ?? addr.suburb ?? '')
    }
    const city = addr.city ?? addr.town ?? addr.village
    if (city) {
      parts.push(addr.postcode ? `${addr.postcode} ${city}` : city)
    }
    return parts.length > 0 ? parts.join(', ') : s.display_name.split(',').slice(0, 3).join(', ')
  }

  const handleSelect = useCallback((s: Suggestion) => {
    const formatted = formatSuggestion(s)
    onChangeText(formatted)
    setSuggestions([])
    setShowSuggestions(false)
    Keyboard.dismiss()
    onSelect?.({
      name: formatted,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.lon),
    })
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
          onBlur={() => { setTimeout(() => setShowSuggestions(false), 200) }}
        />
        {loading && <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {suggestions.map((s, i) => (
            <Pressable
              key={`${s.lat}-${s.lon}-${i}`}
              onPress={() => handleSelect(s)}
              style={({ pressed }) => [
                styles.suggestion,
                { borderBottomColor: colors.border },
                i === suggestions.length - 1 && { borderBottomWidth: 0 },
                pressed && { backgroundColor: `${colors.primary}14` },
              ]}
            >
              <MapPin size={14} color={colors.mutedForeground} />
              <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>
                {formatSuggestion(s)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { zIndex: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
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
    gap: 10,
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

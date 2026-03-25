import { memo } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native'
import { Search, X } from 'lucide-react-native'

const shadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }

export interface SearchResult {
  type: string
  name: string
  lat: number
  lng: number
  category?: string
}

interface MapSearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  onClear: () => void
  placeholder: string
  results: SearchResult[]
  onResultPress: (result: SearchResult) => void
  colors: {
    card: string
    border: string
    foreground: string
    mutedForeground: string
    primary: string
  }
  t: (key: string) => string
}

export const MapSearchBar = memo(function MapSearchBar({
  query,
  onQueryChange,
  onClear,
  placeholder,
  results,
  onResultPress,
  colors,
  t,
}: MapSearchBarProps) {
  return (
    <View>
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Search size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          autoFocus
        />
        {query.length > 0 && (
          <Pressable onPress={onClear} hitSlop={8}>
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {results.length > 0 && (
        <ScrollView
          style={[styles.searchResults, { backgroundColor: colors.card, borderColor: colors.border }]}
          keyboardShouldPersistTaps="handled"
        >
          {results.map((r, i) => (
            <Pressable
              key={i}
              onPress={() => onResultPress(r)}
              style={[
                styles.searchItem,
                i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.searchBadge,
                  {
                    backgroundColor:
                      r.type === 'post'
                        ? `${colors.primary}20`
                        : r.type === 'event'
                          ? '#2B8A6220'
                          : r.type === 'city_event'
                            ? '#8E44AD20'
                            : '#78716C20',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.searchBadgeText,
                    {
                      color:
                        r.type === 'post'
                          ? colors.primary
                          : r.type === 'event'
                            ? '#2B8A62'
                            : r.type === 'city_event'
                              ? '#8E44AD'
                              : '#78716C',
                    },
                  ]}
                >
                  {r.type === 'post'
                    ? t('map.layerPosts')
                    : r.type === 'event'
                      ? t('map.layerEvents')
                      : r.type === 'city_event'
                        ? 'Helsinki'
                        : t('map.layerPlaces')}
                </Text>
              </View>
              <Text style={[styles.searchName, { color: colors.foreground }]} numberOfLines={1}>
                {r.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    ...shadow,
  },
  searchInput: { flex: 1, fontSize: 14 },
  searchResults: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  searchBadgeText: { fontSize: 10, fontWeight: '600' },
  searchName: { fontSize: 14, flex: 1 },
})

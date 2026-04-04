import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { X, Navigation } from 'lucide-react-native'
import { CityMapIllustration } from '@/components/illustrations'
import { fonts } from '@/lib/fonts'
import type { ThemeColors } from './types'
import { formatDistance } from './constants'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface NeighborhoodModalProps {
  visible: boolean
  selected: string
  neighborhoods: readonly string[]
  centers: Record<string, { latitude: number; longitude: number }>
  userLocation: { latitude: number; longitude: number } | null
  colors: ThemeColors
  t: (key: string) => string
  onSelect: (neighborhood: string) => void
  onGPSSelect: () => void
  onClose: () => void
}

export function NeighborhoodModal({
  visible,
  selected,
  neighborhoods,
  centers,
  userLocation,
  colors,
  t,
  onSelect,
  onGPSSelect,
  onClose,
}: NeighborhoodModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <CityMapIllustration size={60} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t('map.selectArea')}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* GPS option */}
        <Pressable
          style={[styles.neighborhoodRow, {
            borderBottomColor: colors.border,
            backgroundColor: selected === '__gps__' ? colors.muted : colors.card,
          }]}
          onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} onGPSSelect() }}
        >
          <Navigation size={18} color={colors.primary} />
          <Text style={[styles.neighborhoodRowText, { color: colors.primary, fontFamily: fonts.bodySemi }]}>
            {t('map.myLocation')}
          </Text>
        </Pressable>

        <FlatList
          data={userLocation
            ? [...neighborhoods].sort((a, b) => {
                const ca = centers[a]; const cb = centers[b]
                if (!ca || !cb) return 0
                return haversineKm(userLocation.latitude, userLocation.longitude, ca.latitude, ca.longitude)
                  - haversineKm(userLocation.latitude, userLocation.longitude, cb.latitude, cb.longitude)
              }) as unknown as string[]
            : neighborhoods as unknown as string[]
          }
          keyExtractor={item => item}
          renderItem={({ item }: { item: string }) => (
            <Pressable
              style={[styles.neighborhoodRow, {
                borderBottomColor: colors.border,
                backgroundColor: selected === item ? colors.muted : colors.card,
              }]}
              onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} onSelect(item) }}
            >
              <Text style={[
                styles.neighborhoodRowText,
                { color: colors.foreground },
                selected === item && { color: colors.primary, fontFamily: fonts.bodySemi },
              ]}>
                {item}
              </Text>
              {userLocation && centers[item] && (
                <Text style={[styles.neighborhoodRowDist, { color: colors.mutedForeground }]}>
                  {formatDistance(haversineKm(userLocation.latitude, userLocation.longitude, centers[item].latitude, centers[item].longitude))}
                </Text>
              )}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.18,
    lineHeight: 24,
  },
  neighborhoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  neighborhoodRowText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    flex: 1,
  },
  neighborhoodRowDist: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
})

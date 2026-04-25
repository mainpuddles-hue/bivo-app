declare const __DEV__: boolean

import { useState, useCallback } from 'react'
import { View, Text, Modal, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { MapPin, Navigation, X, Check } from 'lucide-react-native'
import * as Location from 'expo-location'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { useToast } from '@/components/Toast'
import { getCachedUserId } from '@/lib/authCache'
import { LocationAutocomplete, type LocationResult } from '@/components/LocationAutocomplete'
import { PressableOpacity } from '@/components/ui'
import { haversineKm } from '@/lib/geo'
import { fonts } from '@/lib/fonts'

/** Maximum distance (km) between GPS and claimed address to pass verification */
const MAX_DISTANCE_KM = 0.5

interface Props {
  visible: boolean
  onClose: () => void
  onVerified: () => void
}

type Step = 'address' | 'locating' | 'success' | 'failed'

export function AddressVerificationModal({ visible, onClose, onVerified }: Props) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()
  const toast = useToast()

  const [addressText, setAddressText] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null)
  const [step, setStep] = useState<Step>('address')
  const [distanceKm, setDistanceKm] = useState<number | null>(null)

  const reset = useCallback(() => {
    setAddressText('')
    setSelectedLocation(null)
    setStep('address')
    setDistanceKm(null)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleSelect = useCallback((location: LocationResult) => {
    setSelectedLocation(location)
  }, [])

  const handleVerify = useCallback(async () => {
    if (!selectedLocation) return
    setStep('locating')

    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          t('addressVerification.locationRequired'),
          t('addressVerification.locationRequiredDesc'),
        )
        setStep('address')
        return
      }

      // Get current GPS position
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const gpsLat = position.coords.latitude
      const gpsLng = position.coords.longitude
      const addrLat = selectedLocation.lat
      const addrLng = selectedLocation.lng

      const distance = haversineKm(gpsLat, gpsLng, addrLat, addrLng)
      setDistanceKm(distance)

      if (distance <= MAX_DISTANCE_KM) {
        // Verified — save to profile
        const userId = await getCachedUserId()
        if (!userId) { setStep('address'); return }

        const neighborhood = selectedLocation.neighborhood || selectedLocation.city || ''
        const fullAddress = addressText

        const { error } = await (supabase.from('profiles') as any).update({
          address_verified: true,
          verified_address: fullAddress,
          address_verified_at: new Date().toISOString(),
          naapurusto: neighborhood || undefined,
        }).eq('id', userId)

        if (error) {
          if (__DEV__) console.warn('[addressVerify] profile update failed:', error.message)
          toast.show({ message: t('common.error'), type: 'error' })
          setStep('address')
          return
        }

        setStep('success')
      } else {
        setStep('failed')
      }
    } catch (e: any) {
      if (__DEV__) console.warn('[addressVerify] error:', e)
      toast.show({ message: t('common.error'), type: 'error' })
      setStep('address')
    }
  }, [selectedLocation, addressText, supabase, t, toast])

  const handleSuccessDone = useCallback(() => {
    onVerified()
    handleClose()
  }, [onVerified, handleClose])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel={t('common.close')} accessibilityRole="button">
            <X size={20} color={colors.foreground} />
          </PressableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {t('addressVerification.title')}
          </Text>
          <View style={{ width: 20 }} />
        </View>

        {step === 'address' && (
          <View style={s.content}>
            <View style={s.iconCircle}>
              <MapPin size={28} color={colors.foreground} />
            </View>

            <Text style={[s.heading, { color: colors.foreground }]}>
              {t('addressVerification.enterAddress')}
            </Text>
            <Text style={[s.description, { color: colors.mutedForeground }]}>
              {t('addressVerification.enterAddressDesc')}
            </Text>

            <View style={s.inputSection}>
              <LocationAutocomplete
                value={addressText}
                onChangeText={setAddressText}
                onSelect={handleSelect}
                placeholder={t('addressVerification.placeholder')}
                accessibilityLabel={t('addressVerification.placeholder')}
                showIcon
              />
            </View>

            {selectedLocation && (
              <View style={[s.selectedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MapPin size={16} color={colors.foreground} />
                <View style={s.selectedTextWrap}>
                  <Text style={[s.selectedAddress, { color: colors.foreground }]} numberOfLines={2}>
                    {addressText}
                  </Text>
                  {selectedLocation.neighborhood && (
                    <Text style={[s.selectedNeighborhood, { color: colors.mutedForeground }]}>
                      {selectedLocation.neighborhood}
                    </Text>
                  )}
                </View>
              </View>
            )}

            <PressableOpacity
              onPress={handleVerify}
              disabled={!selectedLocation}
              style={[
                s.verifyBtn,
                { backgroundColor: selectedLocation ? colors.foreground : colors.muted },
              ]}
              accessibilityLabel={t('addressVerification.verify')}
              accessibilityRole="button"
            >
              <Navigation size={16} color={selectedLocation ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[s.verifyBtnText, { color: selectedLocation ? colors.primaryForeground : colors.mutedForeground }]}>
                {t('addressVerification.verify')}
              </Text>
            </PressableOpacity>

            <Text style={[s.hint, { color: colors.mutedForeground }]}>
              {t('addressVerification.hint')}
            </Text>
          </View>
        )}

        {step === 'locating' && (
          <View style={s.centerContent}>
            <ActivityIndicator size="large" color={colors.foreground} />
            <Text style={[s.heading, { color: colors.foreground, marginTop: 20 }]}>
              {t('addressVerification.locating')}
            </Text>
            <Text style={[s.description, { color: colors.mutedForeground }]}>
              {t('addressVerification.locatingDesc')}
            </Text>
          </View>
        )}

        {step === 'success' && (
          <View style={s.centerContent}>
            <View style={[s.resultCircle, { backgroundColor: colors.foreground }]}>
              <Check size={32} color={colors.primaryForeground} strokeWidth={2.5} />
            </View>
            <Text style={[s.heading, { color: colors.foreground, marginTop: 20 }]}>
              {t('addressVerification.success')}
            </Text>
            <Text style={[s.description, { color: colors.mutedForeground }]}>
              {t('addressVerification.successDesc')}
            </Text>
            <PressableOpacity
              onPress={handleSuccessDone}
              style={[s.verifyBtn, { backgroundColor: colors.foreground, marginTop: 24 }]}
              accessibilityLabel={t('common.done')}
              accessibilityRole="button"
            >
              <Text style={[s.verifyBtnText, { color: colors.primaryForeground }]}>
                {t('verification.done')}
              </Text>
            </PressableOpacity>
          </View>
        )}

        {step === 'failed' && (
          <View style={s.centerContent}>
            <View style={[s.resultCircle, { backgroundColor: colors.muted }]}>
              <MapPin size={32} color={colors.foreground} />
            </View>
            <Text style={[s.heading, { color: colors.foreground, marginTop: 20 }]}>
              {t('addressVerification.failed')}
            </Text>
            <Text style={[s.description, { color: colors.mutedForeground }]}>
              {t('addressVerification.failedDesc', { distance: distanceKm ? Math.round(distanceKm * 1000) : '?' })}
            </Text>
            <PressableOpacity
              onPress={() => setStep('address')}
              style={[s.verifyBtn, { backgroundColor: colors.foreground, marginTop: 24 }]}
              accessibilityLabel={t('addressVerification.tryAgain')}
              accessibilityRole="button"
            >
              <Text style={[s.verifyBtnText, { color: colors.primaryForeground }]}>
                {t('addressVerification.tryAgain')}
              </Text>
            </PressableOpacity>
          </View>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 20,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: 19,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
  },
  inputSection: {
    marginBottom: 16,
    zIndex: 10,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  selectedTextWrap: { flex: 1 },
  selectedAddress: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 18,
  },
  selectedNeighborhood: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    marginTop: 2,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 999,
    minHeight: 48,
    alignSelf: 'center',
  },
  verifyBtnText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  resultCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

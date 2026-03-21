import { useState, useRef, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, Animated, Dimensions, TouchableWithoutFeedback } from 'react-native'
import { MapPin, Check, X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { NEIGHBORHOODS } from '@/lib/constants'

const SCREEN_HEIGHT = Dimensions.get('window').height

export interface NeighborhoodPickerProps {
  visible: boolean
  onClose: () => void
  selectedNeighborhood: string | null
  onSelect: (nh: string) => void
}

export function NeighborhoodPicker({ visible, onClose, selectedNeighborhood, onSelect }: NeighborhoodPickerProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropAnim = useRef(new Animated.Value(0)).current
  const [showModal, setShowModal] = useState(false)
  const touchStartY = useRef(0)

  useEffect(() => {
    if (visible) {
      setShowModal(true)
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => setShowModal(false))
    }
  }, [visible])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  if (!showModal) return null

  return (
    <Modal visible={showModal} transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            transform: [{ translateY: slideAnim }],
            maxHeight: SCREEN_HEIGHT * 0.7,
          },
        ]}
        onTouchStart={(e) => { touchStartY.current = e.nativeEvent.pageY }}
        onTouchEnd={(e) => {
          const dy = e.nativeEvent.pageY - touchStartY.current
          if (dy > 80) handleClose() // swipe down > 80px dismisses
        }}
      >
        {/* Drag handle */}
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('onboarding.neighborhoodTitle')}
          </Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <X size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* List */}
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {NEIGHBORHOODS.map(nh => {
            const isSelected = selectedNeighborhood === nh
            return (
              <Pressable
                key={nh}
                onPress={() => onSelect(nh)}
                style={[
                  styles.item,
                  {
                    backgroundColor: isSelected ? `${colors.primary}14` : 'transparent',
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <MapPin size={14} color={isSelected ? colors.primary : colors.mutedForeground} />
                <Text
                  style={[
                    styles.itemText,
                    {
                      color: isSelected ? colors.primary : colors.foreground,
                      fontWeight: isSelected ? '600' : '400',
                    },
                  ]}
                >
                  {nh}
                </Text>
                {isSelected && <Check size={16} color={colors.primary} />}
              </Pressable>
            )
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontFamily: fonts.headingSemi, letterSpacing: -0.18 },
  list: { paddingBottom: 40 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { fontSize: 15, fontFamily: fonts.body, flex: 1 },
})

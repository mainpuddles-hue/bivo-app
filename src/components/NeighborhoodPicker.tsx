import { View, Text, ScrollView, StyleSheet, Pressable, Modal } from 'react-native'
import { MapPin, X, Check } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { NEIGHBORHOODS } from '@/lib/constants'

export interface NeighborhoodPickerProps {
  visible: boolean
  onClose: () => void
  selectedNeighborhood: string | null
  onSelect: (nh: string) => void
}

export function NeighborhoodPicker({
  visible,
  onClose,
  selectedNeighborhood,
  onSelect,
}: NeighborhoodPickerProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={nhStyles.modalHeader}>
          <Text style={[nhStyles.modalTitle, { color: colors.foreground }]}>
            {t('onboarding.neighborhoodTitle')}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={nhStyles.modalList}>
          {NEIGHBORHOODS.map(nh => (
            <Pressable
              key={nh}
              onPress={() => onSelect(nh)}
              style={[
                nhStyles.modalItem,
                {
                  backgroundColor: selectedNeighborhood === nh ? `${colors.primary}14` : 'transparent',
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <MapPin size={14} color={selectedNeighborhood === nh ? colors.primary : colors.mutedForeground} />
              <Text
                style={[
                  nhStyles.modalItemText,
                  {
                    color: selectedNeighborhood === nh ? colors.primary : colors.foreground,
                    fontWeight: selectedNeighborhood === nh ? '600' : '400',
                  },
                ]}
              >
                {nh}
              </Text>
              {selectedNeighborhood === nh && <Check size={16} color={colors.primary} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

const nhStyles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5E5',
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingSemi, letterSpacing: -0.18 },
  modalList: { paddingBottom: 40 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemText: { fontSize: 15, fontFamily: fonts.body, flex: 1 },
})

import { memo, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Modal, Animated } from 'react-native'
import { PartyPopper, Sparkles } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface FirstResponseCelebrationProps {
  visible: boolean
  responderName: string
  onDismiss: () => void
}

export const FirstResponseCelebration = memo(function FirstResponseCelebration({
  visible,
  responderName,
  onDismiss,
}: FirstResponseCelebrationProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const scaleAnim = useRef(new Animated.Value(0.5)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      scaleAnim.setValue(0.5)
      opacityAnim.setValue(0)
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <Animated.View
          style={[
            styles.content,
            { backgroundColor: colors.card, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Sparkles */}
          <View style={styles.sparkleRow}>
            <Sparkles size={20} color="#F59E0B" />
            <Sparkles size={16} color="#6FCF97" />
            <Sparkles size={20} color="#F59E0B" />
            <Sparkles size={16} color="#6FCF97" />
          </View>

          <PartyPopper size={48} color={colors.primary} />

          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('celebration.firstResponse')}
          </Text>

          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            {t('celebration.neighborHelped', { name: responderName })}
          </Text>

          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {t('celebration.howItWorks')}
          </Text>

          <Pressable
            onPress={onDismiss}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              {t('celebration.openMessage')}
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
})

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  content: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 320,
  },
  sparkleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 19,
    fontStyle: 'italic',
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
})

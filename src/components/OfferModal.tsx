/**
 * OfferModal — Make an offer on a 'tarjoan' post.
 *
 * Pre-fills with listed price. Submits to `offers` table,
 * creates/reuses conversation, sends push notification to seller.
 */
import { useState, useCallback, memo } from 'react'
import {
  View, Text, Modal, TextInput, KeyboardAvoidingView, Platform,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { DollarSign } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { useToast } from '@/components/Toast'
import { triggerPush } from '@/lib/pushTrigger'
import { fonts } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'
import { ModalCloseButton, PressableOpacity } from '@/components/ui'

interface OfferModalProps {
  visible: boolean
  onClose: () => void
  postId: string
  postTitle: string
  sellerId: string
  sellerName: string
  listedPrice: number
  userId: string
}

export const OfferModal = memo(function OfferModal({
  visible, onClose, postId, postTitle, sellerId, sellerName, listedPrice, userId,
}: OfferModalProps) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const supabase = useSupabase()
  const toast = useToast()

  const [amount, setAmount] = useState(String(listedPrice))
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = useCallback(async () => {
    const numAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.show({ message: t('offer.invalidAmount'), type: 'error' })
      return
    }
    if (sending) return
    setSending(true)

    try {
      // Find or create conversation
      let conversationId: string | null = null
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(user1_id.eq.${userId},user2_id.eq.${sellerId}),and(user1_id.eq.${sellerId},user2_id.eq.${userId})`)
        .maybeSingle()

      if (existing) {
        conversationId = (existing as any).id
      } else {
        const { data: newConv } = await (supabase.from('conversations') as any)
          .insert({ user1_id: userId, user2_id: sellerId })
          .select('id')
          .single()
        conversationId = newConv?.id ?? null
      }

      // Insert offer
      const { error: offerError } = await (supabase.from('offers') as any).insert({
        post_id: postId,
        from_user_id: userId,
        to_user_id: sellerId,
        amount: numAmount,
        message: message.trim() || null,
        status: 'pending',
        conversation_id: conversationId,
      })

      if (offerError) {
        if (offerError.code === '23505') {
          toast.show({ message: t('offer.alreadySent'), type: 'error' })
        } else {
          toast.show({ message: t('offer.sendFailed'), type: 'error' })
        }
        return
      }

      // Send message in conversation about the offer
      if (conversationId) {
        const offerMsg = `💰 ${t('offer.offerMessage', { amount: formatPrice(numAmount, locale), title: postTitle })}${message.trim() ? `\n\n${message.trim()}` : ''}`
        await (supabase.from('messages') as any).insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: offerMsg,
        }).catch(() => {})
      }

      // Push notification to seller
      triggerPush({
        user_id: sellerId,
        title: t('offer.receivedTitle'),
        body: t('offer.receivedBody', { amount: formatPrice(numAmount, locale), title: postTitle }),
        type: 'offer_received',
        post_id: postId,
      }).catch(() => {})

      // Insert notification
      await (supabase.from('notifications') as any).insert({
        user_id: sellerId,
        type: 'offer_received',
        title: t('offer.receivedTitle'),
        body: t('offer.receivedBody', { amount: formatPrice(numAmount, locale), title: postTitle }),
        link_type: 'post',
        link_id: postId,
        data: { from_user_id: userId, amount: numAmount },
        is_read: false,
      }).catch(() => {})

      toast.show({ message: t('offer.sent'), type: 'success' })
      onClose()
    } catch {
      toast.show({ message: t('offer.sendFailed'), type: 'error' })
    } finally {
      setSending(false)
    }
  }, [amount, message, sending, supabase, postId, userId, sellerId, postTitle, toast, t, locale, onClose])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{t('offer.title')}</Text>
            <ModalCloseButton onClose={onClose} />
          </View>

          <Text style={[styles.postTitle, { color: colors.mutedForeground }]} numberOfLines={2}>
            {postTitle}
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>{t('offer.amountLabel')}</Text>
          <View style={[styles.amountRow, { borderColor: colors.border }]}>
            <DollarSign size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.amountInput, { color: colors.foreground }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={String(listedPrice)}
              placeholderTextColor={colors.mutedForeground}
              selectTextOnFocus
              accessibilityLabel={t('offer.amountLabel')}
            />
            <Text style={[styles.currency, { color: colors.mutedForeground }]}>€</Text>
          </View>

          {listedPrice > 0 && (
            <Text style={[styles.listedPrice, { color: colors.mutedForeground }]}>
              {t('offer.listedPrice', { price: formatPrice(listedPrice, locale) })}
            </Text>
          )}

          <Text style={[styles.label, { color: colors.foreground }]}>{t('offer.messageLabel')}</Text>
          <TextInput
            style={[styles.messageInput, { color: colors.foreground, borderColor: colors.border }]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('offer.messagePlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            accessibilityLabel={t('offer.messageLabel')}
          />

          <PressableOpacity
            onPress={handleSubmit}
            disabled={sending}
            style={[styles.submitBtn, { backgroundColor: colors.foreground, opacity: sending ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('offer.send')}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.submitText, { color: colors.background }]}>{t('offer.send')}</Text>
            )}
          </PressableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
})

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontFamily: fonts.headingSemi, lineHeight: 24 },
  postTitle: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18, marginBottom: 12 },
  label: { fontSize: 13, fontFamily: fonts.bodySemi, marginTop: 12, lineHeight: 18 },
  amountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4,
  },
  amountInput: { flex: 1, fontSize: 20, fontFamily: fonts.heading, minHeight: 36, lineHeight: 28 },
  currency: { fontSize: 18, fontFamily: fonts.heading, lineHeight: 24 },
  listedPrice: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16, marginTop: 4 },
  messageInput: {
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, fontFamily: fonts.body, minHeight: 80, marginTop: 4, textAlignVertical: 'top', lineHeight: 20,
  },
  submitBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 999, marginTop: 16, minHeight: 48,
  },
  submitText: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 24 },
})

import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Alert } from 'react-native'
import { Heart } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { usePoints } from '@/hooks/usePoints'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'

interface ThanksButtonProps {
  toUserId: string
  postId?: string
  fromUserId: string | null
  size?: 'small' | 'default'
}

export function ThanksButton({ toUserId, postId, fromUserId, size = 'default' }: ThanksButtonProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const { awardPoints } = usePoints()
  const supabase = useSupabase()

  const [hasThanked, setHasThanked] = useState(false)
  const [thanksCount, setThanksCount] = useState(0)
  const [sending, setSending] = useState(false)

  // Animation
  const scaleAnim = useRef(new Animated.Value(1)).current
  const colorAnim = useRef(new Animated.Value(0)).current

  // Check if already thanked + get count
  useEffect(() => {
    async function check() {
      if (!fromUserId) return

      try {
        const thankedRes = await supabase
          .from('thanks')
          .select('id')
          .eq('from_user_id', fromUserId)
          .eq('to_user_id', toUserId)
          .maybeSingle()
        if (thankedRes?.data) setHasThanked(true)
      } catch {
        // Table may not exist
      }

      try {
        const countRes = await supabase
          .from('thanks')
          .select('id', { count: 'exact', head: true })
          .eq('to_user_id', toUserId)
        setThanksCount(countRes?.count ?? 0)
      } catch {
        // Table may not exist
      }
    }
    check()
  }, [fromUserId, toUserId, supabase])

  const handlePress = useCallback(async () => {
    if (!fromUserId || hasThanked || sending) return
    if (fromUserId === toUserId) return

    setSending(true)

    // Optimistic update
    setHasThanked(true)
    setThanksCount(c => c + 1)

    // Animate: bounce + fill
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.4,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start()

    Animated.timing(colorAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start()

    try {
      // 1. Insert thanks record
      const { error } = await (supabase.from('thanks') as any).insert({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        post_id: postId ?? null,
      })
      if (error) throw error

      // 2. Award points
      await awardPoints(fromUserId, 'thanks_given', toUserId)
      await awardPoints(toUserId, 'thanks_received', fromUserId)

      // 3. Send notification
      await (supabase.from('notifications') as any).insert({
        user_id: toUserId,
        from_user_id: fromUserId,
        type: 'thanks',
        title: t('thanks.notification', { name: '' }),
        body: t('thanks.sent'),
        link_type: postId ? 'post' : 'profile',
        link_id: postId ?? fromUserId,
      }).catch(() => {})
    } catch {
      // Revert on failure
      setHasThanked(false)
      setThanksCount(c => c - 1)
      scaleAnim.setValue(1)
      colorAnim.setValue(0)
      Alert.alert(t('common.error'), t('thanks.sendFailed'))
    } finally {
      setSending(false)
    }
  }, [fromUserId, toUserId, postId, hasThanked, sending, supabase, awardPoints, t, scaleAnim, colorAnim])

  // Don't render if no user or same user
  if (!fromUserId || fromUserId === toUserId) return null

  const isSmall = size === 'small'
  const iconSize = isSmall ? 14 : 18
  const heartColor = hasThanked ? colors.destructive : colors.mutedForeground

  return (
    <Pressable
      onPress={handlePress}
      disabled={hasThanked || sending}
      style={[
        styles.container,
        isSmall && styles.containerSmall,
        hasThanked && [styles.containerThanked, { backgroundColor: `${colors.destructive}10` }],
      ]}
      hitSlop={8}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Heart
          size={iconSize}
          color={heartColor}
          fill={hasThanked ? colors.destructive : 'transparent'}
        />
      </Animated.View>
      <Text
        style={[
          styles.label,
          isSmall && styles.labelSmall,
          { color: hasThanked ? colors.destructive : colors.mutedForeground },
        ]}
      >
        {hasThanked ? t('thanks.alreadyThanked') : t('thanks.button')}
      </Text>
      {thanksCount > 0 && (
        <Text
          style={[
            styles.count,
            isSmall && styles.countSmall,
            { color: hasThanked ? colors.destructive : colors.mutedForeground },
          ]}
        >
          {thanksCount}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  containerSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  containerThanked: {
    borderRadius: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  labelSmall: {
    fontSize: 11,
  },
  count: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.body,
  },
  countSmall: {
    fontSize: 11,
  },
})

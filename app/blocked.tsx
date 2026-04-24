import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
// Alert kept for destructive unblock confirmation
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ShieldOff } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'

interface BlockedUser {
  blocked_id: string
  blocked_user: {
    id: string
    name: string | null
    avatar_url: string | null
    naapurusto: string | null
  } | null
}

function BlockedUsersScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const toast = useToast()
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [unblocking, setUnblocking] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setUserId(user.id)

        const { data } = await supabase
          .from('blocked_users')
          .select('blocked_id, blocked_user:profiles!blocked_users_blocked_id_fkey(id, name, avatar_url, naapurusto)')
          .eq('blocker_id', user.id)

        setBlockedUsers((data ?? []) as unknown as BlockedUser[])
      } catch {
        // Table may not exist or network error — show empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  const handleUnblock = useCallback(async (blockedUserId: string, name: string | null) => {
    if (!userId) return
    Alert.alert(
      t('blocked.removeBlock'),
      t('blocked.explanation'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('blocked.removeBlock'),
          style: 'destructive',
          onPress: async () => {
            setUnblocking(blockedUserId)
            const { error } = await supabase
              .from('blocked_users')
              .delete()
              .eq('blocker_id', userId)
              .eq('blocked_id', blockedUserId)

            if (error) {
              toast.show({ message: t('blocked.unblockFailed'), type: 'error' })
            } else {
              setBlockedUsers(prev => prev.filter(b => b.blocked_id !== blockedUserId))
            }
            setUnblocking(null)
          },
        },
      ],
    )
  }, [userId, supabase, t, toast])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Bar header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('blocked.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.foreground} style={{ marginTop: 80 }} />
      ) : blockedUsers.length === 0 ? (
        <EmptyState
          icon={<ShieldOff size={36} color={colors.mutedForeground} />}
          title={t('blocked.noBlocked')}
        />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {blockedUsers.map((item, index) => {
            const user = item.blocked_user
            return (
              <View
                key={item.blocked_id}
                style={[
                  s.userCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Avatar url={user?.avatar_url} name={user?.name} size={44} />

                <View style={s.userInfo}>
                  <Text style={[s.userName, { color: colors.foreground }]} numberOfLines={1}>
                    {user?.name ?? t('common.user')}
                  </Text>
                  {user?.naapurusto && (
                    <Text style={[s.userNh, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {user.naapurusto}
                    </Text>
                  )}
                </View>

                <PressableOpacity
                  onPress={() => handleUnblock(item.blocked_id, user?.name ?? null)}
                  disabled={unblocking === item.blocked_id}
                  style={[s.unblockBtn, { backgroundColor: colors.warmTint, opacity: unblocking === item.blocked_id ? 0.5 : 1 }]}
                  accessibilityLabel={t('blocked.removeBlock')}
                  accessibilityRole="button"
                >
                  {unblocking === item.blocked_id ? (
                    <ActivityIndicator size="small" color="#A03030" />
                  ) : (
                    <Text style={s.unblockText}>{t('blocked.removeBlock')}</Text>
                  )}
                </PressableOpacity>
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  headerSpacer: { width: 36 },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodySemi },
  userNh: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  unblockBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 100,
    alignItems: 'center',
  },
  unblockText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodySemi,
    color: '#A03030',
  },
})

export default function BlockedUsersScreen() {
  return (
    <ScreenErrorBoundary screenName="BlockedUsers">
      <BlockedUsersScreenInner />
    </ScreenErrorBoundary>
  )
}

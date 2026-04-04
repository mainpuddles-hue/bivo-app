import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ShieldOff } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { BackButton } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { Avatar } from '@/components/Avatar'

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
              Alert.alert(t('common.error'), t('blocked.unblockFailed'))
            } else {
              setBlockedUsers(prev => prev.filter(b => b.blocked_id !== blockedUserId))
            }
            setUnblocking(null)
          },
        },
      ],
    )
  }, [userId, supabase, t])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('blocked.title')}</Text>
        <View style={{ flex: 1 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      ) : blockedUsers.length === 0 ? (
        <EmptyState
          icon={<ShieldOff size={36} color={colors.primary} />}
          title={t('blocked.noBlocked')}
        />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            {blockedUsers.map((item) => {
              const user = item.blocked_user
              return (
                <View key={item.blocked_id} style={[s.row, { borderBottomColor: colors.border }]}>
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

                  <Pressable
                    onPress={() => handleUnblock(item.blocked_id, user?.name ?? null)}
                    disabled={unblocking === item.blocked_id}
                    style={[s.unblockBtn, { backgroundColor: colors.destructive, opacity: unblocking === item.blocked_id ? 0.5 : 1 }]}
                    accessibilityLabel={t('blocked.removeBlock')}
                    accessibilityRole="button"
                  >
                    {unblocking === item.blocked_id ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={[s.unblockText, { color: colors.primaryForeground }]}>{t('blocked.removeBlock')}</Text>
                    )}
                  </Pressable>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontFamily: fonts.headingSemi, letterSpacing: -0.3, lineHeight: 28 },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodySemi },
  userNh: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  unblockBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
    minWidth: 100, alignItems: 'center',
  },
  unblockText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bodySemi },
})

export default function BlockedUsersScreen() {
  return (
    <ScreenErrorBoundary screenName="BlockedUsers">
      <BlockedUsersScreenInner />
    </ScreenErrorBoundary>
  )
}

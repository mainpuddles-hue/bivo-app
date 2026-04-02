import { useState, useCallback, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Share, Alert } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {
  Gift, Copy, Share2, Check, ChevronRight, Crown, UserPlus, Users, Award, Star,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useReferral } from '@/hooks/useReferral'
import { fonts } from '@/lib/fonts'

interface ReferralCardProps {
  userId: string | null
}

const TIER_ICONS: Record<number, React.ComponentType<any>> = {
  1: UserPlus,
  3: Users,
  5: Crown,
  10: Award,
  25: Star,
}

const TIER_COLORS: Record<number, string> = {
  1: '#10B981',
  3: '#3B82F6',
  5: '#F59E0B',
  10: '#8E44AD',
  25: '#EF4444',
}

export function ReferralCard({ userId }: ReferralCardProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const {
    inviteCode,
    inviteCount,
    currentTier,
    nextTier,
    loading,
    generateCode,
    REFERRAL_TIERS,
  } = useReferral(userId)

  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState<string | null>(inviteCode)

  useEffect(() => {
    setCode(inviteCode)
  }, [inviteCode])

  const ensureCode = useCallback(async () => {
    if (code) return code
    const newCode = await generateCode()
    setCode(newCode ?? null)
    return newCode
  }, [code, generateCode])

  const handleCopy = useCallback(async () => {
    const c = await ensureCode()
    if (!c) return
    await Clipboard.setStringAsync(c)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [ensureCode])

  const handleShare = useCallback(async () => {
    const c = await ensureCode()
    if (!c) return
    const message = t('referral.shareText').replace('{code}', c)
    try {
      await Share.share({ message })
    } catch {
      // User cancelled share
    }
  }, [ensureCode, t])

  if (loading || !userId) return null

  // Progress calculation
  const target = nextTier ? nextTier.invites : (currentTier?.invites ?? 1)
  const progress = nextTier
    ? Math.min(inviteCount / nextTier.invites, 1)
    : 1
  const invitesLeft = nextTier ? nextTier.invites - inviteCount : 0

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={s.headerRow}>
        <View style={[s.iconCircle, { backgroundColor: isDark ? '#2D6B5E30' : '#2D6B5E15' }]}>
          <Gift size={20} color={colors.primary} />
        </View>
        <Text style={[s.title, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
          {t('referral.title')}
        </Text>
      </View>

      {/* Invite Code */}
      <View style={[s.codeRow, { backgroundColor: isDark ? colors.muted : '#F5F5F5' }]}>
        <View style={s.codeLeft}>
          <Text style={[s.codeLabel, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('referral.yourCode')}
          </Text>
          <Text style={[s.codeText, { color: colors.foreground, fontFamily: fonts.heading }]}>
            {code ?? '--------'}
          </Text>
        </View>
        <View style={s.codeActions}>
          <Pressable
            onPress={handleCopy}
            style={[s.codeBtn, { backgroundColor: copied ? '#10B98120' : colors.primary + '15' }]}
          >
            {copied ? (
              <Check size={16} color="#10B981" />
            ) : (
              <Copy size={16} color={colors.primary} />
            )}
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={[s.codeBtn, { backgroundColor: colors.primary + '15' }]}
          >
            <Share2 size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {copied && (
        <Text style={[s.copiedText, { color: '#10B981', fontFamily: fonts.body }]}>
          {t('referral.copied')}
        </Text>
      )}

      {/* Progress */}
      <View style={s.progressSection}>
        <View style={s.progressHeader}>
          <Text style={[s.progressText, { color: colors.foreground, fontFamily: fonts.bodyMedium }]}>
            {t('referral.progress').replace('{count}', String(inviteCount)).replace('{target}', String(target))}
          </Text>
          {nextTier ? (
            <Text style={[s.invitesLeftText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
              {t('referral.invitesLeft').replace('{count}', String(invitesLeft))}
            </Text>
          ) : (
            <Text style={[s.invitesLeftText, { color: '#10B981', fontFamily: fonts.bodySemi }]}>
              {t('referral.allTiersUnlocked')}
            </Text>
          )}
        </View>

        {/* Progress bar */}
        <View style={[s.progressTrack, { backgroundColor: isDark ? '#333333' : '#E5E5E5' }]}>
          <View
            style={[
              s.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${Math.round(progress * 100)}%` as any,
              },
            ]}
          />
        </View>
      </View>

      {/* Tier List */}
      <View style={s.tierList}>
        {REFERRAL_TIERS.map((tier) => {
          const achieved = inviteCount >= tier.invites
          const TierIcon = TIER_ICONS[tier.invites] ?? Gift
          const tierColor = TIER_COLORS[tier.invites] ?? colors.primary

          return (
            <View
              key={tier.invites}
              style={[
                s.tierRow,
                achieved && { backgroundColor: isDark ? tierColor + '15' : tierColor + '08' },
                { borderColor: achieved ? tierColor + '30' : colors.border },
              ]}
            >
              <View style={[s.tierIconCircle, { backgroundColor: achieved ? tierColor + '20' : colors.muted }]}>
                <TierIcon size={16} color={achieved ? tierColor : colors.mutedForeground} />
              </View>
              <View style={s.tierInfo}>
                <Text style={[
                  s.tierName,
                  {
                    color: achieved ? colors.foreground : colors.mutedForeground,
                    fontFamily: achieved ? fonts.bodySemi : fonts.body,
                  },
                ]}>
                  {t(tier.rewardKey)}
                </Text>
                <Text style={[s.tierMeta, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                  {tier.invites} {tier.invites === 1 ? 'invite' : 'invites'} &middot; +{tier.points} pts
                </Text>
              </View>
              {achieved && (
                <Check size={16} color={tierColor} />
              )}
              {!achieved && (
                <ChevronRight size={16} color={colors.mutedForeground} />
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 14,
  },
  codeLeft: {
    gap: 2,
  },
  codeLabel: {
    fontSize: 12,
    lineHeight: 17,
  },
  codeText: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 2,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  codeBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiedText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: -8,
  },
  progressSection: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    lineHeight: 20,
  },
  invitesLeftText: {
    fontSize: 12,
    lineHeight: 17,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  tierList: {
    gap: 6,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  tierIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierInfo: {
    flex: 1,
    gap: 1,
  },
  tierName: {
    fontSize: 14,
    lineHeight: 20,
  },
  tierMeta: {
    fontSize: 11,
    lineHeight: 14,
  },
})

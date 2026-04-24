import { memo, useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { BarChart3, Users, Clock, Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { PressableOpacity } from '@/components/ui'
import { formatTimeAgo } from '@/lib/format'

export interface Poll {
  id: string
  creator_id: string
  question: string
  options: string[]
  building_id: string | null
  naapurusto: string | null
  vote_count: number
  expires_at: string | null
  created_at: string
  is_active: boolean
  // Enriched client-side
  creator_name?: string
  my_vote?: number | null
  option_counts?: number[]
}

interface PollCardProps {
  poll: Poll
  userId?: string | null
}

export const PollCard = memo(function PollCard({ poll, userId }: PollCardProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const supabase = useSupabase()

  const [myVote, setMyVote] = useState<number | null>(poll.my_vote ?? null)
  const [voteCount, setVoteCount] = useState(poll.vote_count)
  const [optionCounts, setOptionCounts] = useState<number[]>(poll.option_counts ?? (Array.isArray(poll.options) ? poll.options : []).map(() => 0))
  const [voting, setVoting] = useState(false)
  const votingRef = useRef(false)

  const safeOptions = Array.isArray(poll.options) ? poll.options : []
  const hasVoted = myVote !== null
  const isExpired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false
  const showResults = hasVoted || isExpired

  const handleVote = useCallback(async (optionIndex: number) => {
    if (!userId || votingRef.current || hasVoted || isExpired) return
    if (optionIndex < 0 || optionIndex >= safeOptions.length) return
    votingRef.current = true
    setVoting(true)
    // Optimistic update
    setMyVote(optionIndex)
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch {}

    const { error } = await (supabase.from('poll_votes') as any).insert({
      poll_id: poll.id,
      user_id: userId,
      option_index: optionIndex,
    })

    if (error) {
      // Rollback optimistic update
      setMyVote(null)
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
    } else {
      setVoteCount(prev => prev + 1)
      setOptionCounts(prev => {
        const next = [...prev]
        next[optionIndex] = (next[optionIndex] || 0) + 1
        return next
      })
    }
    votingRef.current = false
    setVoting(false)
  }, [userId, hasVoted, isExpired, poll.id, supabase, safeOptions.length])

  const totalVotes = optionCounts.reduce((a, b) => a + b, 0) || 1

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="none" accessibilityLabel={`${t('polls.communityPoll')}: ${poll.question}`}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.foreground}10` }]} accessibilityElementsHidden>
          <BarChart3 size={16} color={colors.foreground} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: colors.mutedForeground }]} accessibilityRole="header">
            {t('polls.communityPoll')}
          </Text>
          {poll.expires_at && (
            <View style={styles.expiryRow}>
              <Clock size={10} color={colors.mutedForeground} />
              <Text style={[styles.expiryText, { color: colors.mutedForeground }]}>
                {isExpired ? t('polls.ended') : formatTimeAgo(poll.expires_at, t, locale)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Question */}
      <Text style={[styles.question, { color: colors.foreground }]}>
        {poll.question}
      </Text>

      {/* Options */}
      <View style={styles.options}>
        {safeOptions.map((option, idx) => {
          const count = optionCounts[idx] || 0
          const pct = showResults ? Math.round((count / totalVotes) * 100) : 0
          const isMyVote = myVote === idx

          return (
            <PressableOpacity
              key={idx}
              onPress={() => handleVote(idx)}
              disabled={showResults || voting || !userId}
              style={[
                styles.option,
                {
                  borderColor: isMyVote ? colors.foreground : colors.border,
                  backgroundColor: isMyVote ? `${colors.foreground}08` : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${option}${showResults ? `, ${pct}%` : ''}`}
              accessibilityState={{ disabled: showResults || voting || !userId, selected: isMyVote }}
            >
              {/* Result bar */}
              {showResults && (
                <View
                  style={[
                    styles.resultBar,
                    {
                      width: `${pct}%`,
                      backgroundColor: isMyVote ? `${colors.foreground}18` : `${colors.foreground}08`,
                    },
                  ]}
                />
              )}
              <View style={styles.optionContent}>
                {isMyVote && <Check size={14} color={colors.foreground} strokeWidth={2.5} />}
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: colors.foreground,
                      fontFamily: isMyVote ? fonts.bodySemi : fonts.body,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {option}
                </Text>
                {showResults && (
                  <Text style={[styles.pctText, { color: colors.mutedForeground }]}>
                    {pct}%
                  </Text>
                )}
              </View>
            </PressableOpacity>
          )
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Users size={12} color={colors.mutedForeground} />
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          {t('polls.votes', { count: voteCount })}
        </Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  options: {
    gap: 8,
  },
  option: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
  },
  resultBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 14,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  pctText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 18,
    minWidth: 36,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
})

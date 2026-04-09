import { memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Avatar } from './Avatar'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface Participant {
  avatar_url?: string | null
  name?: string
}

interface ParticipantAvatarRowProps {
  participants: Participant[]
  totalCount?: number
  max?: number
  size?: number
}

export const ParticipantAvatarRow = memo(function ParticipantAvatarRow({
  participants,
  totalCount,
  max = 5,
  size = 28,
}: ParticipantAvatarRowProps) {
  const { colors } = useTheme()
  const shown = participants.slice(0, max)
  const count = totalCount ?? participants.length
  const overflow = count - shown.length

  if (count === 0) return null

  return (
    <View style={s.row} accessibilityLabel={`${count} participants`}>
      {shown.map((p, i) => (
        <View key={p.avatar_url ?? p.name ?? `avatar-${i}`} style={[s.avatarWrap, { marginLeft: i > 0 ? -(size * 0.3) : 0, zIndex: max - i, borderColor: colors.background }]}>
          <Avatar url={p.avatar_url ?? null} name={p.name ?? '?'} size={size} />
        </View>
      ))}
      {overflow > 0 && (
        <View style={[
          s.overflowBadge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            marginLeft: -(size * 0.3),
            backgroundColor: colors.muted,
          },
        ]}>
          <Text style={[s.overflowText, { color: colors.mutedForeground, fontSize: Math.max(11, Math.round(size * 0.38)), fontFamily: fonts.bodySemi }]}>
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  )
})

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderWidth: 2, borderRadius: 999 },
  overflowBadge: { alignItems: 'center', justifyContent: 'center' },
  overflowText: { fontWeight: '600' },
})

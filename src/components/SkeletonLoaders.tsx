import { useRef, useEffect } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'

function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])
  return shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })
}

// ── Message List Skeleton ──
export function MessageListSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 1 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View key={i} style={[skel.messageRow, { backgroundColor: colors.card }]}>
          <Animated.View style={[skel.avatar, { backgroundColor: colors.muted, opacity }]} />
          <View style={skel.messageInfo}>
            <Animated.View style={[skel.line, { width: '50%', backgroundColor: colors.muted, opacity }]} />
            <Animated.View style={[skel.line, { width: '80%', backgroundColor: colors.muted, opacity }]} />
          </View>
          <Animated.View style={[skel.timeBadge, { backgroundColor: colors.muted, opacity }]} />
        </View>
      ))}
    </View>
  )
}

// ── Profile Skeleton ──
export function ProfileSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={skel.profileWrap}>
      <Animated.View style={[skel.profileAvatar, { backgroundColor: colors.muted, opacity }]} />
      <Animated.View style={[skel.line, { width: '40%', height: 18, alignSelf: 'center', backgroundColor: colors.muted, opacity }]} />
      <Animated.View style={[skel.line, { width: '60%', alignSelf: 'center', backgroundColor: colors.muted, opacity }]} />
      <View style={skel.profileStats}>
        {[0, 1, 2].map(i => (
          <Animated.View key={i} style={[skel.profileStatBox, { backgroundColor: colors.muted, opacity }]} />
        ))}
      </View>
      <Animated.View style={[skel.line, { width: '100%', height: 100, borderRadius: 12, backgroundColor: colors.muted, opacity }]} />
    </View>
  )
}

// ── Search Results Skeleton ──
export function SearchSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 12, padding: 16 }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[skel.searchRow, { backgroundColor: colors.card }]}>
          <Animated.View style={[skel.searchImage, { backgroundColor: colors.muted, opacity }]} />
          <View style={skel.searchInfo}>
            <Animated.View style={[skel.line, { width: '70%', backgroundColor: colors.muted, opacity }]} />
            <Animated.View style={[skel.line, { width: '40%', backgroundColor: colors.muted, opacity }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

const skel = StyleSheet.create({
  // Message
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  messageInfo: { flex: 1, gap: 8 },
  line: { height: 12, borderRadius: 6 },
  timeBadge: { width: 40, height: 12, borderRadius: 6 },
  // Profile
  profileWrap: { alignItems: 'stretch', gap: 16, padding: 24 },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center' },
  profileStats: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  profileStatBox: { width: 80, height: 60, borderRadius: 12 },
  // Search
  searchRow: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12 },
  searchImage: { width: 60, height: 60, borderRadius: 8 },
  searchInfo: { flex: 1, gap: 8, justifyContent: 'center' },
})

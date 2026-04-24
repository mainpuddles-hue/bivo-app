import { useRef, useEffect, type ReactNode } from 'react'
import { View, Animated, StyleSheet, type ViewStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'

/**
 * Wraps children in a fade-in + subtle slide-up when they mount.
 * Creates a polished skeleton → content crossfade.
 * Respects prefers-reduced-motion.
 */
export function FadeIn({ children, style, duration = 300 }: { children: ReactNode; style?: ViewStyle; duration?: number }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(8)).current
  const reduceMotion = useReduceMotion()
  useEffect(() => {
    if (reduceMotion) { opacity.setValue(1); translateY.setValue(0); return }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
    ]).start()
  }, [opacity, translateY, duration, reduceMotion])
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>
}

export function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current
  const reduceMotion = useReduceMotion()
  useEffect(() => {
    // Respect Reduce Motion — static skeleton instead of looping shimmer
    if (reduceMotion) {
      shimmer.setValue(0.5)
      return
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer, reduceMotion])
  return shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })
}

// ── Message List Skeleton ──
export function MessageListSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 1 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <View key={i} style={[skel.messageRow, { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
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
      <Animated.View style={[skel.line, { width: '100%', height: 100, borderRadius: 16, backgroundColor: colors.muted, opacity }]} />
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
        <View key={i} style={[skel.searchRow, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
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

// ── Post Card Skeleton ──
export function PostCardSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={[postSkel.card, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <Animated.View style={[postSkel.image, { backgroundColor: colors.muted, opacity }]} />
      <View style={postSkel.body}>
        <Animated.View style={[skel.line, postSkel.lineShort, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skel.line, postSkel.lineLong, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skel.line, postSkel.lineMed, { backgroundColor: colors.muted, opacity }]} />
        <View style={postSkel.userRow}>
          <Animated.View style={[postSkel.avatar, { backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[skel.line, postSkel.lineName, { backgroundColor: colors.muted, opacity }]} />
        </View>
      </View>
    </View>
  )
}

// ── Section Skeleton (for Explore) ──
export function SectionSkeleton({ count = 3 }: { count?: number }) {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[sectionSkel.card, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <View style={sectionSkel.cardRow}>
            <Animated.View style={[sectionSkel.circle, { backgroundColor: colors.muted, opacity }]} />
            <View style={sectionSkel.content}>
              <Animated.View style={[skel.line, { width: '60%', height: 14, backgroundColor: colors.muted, opacity }]} />
              <Animated.View style={[skel.line, { width: '40%', height: 10, backgroundColor: colors.muted, opacity, marginTop: 6 }]} />
            </View>
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
  profileStatBox: { width: 80, height: 60, borderRadius: 16 },
  // Search
  searchRow: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 20 },
  searchImage: { width: 60, height: 60, borderRadius: 10 },
  searchInfo: { flex: 1, gap: 8, justifyContent: 'center' },
})

const postSkel = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 0 },
  body: { padding: 16, gap: 12 },
  lineShort: { width: '40%' },
  lineLong: { width: '90%' },
  lineMed: { width: '65%' },
  lineName: { width: '30%', height: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
})

// ── Post Detail Skeleton ──
export function PostDetailSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 16 }}>
      {/* Hero image placeholder */}
      <Animated.View style={{ width: '100%', height: 250, backgroundColor: colors.muted, opacity }} />
      {/* Body */}
      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        {/* Category chip */}
        <Animated.View style={[skel.line, { width: '25%', height: 24, borderRadius: 8, backgroundColor: colors.muted, opacity }]} />
        {/* Title */}
        <Animated.View style={[skel.line, { width: '70%', height: 20, backgroundColor: colors.muted, opacity }]} />
        {/* Description lines */}
        <Animated.View style={[skel.line, { width: '100%', height: 12, backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skel.line, { width: '90%', height: 12, backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skel.line, { width: '75%', height: 12, backgroundColor: colors.muted, opacity }]} />
        {/* Action bar */}
        <View style={{ flexDirection: 'row', gap: 16, paddingTop: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <Animated.View key={i} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.muted, opacity }} />
          ))}
        </View>
        {/* Author card */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 }}>
          <Animated.View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.muted, opacity }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Animated.View style={[skel.line, { width: '40%', height: 14, backgroundColor: colors.muted, opacity }]} />
            <Animated.View style={[skel.line, { width: '25%', height: 10, backgroundColor: colors.muted, opacity }]} />
          </View>
        </View>
      </View>
    </View>
  )
}

const sectionSkel = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', padding: 16, gap: 12, alignItems: 'center' },
  circle: { width: 40, height: 40, borderRadius: 20 },
  content: { flex: 1, gap: 3 },
})

// ── Event Card Skeleton ──
export function EventCardSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={[eventSkel.card, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      {/* Image placeholder */}
      <Animated.View style={[eventSkel.image, { backgroundColor: colors.muted, opacity }]} />
      {/* Content */}
      <View style={eventSkel.content}>
        {/* Category badge */}
        <Animated.View style={[skel.line, { width: 80, height: 22, borderRadius: 16, backgroundColor: colors.muted, opacity }]} />
        {/* Title */}
        <Animated.View style={[skel.line, { width: '85%', height: 18, backgroundColor: colors.muted, opacity }]} />
        {/* Date row */}
        <View style={eventSkel.infoRow}>
          <Animated.View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: colors.muted, opacity }} />
          <Animated.View style={[skel.line, { width: '55%', backgroundColor: colors.muted, opacity }]} />
        </View>
        {/* Location row */}
        <View style={eventSkel.infoRow}>
          <Animated.View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: colors.muted, opacity }} />
          <Animated.View style={[skel.line, { width: '40%', backgroundColor: colors.muted, opacity }]} />
        </View>
        {/* Participants */}
        <View style={[eventSkel.infoRow, { marginTop: 4 }]}>
          {[0, 1, 2].map(i => (
            <Animated.View key={i} style={{ width: 24, height: 24, borderRadius: 12, marginLeft: i > 0 ? -8 : 0, backgroundColor: colors.muted, opacity }} />
          ))}
        </View>
      </View>
    </View>
  )
}

// ── Table Card Skeleton ──
export function TableCardSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={[tableSkel.card, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      {/* Emoji placeholder */}
      <Animated.View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.card, opacity }} />
      {/* Title */}
      <Animated.View style={[skel.line, { width: '80%', height: 16, backgroundColor: colors.card, opacity }]} />
      {/* Time */}
      <View style={eventSkel.infoRow}>
        <Animated.View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.card, opacity }} />
        <Animated.View style={[skel.line, { width: '40%', height: 10, backgroundColor: colors.card, opacity }]} />
      </View>
      {/* Dots */}
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
        {[0, 1, 2].map(i => (
          <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.card, opacity }} />
        ))}
      </View>
    </View>
  )
}

// ── Event Detail Skeleton ──
export function EventDetailSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 16 }}>
      {/* Hero image */}
      <Animated.View style={{ width: '100%', height: 220, backgroundColor: colors.muted, opacity }} />
      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        {/* Category badge */}
        <Animated.View style={[skel.line, { width: 90, height: 24, borderRadius: 16, backgroundColor: colors.muted, opacity }]} />
        {/* Title */}
        <Animated.View style={[skel.line, { width: '80%', height: 22, backgroundColor: colors.muted, opacity }]} />
        {/* Date */}
        <View style={eventSkel.infoRow}>
          <Animated.View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: colors.muted, opacity }} />
          <Animated.View style={[skel.line, { width: '50%', height: 14, backgroundColor: colors.muted, opacity }]} />
        </View>
        {/* Location */}
        <View style={eventSkel.infoRow}>
          <Animated.View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: colors.muted, opacity }} />
          <Animated.View style={[skel.line, { width: '45%', height: 14, backgroundColor: colors.muted, opacity }]} />
        </View>
        {/* Description lines */}
        <Animated.View style={[skel.line, { width: '100%', height: 12, backgroundColor: colors.muted, opacity, marginTop: 8 }]} />
        <Animated.View style={[skel.line, { width: '90%', height: 12, backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skel.line, { width: '70%', height: 12, backgroundColor: colors.muted, opacity }]} />
        {/* Join button */}
        <Animated.View style={[skel.line, { width: '100%', height: 48, borderRadius: 14, backgroundColor: colors.muted, opacity, marginTop: 8 }]} />
        {/* Participants section */}
        <View style={{ gap: 12, marginTop: 8 }}>
          <Animated.View style={[skel.line, { width: '30%', height: 16, backgroundColor: colors.muted, opacity }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0, 1, 2, 3].map(i => (
              <Animated.View key={i} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.muted, opacity }} />
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}

// ── Feed Load More Skeleton (replaces ActivityIndicator in feed footer) ──
export function FeedLoadMoreSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={feedMoreSkel.container}>
      {[0, 1].map(i => (
        <View key={i} style={[feedMoreSkel.card, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <Animated.View style={[feedMoreSkel.image, { backgroundColor: colors.muted, opacity }]} />
          <View style={feedMoreSkel.body}>
            <Animated.View style={[skel.line, { width: '60%', backgroundColor: colors.muted, opacity }]} />
            <Animated.View style={[skel.line, { width: '40%', height: 10, backgroundColor: colors.muted, opacity }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

const feedMoreSkel = StyleSheet.create({
  container: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  card: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9 },
  body: { padding: 12, gap: 8 },
})

// ── Public Profile Skeleton ──
export function PublicProfileSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={pubProfileSkel.wrap}>
      {/* Avatar + name */}
      <Animated.View style={[pubProfileSkel.avatar, { backgroundColor: colors.muted, opacity }]} />
      <Animated.View style={[skel.line, { width: '35%', height: 18, alignSelf: 'center', backgroundColor: colors.muted, opacity }]} />
      <Animated.View style={[skel.line, { width: '50%', alignSelf: 'center', backgroundColor: colors.muted, opacity }]} />
      {/* Stats row */}
      <View style={pubProfileSkel.stats}>
        {[0, 1, 2].map(i => (
          <Animated.View key={i} style={[pubProfileSkel.statBox, { backgroundColor: colors.muted, opacity }]} />
        ))}
      </View>
      {/* Bio */}
      <Animated.View style={[skel.line, { width: '100%', height: 60, borderRadius: 16, backgroundColor: colors.muted, opacity }]} />
      {/* Action buttons */}
      <View style={pubProfileSkel.actions}>
        <Animated.View style={[pubProfileSkel.actionBtn, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[pubProfileSkel.actionBtn, { backgroundColor: colors.muted, opacity }]} />
      </View>
      {/* Posts section */}
      <Animated.View style={[skel.line, { width: '25%', height: 16, backgroundColor: colors.muted, opacity, marginTop: 8 }]} />
      <View style={pubProfileSkel.postsRow}>
        {[0, 1].map(i => (
          <View key={i} style={[pubProfileSkel.postCard, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
            <Animated.View style={[pubProfileSkel.postImage, { backgroundColor: colors.muted, opacity }]} />
            <Animated.View style={[skel.line, { width: '70%', height: 10, backgroundColor: colors.muted, opacity, margin: 10 }]} />
          </View>
        ))}
      </View>
    </View>
  )
}

const pubProfileSkel = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: 14, padding: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  statBox: { width: 80, height: 56, borderRadius: 16 },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  actionBtn: { flex: 1, height: 44, borderRadius: 14 },
  postsRow: { flexDirection: 'row', gap: 10 },
  postCard: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  postImage: { width: '100%', aspectRatio: 16 / 9 },
})

// ── Booking Detail Skeleton ──
export function BookingDetailSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={{ gap: 16, padding: 16 }}>
      {/* Hero status circle */}
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
        <Animated.View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.muted, opacity }} />
        <Animated.View style={[skel.line, { width: '30%', height: 10, backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skel.line, { width: '55%', height: 16, backgroundColor: colors.muted, opacity }]} />
      </View>
      {/* Item summary card */}
      <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 20 }}>
        <Animated.View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.muted, opacity }} />
        <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
          <Animated.View style={[skel.line, { width: '70%', height: 14, backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[skel.line, { width: '45%', height: 10, backgroundColor: colors.muted, opacity }]} />
        </View>
      </View>
      {/* Detail rows */}
      {[0, 1, 2].map(i => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <Animated.View style={[skel.line, { width: '35%', height: 12, backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[skel.line, { width: '25%', height: 12, backgroundColor: colors.muted, opacity }]} />
        </View>
      ))}
      {/* CTA button */}
      <Animated.View style={[skel.line, { width: '100%', height: 48, borderRadius: 14, backgroundColor: colors.muted, opacity, marginTop: 8 }]} />
    </View>
  )
}

const eventSkel = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  image: { width: '100%', height: 140 },
  content: { padding: 14, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})

const tableSkel = StyleSheet.create({
  card: { width: 180, borderRadius: 20, padding: 14, gap: 6 },
})

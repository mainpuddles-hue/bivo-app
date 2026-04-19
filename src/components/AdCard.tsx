import { memo, useCallback, useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { Image } from 'expo-image'
import { ExternalLink, Megaphone } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { getImageUrl } from '@/lib/imageUtils'

export interface Ad {
  id: string
  user_id: string
  title: string
  description: string | null
  image_url: string | null
  link_url: string | null
  cta_text: string | null
  target_naapurusto: string | null
  start_date: string
  end_date: string
  status: string
  created_at: string
  _isAd: true
  business?: { name: string; avatar_url: string | null } | null
}

interface AdCardProps {
  ad: Ad
}

export const AdCard = memo(function AdCard({ ad }: AdCardProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()

  const trackImpression = useCallback(async () => {
    try {
      await (supabase.from('ad_impressions') as any).insert({
        ad_id: ad.id,
        type: 'impression',
      })
    } catch {
      // Non-critical — ignore
    }
  }, [ad.id, supabase])

  const handlePress = useCallback(async () => {
    // Track click
    try {
      await (supabase.from('ad_impressions') as any).insert({
        ad_id: ad.id,
        type: 'click',
      })
    } catch {
      // Non-critical
    }

    if (ad.link_url) {
      try {
        const u = new URL(ad.link_url)
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          Linking.openURL(ad.link_url).catch(() => {})
        }
      } catch {}
    }
  }, [ad.id, ad.link_url, supabase])

  // Track impression on mount (fire once per mount)
  const tracked = useRef(false)
  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true
      trackImpression()
    }
  }, [trackImpression])

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.card,
        { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
      ]}
      accessibilityRole="button"
      accessibilityLabel={[t('ads.sponsored'), ad.title, ad.description].filter(Boolean).join(', ')}
    >
      {/* Sponsored label */}
      <View style={[styles.sponsoredBadge, { backgroundColor: colors.muted }]}>
        <Megaphone size={11} color={colors.mutedForeground} />
        <Text style={[styles.sponsoredText, { color: colors.mutedForeground }]}>{t('ads.sponsored')}</Text>
      </View>

      {/* Image */}
      {ad.image_url && (
        <Image
          source={{ uri: getImageUrl(ad.image_url, 'medium')! }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      )}

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {ad.title}
        </Text>
        {ad.description && (
          <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={3}>
            {ad.description}
          </Text>
        )}

        {/* Business name */}
        {ad.business?.name && (
          <Text style={[styles.businessName, { color: colors.mutedForeground }]} numberOfLines={1}>
            {ad.business.name}
          </Text>
        )}

        {/* CTA button */}
        {ad.cta_text && ad.link_url && (
          <View style={[styles.ctaBtn, { backgroundColor: colors.foreground }]}>
            <Text style={[styles.ctaText, { color: colors.background }]} numberOfLines={1}>
              {ad.cta_text}
            </Text>
            <ExternalLink size={14} color={colors.background} />
          </View>
        )}
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sponsoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 8,
  },
  sponsoredText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 14,
  },
  image: {
    width: '100%',
    height: 160,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: fonts.headingSemi,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
  },
  businessName: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    marginTop: 2,
    lineHeight: 16,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 6,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})

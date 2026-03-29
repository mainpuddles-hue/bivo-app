import { memo, useCallback, useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { Image } from 'expo-image'
import { ExternalLink, Megaphone } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { cardShadow, cardShadowDark } from '@/lib/shadows'

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
  const { colors, isDark } = useTheme()
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
      Linking.openURL(ad.link_url)
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
        { backgroundColor: colors.card },
        isDark ? cardShadowDark : cardShadow,
      ]}
      accessibilityRole="button"
      accessibilityLabel={ad.title}
    >
      {/* Sponsored label */}
      <View style={[styles.sponsoredBadge, { backgroundColor: `${colors.pro}18` }]}>
        <Megaphone size={11} color={colors.pro} />
        <Text style={[styles.sponsoredText, { color: colors.pro }]}>{t('ads.sponsored')}</Text>
      </View>

      {/* Image */}
      {ad.image_url && (
        <Image
          source={{ uri: ad.image_url }}
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
          <Text style={[styles.businessName, { color: colors.mutedForeground }]}>
            {ad.business.name}
          </Text>
        )}

        {/* CTA button */}
        {ad.cta_text && ad.link_url && (
          <View style={[styles.ctaBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              {ad.cta_text}
            </Text>
            <ExternalLink size={14} color={colors.primaryForeground} />
          </View>
        )}
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  sponsoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 8,
  },
  sponsoredText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  image: {
    width: '100%',
    height: 160,
  },
  content: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: fonts.headingSemi,
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
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
})

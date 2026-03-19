import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Crown, Lock } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'

interface ProGateProps {
  children: ReactNode
  feature: string
}

export function ProGate({ children, feature }: ProGateProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [isPro, setIsPro] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (mounted) setIsPro(false); return }

        const { data } = await supabase
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single()

        if (mounted) setIsPro(!!(data as any)?.is_pro)
      } catch {
        if (mounted) setIsPro(false)
      }
    }

    check()
    return () => { mounted = false }
  }, [supabase])

  // Still loading
  if (isPro === null) return null

  // Pro user — render children
  if (isPro) return <>{children}</>

  // Not pro — render locked overlay
  return (
    <View style={s.wrapper}>
      <View style={s.childrenContainer} pointerEvents="none">
        {children}
      </View>
      <View style={[s.overlay, { backgroundColor: `${colors.background}E6` }]}>
        <View style={[s.lockCard, { backgroundColor: colors.card }]}>
          <View style={[s.iconCircle, { backgroundColor: `${colors.pro}20` }]}>
            <Lock size={28} color={colors.pro} />
          </View>
          <Text style={[s.featureText, { color: colors.foreground }]}>{feature}</Text>
          <Text style={[s.descText, { color: colors.mutedForeground }]}>
            {t('profile.upgradeToProDesc')}
          </Text>
          <Pressable
            onPress={() => router.push('/pro')}
            style={[s.upgradeBtn, { backgroundColor: colors.pro }]}
          >
            <Crown size={16} color="#FFFFFF" />
            <Text style={s.upgradeBtnText}>{t('profile.upgradeToPro')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: { position: 'relative' },
  childrenContainer: { opacity: 0.3 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    alignItems: 'center', gap: 12,
    padding: 28, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    width: '100%', maxWidth: 300,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  featureText: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  descText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4,
  },
  upgradeBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
})

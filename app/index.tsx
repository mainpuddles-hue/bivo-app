import { useEffect, useRef } from 'react'
import { View, Animated, Easing, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from '@/hooks/useSupabase'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

export default function SplashScreen() {
  const { t } = useI18n()
  const supabase = useSupabase()
  const router = useRouter()

  const wordOpacity = useRef(new Animated.Value(0)).current
  const wordScale = useRef(new Animated.Value(0.88)).current
  const dotOpacity = useRef(new Animated.Value(0)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const screenOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(wordOpacity, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(wordScale, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    setTimeout(() => {
      Animated.timing(dotOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    }, 900)

    setTimeout(() => {
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start()
    }, 1600)
  }, [])

  useEffect(() => {
    let mounted = true
    const timer = setTimeout(async () => {
      if (!mounted) return

      let target: string
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          target = '/(auth)/login'
        } else {
          const flag = await AsyncStorage.getItem('onboarding_complete')
          if (flag === 'true') {
            target = '/(tabs)'
          } else {
            const { data: profile } = await supabase
              .from('profiles')
              .select('naapurusto')
              .eq('id', user.id)
              .maybeSingle()
            if ((profile as any)?.naapurusto) {
              await AsyncStorage.setItem('onboarding_complete', 'true')
              target = '/(tabs)'
            } else {
              target = '/onboarding'
            }
          }
        }
      } catch {
        target = '/(auth)/login'
      }

      if (!mounted) return
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        if (mounted) router.replace(target as any)
      })
    }, 2200)

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [supabase, router])

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <Animated.View style={[styles.wordmarkRow, { opacity: wordOpacity, transform: [{ scale: wordScale }] }]}>
        <Animated.Text style={styles.wordmark}>bivo</Animated.Text>
        <Animated.Text style={[styles.wordmark, { opacity: dotOpacity }]}>.</Animated.Text>
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        {t('splash.tagline') || 'Naapurustosi markkinapaikka'}
      </Animated.Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmark: {
    fontSize: 96,
    fontWeight: '700',
    fontFamily: fonts.displayBold,
    color: '#fff',
    letterSpacing: -7,
  },
  tagline: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.30)',
    marginTop: 36,
    letterSpacing: 4.5,
    textTransform: 'uppercase',
  },
})

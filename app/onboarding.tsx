import { useState, useMemo, useCallback, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowRight, MapPin, Camera, Check, ChevronRight } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { TackBirdLogo } from '@/components/TackBirdLogo'

// Helsinki neighborhoods — matches web NEIGHBORHOODS constant
const NEIGHBORHOODS = [
  'Kallio', 'Kamppi', 'Kruununhaka', 'Punavuori', 'Ullanlinna',
  'Töölö', 'Vallila', 'Sörnäinen', 'Hermanni', 'Pasila',
  'Alppila', 'Arabia', 'Kumpula', 'Käpylä', 'Toukola',
  'Lauttasaari', 'Munkkiniemi', 'Meilahti', 'Pikku Huopalahti',
  'Herttoniemi', 'Kulosaari', 'Itäkeskus', 'Vuosaari',
  'Kontula', 'Mellunmäki', 'Malmi', 'Pukinmäki', 'Tapanila',
  'Kannelmäki', 'Haaga', 'Pitäjänmäki', 'Munkkivuori',
  'Viikki', 'Suutarila', 'Oulunkylä', 'Maunula',
  'Jätkäsaari', 'Ruoholahti', 'Hakaniemi', 'Katajanokka',
]

type OnboardingStep = 'welcome' | 'neighborhood' | 'profile'

export default function OnboardingScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Pre-fill name from auth metadata
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.name) {
        setName(user.user_metadata.name)
      } else if (user?.user_metadata?.full_name) {
        setName(user.user_metadata.full_name)
      }
    })
  }, [supabase])

  const handleSkip = useCallback(async () => {
    if (step === 'welcome') {
      setStep('neighborhood')
    } else if (step === 'neighborhood') {
      setStep('profile')
    } else {
      // Skip profile step — just mark complete
      await AsyncStorage.setItem('onboarding_complete', 'true')
      router.replace('/')
    }
  }, [step, router])

  const handlePickAvatar = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri)
    }
  }, [])

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert(t('common.error'), t('auth.loginRequired'))
        router.replace('/(auth)/login')
        return
      }

      // Build update payload
      const updates: Record<string, any> = {}
      if (selectedNeighborhood) updates.naapurusto = selectedNeighborhood
      if (name.trim()) updates.name = name.trim()

      // Upload avatar if selected
      if (avatarUri) {
        const ext = avatarUri.split('.').pop() ?? 'jpg'
        const path = `avatars/${user.id}.${ext}`
        const response = await fetch(avatarUri)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true })
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        updates.avatar_url = urlData.publicUrl
      }

      // Update profile
      if (Object.keys(updates).length > 0) {
        await (supabase.from('profiles') as any).update(updates).eq('id', user.id)
      }

      // Mark onboarding complete
      await AsyncStorage.setItem('onboarding_complete', 'true')
      router.replace('/')
    } catch (err) {
      Alert.alert(t('common.error'), t('onboarding.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [supabase, selectedNeighborhood, name, avatarUri, router, t])

  // ── Step 1: Welcome ──
  if (step === 'welcome') {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Pressable onPress={handleSkip} style={s.skipBtn} hitSlop={12}>
          <Text style={[s.skipText, { color: colors.mutedForeground }]}>{t('onboarding.skip')}</Text>
        </Pressable>

        <View style={s.welcomeContent}>
          <View style={[s.logoBigCircle, { backgroundColor: colors.primary }]}>
            <TackBirdLogo size={48} color={colors.primaryForeground} />
          </View>
          <Text style={[s.appName, { color: colors.primary }]}>TACKBIRD</Text>
          <Text style={[s.tagline, { color: colors.foreground }]}>
            {t('onboarding.welcomeTitle')}
          </Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            {t('onboarding.welcomeSubtitle')}
          </Text>
        </View>

        <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable
            onPress={() => setStep('neighborhood')}
            style={[s.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.primaryBtnText, { color: colors.primaryForeground }]}>
              {t('onboarding.getStarted')}
            </Text>
            <ArrowRight size={18} color={colors.primaryForeground} />
          </Pressable>

          <View style={s.dots}>
            <View style={[s.dot, { backgroundColor: colors.primary }]} />
            <View style={[s.dot, { backgroundColor: colors.muted }]} />
            <View style={[s.dot, { backgroundColor: colors.muted }]} />
          </View>
        </View>
      </View>
    )
  }

  // ── Step 2: Neighborhood Selection ──
  if (step === 'neighborhood') {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={s.stepHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.stepTitle, { color: colors.foreground }]}>
              {t('onboarding.neighborhoodTitle')}
            </Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              {t('onboarding.neighborhoodSubtitle')}
            </Text>
          </View>
          <Pressable onPress={handleSkip} hitSlop={12}>
            <Text style={[s.skipText, { color: colors.mutedForeground }]}>{t('onboarding.skip')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.neighborhoodGrid} showsVerticalScrollIndicator={false}>
          {NEIGHBORHOODS.map((nh) => {
            const isSelected = selectedNeighborhood === nh
            return (
              <Pressable
                key={nh}
                onPress={() => setSelectedNeighborhood(nh)}
                style={[
                  s.neighborhoodChip,
                  isSelected
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
              >
                {isSelected && <Check size={14} color={colors.primaryForeground} />}
                <MapPin size={14} color={isSelected ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[
                  s.neighborhoodText,
                  { color: isSelected ? colors.primaryForeground : colors.foreground },
                ]}>
                  {nh}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable
            onPress={() => setStep('profile')}
            style={[
              s.primaryBtn,
              { backgroundColor: selectedNeighborhood ? colors.primary : colors.muted },
            ]}
          >
            <Text style={[
              s.primaryBtnText,
              { color: selectedNeighborhood ? colors.primaryForeground : colors.mutedForeground },
            ]}>
              {t('common.continue')}
            </Text>
            <ChevronRight size={18} color={selectedNeighborhood ? colors.primaryForeground : colors.mutedForeground} />
          </Pressable>

          <View style={s.dots}>
            <View style={[s.dot, { backgroundColor: colors.muted }]} />
            <View style={[s.dot, { backgroundColor: colors.primary }]} />
            <View style={[s.dot, { backgroundColor: colors.muted }]} />
          </View>
        </View>
      </View>
    )
  }

  // ── Step 3: Profile Setup ──
  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={s.stepHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[s.stepTitle, { color: colors.foreground }]}>
            {t('onboarding.profileTitle')}
          </Text>
          <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
            {t('onboarding.profileSubtitle')}
          </Text>
        </View>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <Text style={[s.skipText, { color: colors.mutedForeground }]}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.profileContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={s.avatarSection}>
          <Pressable onPress={handlePickAvatar}>
            {avatarUri ? (
              <View>
                <Image source={{ uri: avatarUri }} style={s.avatar} />
                <View style={[s.cameraBtn, { backgroundColor: colors.primary }]}>
                  <Camera size={14} color={colors.primaryForeground} />
                </View>
              </View>
            ) : (
              <View>
                <View style={[s.avatar, s.avatarPlaceholder, { backgroundColor: colors.muted }]}>
                  <Camera size={28} color={colors.mutedForeground} />
                </View>
                <View style={[s.cameraBtn, { backgroundColor: colors.primary }]}>
                  <Camera size={14} color={colors.primaryForeground} />
                </View>
              </View>
            )}
          </Pressable>
          <Text style={[s.avatarHint, { color: colors.mutedForeground }]}>
            {t('onboarding.addPhoto')}
          </Text>
        </View>

        {/* Name input */}
        <View style={s.field}>
          <Text style={[s.label, { color: colors.foreground }]}>{t('onboarding.nameLabel')}</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder={t('onboarding.namePlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            maxLength={50}
          />
        </View>

        {/* Selected neighborhood summary */}
        {selectedNeighborhood && (
          <View style={[s.nhSummary, { backgroundColor: `${colors.primary}12` }]}>
            <MapPin size={16} color={colors.primary} />
            <Text style={[s.nhSummaryText, { color: colors.primary }]}>{selectedNeighborhood}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={handleComplete}
          disabled={saving}
          style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Text style={[s.primaryBtnText, { color: colors.primaryForeground }]}>
                {t('onboarding.complete')}
              </Text>
              <Check size={18} color={colors.primaryForeground} />
            </>
          )}
        </Pressable>

        <View style={s.dots}>
          <View style={[s.dot, { backgroundColor: colors.muted }]} />
          <View style={[s.dot, { backgroundColor: colors.muted }]} />
          <View style={[s.dot, { backgroundColor: colors.primary }]} />
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: {
    alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 12,
  },
  skipText: { fontSize: 14, fontWeight: '500' },

  // Welcome step
  welcomeContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32,
  },
  logoBigCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  appName: { fontSize: 22, fontWeight: '800', letterSpacing: 4 },
  tagline: { fontSize: 24, fontWeight: '700', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // Step header
  stepHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 16,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  stepTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  stepSubtitle: { fontSize: 14, marginTop: 4, lineHeight: 20 },

  // Neighborhood grid
  neighborhoodGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingBottom: 24,
  },
  neighborhoodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
  },
  neighborhoodText: { fontSize: 14, fontWeight: '500' },

  // Profile step
  profileContent: {
    paddingHorizontal: 20, paddingBottom: 24, gap: 24,
  },
  avatarSection: { alignItems: 'center', gap: 8, paddingTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarHint: { fontSize: 13 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, minHeight: 48,
  },
  nhSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
  },
  nhSummaryText: { fontSize: 15, fontWeight: '600' },

  // Bottom area
  bottomArea: {
    paddingHorizontal: 20, gap: 16,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 16, minHeight: 52,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
  dots: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
})

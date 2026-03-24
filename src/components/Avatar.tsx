import { View, Text } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '@/hooks/useTheme'

interface AvatarProps {
  url: string | null | undefined
  name: string | null | undefined
  size?: number
  borderColor?: string
  borderWidth?: number
}

export function Avatar({ url, name, size = 36, borderColor, borderWidth }: AvatarProps) {
  const { colors } = useTheme()
  const radius = size / 2
  const initial = (name || '?').charAt(0).toUpperCase()
  const fontSize = size < 24 ? 8 : size < 36 ? 10 : size < 48 ? 13 : size < 64 ? 18 : 32

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[
          { width: size, height: size, borderRadius: radius },
          borderColor ? { borderWidth: borderWidth ?? 1, borderColor } : undefined,
        ]}
      />
    )
  }

  return (
    <View style={[
      { width: size, height: size, borderRadius: radius, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
      borderColor ? { borderWidth: borderWidth ?? 1, borderColor } : undefined,
    ]}>
      <Text style={{ fontSize, fontWeight: '600', color: colors.mutedForeground }}>{initial}</Text>
    </View>
  )
}

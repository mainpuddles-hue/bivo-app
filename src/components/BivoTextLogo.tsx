import { Text, StyleSheet } from 'react-native'
import { fonts } from '@/lib/fonts'

interface BivoTextLogoProps {
  width?: number
  color?: string
}

export function BivoTextLogo({ width = 180, color = '#1A1A1A' }: BivoTextLogoProps) {
  const fontSize = width * 0.36
  return (
    <Text
      style={[
        styles.logo,
        { fontSize, color },
      ]}
      accessibilityRole="header"
    >
      bivo.
    </Text>
  )
}

const styles = StyleSheet.create({
  logo: {
    fontFamily: fonts.displayBold,
    fontWeight: '700',
    letterSpacing: -3,
    includeFontPadding: false,
  },
})

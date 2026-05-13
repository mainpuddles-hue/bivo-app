import { Text, StyleSheet } from 'react-native'

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
    fontWeight: '700',
    letterSpacing: -2.5,
    includeFontPadding: false,
  },
})

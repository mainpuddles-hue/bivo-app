import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'
import { MapPin } from 'lucide-react-native'

export default function MapWebFallback() {
  const { colors } = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapPin size={40} color={colors.mutedForeground} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Kartta on saatavilla mobiilisovelluksessa.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  text: { fontSize: 14, fontFamily: fonts.body, textAlign: 'center' },
})

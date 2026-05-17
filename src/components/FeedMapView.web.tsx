import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'
import { Map } from 'lucide-react-native'

export function FeedMapView(_props: any) {
  const { colors } = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <Map size={40} color={colors.mutedForeground} strokeWidth={1.5} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Kartta on saatavilla iOS- ja Android-sovelluksessa
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 18, margin: 22, padding: 32 },
  text: { fontSize: 14, fontFamily: fonts.body, textAlign: 'center' },
})

import { Platform } from 'react-native'

// Platform-conditional: Leaflet for web, react-native-maps for native
const MapScreen = Platform.OS === 'web'
  ? require('../src/components/MapWeb').default
  : require('../src/components/MapNative').default

export default MapScreen

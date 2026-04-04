import MapScreen from '@/components/MapNative'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

export default function MapPage() {
  return (
    <ScreenErrorBoundary screenName="Map">
      <MapScreen />
    </ScreenErrorBoundary>
  )
}

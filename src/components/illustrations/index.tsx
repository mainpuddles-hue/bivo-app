import Svg, { Path, Circle, Rect } from 'react-native-svg'

// Helsinki Dusk brand colors
const PRIMARY = '#2D6B5E'
const ACCENT = '#4CAF6A'
const MUTED_GREEN = '#3A8B6E'
const LIGHT_GREEN = '#A8D5BA'

// Category colors
const TARVITSEN = '#C75B3A'
const TARJOAN = '#7C5CBF'
const ILMAISTA = '#3B7DD8'
const NAPPAA = '#E8A050'

/**
 * PinIllustration — A teardrop map pin in primary green with a white center dot.
 */
export function PinIllustration({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 10 C30 10 16 26 16 44 C16 66 50 90 50 90 C50 90 84 66 84 44 C84 26 70 10 50 10 Z"
        fill={PRIMARY}
        opacity={0.9}
      />
      <Path
        d="M50 14 C32 14 20 28 20 44 C20 62 50 84 50 84 C50 84 80 62 80 44 C80 28 68 14 50 14 Z"
        fill={MUTED_GREEN}
      />
      <Circle cx={50} cy={42} r={14} fill="#FFFFFF" opacity={0.95} />
      <Circle cx={50} cy={42} r={8} fill={ACCENT} />
    </Svg>
  )
}

/**
 * BoardIllustration — A bulletin board with 4 colored cards pinned to it.
 */
export function BoardIllustration({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Board frame */}
      <Rect x={10} y={14} width={80} height={72} rx={6} fill={PRIMARY} opacity={0.15} />
      <Rect x={14} y={18} width={72} height={64} rx={4} fill="#FFFFFF" opacity={0.6} />
      {/* Card 1 - top left */}
      <Rect x={20} y={24} width={24} height={18} rx={2} fill={TARVITSEN} opacity={0.85} />
      <Circle cx={32} cy={24} r={3} fill={PRIMARY} />
      {/* Card 2 - top right */}
      <Rect x={56} y={26} width={24} height={16} rx={2} fill={TARJOAN} opacity={0.85} />
      <Circle cx={68} cy={26} r={3} fill={PRIMARY} />
      {/* Card 3 - bottom left */}
      <Rect x={22} y={50} width={22} height={20} rx={2} fill={ILMAISTA} opacity={0.85} />
      <Circle cx={33} cy={50} r={3} fill={PRIMARY} />
      {/* Card 4 - bottom right */}
      <Rect x={54} y={52} width={26} height={16} rx={2} fill={NAPPAA} opacity={0.85} />
      <Circle cx={67} cy={52} r={3} fill={PRIMARY} />
    </Svg>
  )
}

/**
 * CityMapIllustration — A simplified city map/grid with a location pin.
 * Grid of rectangles (streets) in muted green tones with a primary green pin marker.
 */
export function CityMapIllustration({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Background */}
      <Rect x={5} y={5} width={90} height={90} rx={8} fill={PRIMARY} opacity={0.06} />
      {/* Horizontal streets */}
      <Rect x={10} y={30} width={80} height={4} rx={2} fill={MUTED_GREEN} opacity={0.25} />
      <Rect x={10} y={50} width={80} height={4} rx={2} fill={MUTED_GREEN} opacity={0.25} />
      <Rect x={10} y={70} width={80} height={4} rx={2} fill={MUTED_GREEN} opacity={0.25} />
      {/* Vertical streets */}
      <Rect x={25} y={15} width={4} height={75} rx={2} fill={MUTED_GREEN} opacity={0.25} />
      <Rect x={50} y={15} width={4} height={75} rx={2} fill={MUTED_GREEN} opacity={0.25} />
      <Rect x={72} y={15} width={4} height={75} rx={2} fill={MUTED_GREEN} opacity={0.25} />
      {/* City blocks */}
      <Rect x={30} y={35} width={18} height={13} rx={3} fill={ACCENT} opacity={0.3} />
      <Rect x={55} y={55} width={15} height={13} rx={3} fill={PRIMARY} opacity={0.35} />
      <Rect x={12} y={55} width={11} height={13} rx={3} fill={LIGHT_GREEN} opacity={0.4} />
      {/* Pin marker */}
      <Path
        d="M52 12 C44 12 38 18.5 38 26 C38 36 52 48 52 48 C52 48 66 36 66 26 C66 18.5 60 12 52 12 Z"
        fill={PRIMARY}
        opacity={0.9}
      />
      <Circle cx={52} cy={25} r={6} fill="#FFFFFF" opacity={0.95} />
      <Circle cx={52} cy={25} r={3.5} fill={ACCENT} />
    </Svg>
  )
}


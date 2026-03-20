import Svg, { Path, Circle, Rect, G, Polygon } from 'react-native-svg'

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
 * NeighborhoodIllustration — A simple rooftop skyline with 5 geometric houses.
 */
export function NeighborhoodIllustration({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 80">
      {/* Sky background hint */}
      <Rect x={0} y={0} width={120} height={80} rx={8} fill={PRIMARY} opacity={0.06} />
      {/* House 1 - short */}
      <Rect x={8} y={48} width={18} height={24} fill={PRIMARY} opacity={0.6} />
      <Polygon points="8,48 17,36 26,48" fill={MUTED_GREEN} opacity={0.7} />
      {/* House 2 - tall */}
      <Rect x={28} y={32} width={16} height={40} fill={ACCENT} opacity={0.5} />
      <Polygon points="28,32 36,20 44,32" fill={ACCENT} opacity={0.7} />
      {/* House 3 - medium */}
      <Rect x={46} y={40} width={20} height={32} fill={PRIMARY} opacity={0.7} />
      <Polygon points="46,40 56,26 66,40" fill={PRIMARY} opacity={0.9} />
      {/* House 4 - tallest */}
      <Rect x={68} y={28} width={14} height={44} fill={MUTED_GREEN} opacity={0.55} />
      <Polygon points="68,28 75,16 82,28" fill={LIGHT_GREEN} opacity={0.7} />
      {/* House 5 - small */}
      <Rect x={86} y={50} width={22} height={22} fill={ACCENT} opacity={0.4} />
      <Polygon points="86,50 97,38 108,50" fill={MUTED_GREEN} opacity={0.6} />
      {/* Ground line */}
      <Rect x={0} y={72} width={120} height={8} rx={4} fill={PRIMARY} opacity={0.1} />
    </Svg>
  )
}

/**
 * BirdMascot — A cute minimal bird (the TackBird). Round body, beak, and eyes.
 */
export function BirdMascot({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Body */}
      <Circle cx={50} cy={52} r={28} fill={ACCENT} />
      {/* Belly highlight */}
      <Circle cx={50} cy={58} r={18} fill="#FFFFFF" opacity={0.2} />
      {/* Left eye */}
      <Circle cx={40} cy={44} r={4} fill="#1A1A1A" />
      <Circle cx={41} cy={43} r={1.5} fill="#FFFFFF" />
      {/* Right eye */}
      <Circle cx={60} cy={44} r={4} fill="#1A1A1A" />
      <Circle cx={61} cy={43} r={1.5} fill="#FFFFFF" />
      {/* Beak */}
      <Polygon points="50,50 44,56 56,56" fill={NAPPAA} />
      {/* Wing (left) */}
      <Path
        d="M22 52 C18 42 24 34 34 38 C28 44 26 50 28 56 Z"
        fill={MUTED_GREEN}
        opacity={0.7}
      />
      {/* Tail feathers */}
      <Path
        d="M74 60 C82 54 88 58 86 66 C80 62 76 62 74 60 Z"
        fill={MUTED_GREEN}
        opacity={0.6}
      />
      {/* Feet */}
      <Path d="M42 78 L38 86 M42 78 L42 86 M42 78 L46 86" stroke={NAPPAA} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M58 78 L54 86 M58 78 L58 86 M58 78 L62 86" stroke={NAPPAA} strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* Head tuft */}
      <Path d="M50 24 C48 18 52 14 54 20 C56 14 60 18 56 24" fill={ACCENT} opacity={0.8} />
    </Svg>
  )
}

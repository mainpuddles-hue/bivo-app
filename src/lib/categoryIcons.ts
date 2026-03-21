import { HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays } from 'lucide-react-native'

export const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays,
}

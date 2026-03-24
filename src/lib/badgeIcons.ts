import {
  BadgeCheck, Crown, Shield, Flame, Star, HandHelping,
  TrendingUp, BookOpen, CalendarDays, Award,
} from 'lucide-react-native'

export const BADGE_ICONS: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  verified: { icon: BadgeCheck, color: '#3B82F6' },
  pro: { icon: Crown, color: '#F59E0B' },
  trusted: { icon: Shield, color: '#10B981' },
  active: { icon: Flame, color: '#EF4444' },
  first_post: { icon: Star, color: '#4CAF6A' },
  helper: { icon: HandHelping, color: '#3B7DD8' },
  popular: { icon: TrendingUp, color: '#E8A050' },
  lender: { icon: BookOpen, color: '#C98B2E' },
  event_creator: { icon: CalendarDays, color: '#2B8A62' },
  weekly_active: { icon: Flame, color: '#EF4444' },
  neighborhood_hero: { icon: Award, color: '#8E44AD' },
}

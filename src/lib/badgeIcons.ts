import {
  BadgeCheck, Crown, Shield, Flame, Star, HandHelping,
  TrendingUp, BookOpen, CalendarDays, Award, UserPlus, Users,
  Zap, Timer,
} from 'lucide-react-native'
import type { BadgeType } from './types'

export const BADGE_ICONS: Record<BadgeType, { icon: React.ComponentType<any>; color: string }> = {
  verified: { icon: BadgeCheck, color: '#3B82F6' },
  pro: { icon: Crown, color: '#F59E0B' },
  trusted: { icon: Shield, color: '#2D7A4F' },
  active: { icon: Flame, color: '#EF4444' },
  first_post: { icon: Star, color: '#2B8A62' },
  helper: { icon: HandHelping, color: '#3B7DD8' },
  popular: { icon: TrendingUp, color: '#E8A050' },
  lender: { icon: BookOpen, color: '#C98B2E' },
  event_creator: { icon: CalendarDays, color: '#2B8A62' },
  weekly_active: { icon: Flame, color: '#EF4444' },
  neighborhood_hero: { icon: Award, color: '#8E44AD' },
  first_invite: { icon: UserPlus, color: '#2D7A4F' },
  community_builder: { icon: Users, color: '#3B82F6' },
  salamanopea: { icon: Zap, color: '#EF4444' },
  nopea: { icon: Timer, color: '#F59E0B' },
}

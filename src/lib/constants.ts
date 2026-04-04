import type { PostType } from './types'

export const POST_SELECT = `
  id, user_id, type, title, description, location, image_url,
  hub_pickup_id, expires_at, daily_fee, service_price, event_date,
  latitude, longitude, is_pro_listing, is_active, is_urgent, urgency_hours, is_anonymous, tags,
  like_count, comment_count,
  created_at, updated_at,
  user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto, is_pro, is_hub, location_accuracy, user_badges(badge_type)),
  images:post_images(id, image_url, sort_order)
`

export const SERVICE_FEE_RATE = 0.10 // 10% platform fee

// "Juuri nyt" urgency engine
export const URGENCY_OPTIONS = [
  { hours: 2, label: 'urgency.2hours', color: '#EF4444' },
  { hours: 4, label: 'urgency.4hours', color: '#F59E0B' },
  { hours: 8, label: 'urgency.8hours', color: '#E8A050' },
] as const

// TODO: ENHANCEMENT — implement speed badge awarding logic: measure response time
// in conversation, compare against thresholds, insert into user_badges table,
// and display on profile. Translations exist: urgency.speedBadgeSalamanopea / speedBadgeNopea
export const SPEED_BADGE_THRESHOLDS = {
  salamanopea: 15,  // minutes — lightning fast
  nopea: 60,        // minutes — quick responder
} as const

export const CATEGORIES: Record<PostType, {
  label: string
  subtitle: string
  icon: string
  color: string
  bgLight: string
  bgDark: string
}> = {
  tarvitsen: {
    label: 'categories.tarvitsen',
    subtitle: 'categories.tarvitsenSub',
    icon: 'HandHelping',
    color: '#C75B3A',
    bgLight: '#FDF0EB',
    bgDark: '#2A1A15',
  },
  tarjoan: {
    label: 'categories.tarjoan',
    subtitle: 'categories.tarjoanSub',
    icon: 'Gift',
    color: '#7C5CBF',
    bgLight: '#F4EFFF',
    bgDark: '#1A1525',
  },
  ilmaista: {
    label: 'categories.ilmaista',
    subtitle: 'categories.ilmaistaSub',
    icon: 'Heart',
    color: '#3B7DD8',
    bgLight: '#EBF2FE',
    bgDark: '#101A2D',
  },
  nappaa: {
    label: 'categories.nappaa',
    subtitle: 'categories.nappaaSub',
    icon: 'Zap',
    color: '#E8A050',
    bgLight: '#FFF5E8',
    bgDark: '#2D2010',
  },
  lainaa: {
    label: 'categories.lainaa',
    subtitle: 'categories.lainaaSub',
    icon: 'BookOpen',
    color: '#C98B2E',
    bgLight: '#FDF6E8',
    bgDark: '#2D2010',
  },
  tapahtuma: {
    label: 'categories.tapahtuma',
    subtitle: 'categories.tapahtumaSub',
    icon: 'CalendarDays',
    color: '#2B8A62',
    bgLight: '#E8F7EF',
    bgDark: '#102D1A',
  },
}

// Three-tier trust configuration
export const TRUST_TIERS = {
  1: {
    level: 1 as const,
    nameKey: 'trust.tier1',
    color: '#9CA3AF',
    icon: 'Shield' as const,
    permissions: {
      canLainaa: false,
      canOfferPaidServices: false,
      maxDailyFee: 0,
      maxServicePrice: 0,
      priorityInFeed: false,
      trustedBadge: false,
    },
  },
  2: {
    level: 2 as const,
    nameKey: 'trust.tier2',
    color: '#3B82F6',
    icon: 'ShieldCheck' as const,
    permissions: {
      canLainaa: true,
      canOfferPaidServices: true,
      maxDailyFee: 50,
      maxServicePrice: 200,   // max 200€ per service
      priorityInFeed: false,
      trustedBadge: false,
    },
  },
  3: {
    level: 3 as const,
    nameKey: 'trust.tier3',
    color: '#10B981',
    icon: 'ShieldPlus' as const,
    permissions: {
      canLainaa: true,
      canOfferPaidServices: true,
      maxDailyFee: null, // unlimited
      maxServicePrice: null, // unlimited
      priorityInFeed: true,
      trustedBadge: true,
    },
  },
} as const

// Tier 2 requirements
export const TIER_2_REQUIREMENTS = {
  idVerified: true,
  minAccountAgeDays: 7,
}

// Tier 3 requirements
export const TIER_3_REQUIREMENTS = {
  minReviews: 3,
  minAvgRating: 4.0,
  minResponseRate: 90,
  minAccountAgeDays: 30,
  noActiveReports: true,
}

// Centralized forum category colors — used by ForumPostCard and ForumCreateModal
export const FORUM_CATEGORY_COLORS: Record<string, string> = {
  vinkit: '#4CAF6A',
  kysymykset: '#3B7DD8',
  tapahtumat: '#2B8A62',
  uutiset: '#8E44AD',
} as const

// Event source badge colors — used by map EventCard and DetailModal
export const EVENT_SOURCE_COLORS = {
  helsinki: '#8E44AD',
  ticketmaster: '#E91E63',
  community: '#2B8A62',
  free: '#2B8A62',
  paid: '#E8A050',
} as const

// DEPRECATED: Use useCityConfig hook instead. Kept as offline fallback for Helsinki.
export const NEIGHBORHOODS = [
  'Kallio', 'Sörnäinen', 'Vallila', 'Hermanni', 'Alppiharju',
  'Pasila', 'Käpylä', 'Kumpula', 'Toukola', 'Arabia',
  'Kruununhaka', 'Katajanokka', 'Punavuori', 'Ullanlinna', 'Eira',
  'Töölö', 'Meilahti', 'Munkkiniemi', 'Lauttasaari', 'Ruoholahti',
  'Jätkäsaari', 'Kamppi', 'Hakaniemi', 'Merihaka', 'Kulosaari',
  'Herttoniemi', 'Laajasalo', 'Vuosaari', 'Mellunmäki', 'Kontula',
  'Malmi', 'Tapanila', 'Pukinmäki', 'Oulunkylä', 'Maunula',
  'Pitäjänmäki', 'Haaga', 'Viikki', 'Suutarila', 'Tapulikaupunki',
] as const

import type { PostType } from './types'

export const POST_SELECT = `
  id, user_id, type, title, description, location, image_url,
  hub_pickup_id, expires_at, daily_fee, service_price, event_date,
  latitude, longitude, is_pro_listing, is_active, is_urgent, urgency_hours, is_anonymous, is_seed, tags,
  like_count, comment_count,
  created_at, updated_at,
  user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto, is_pro, is_hub, location_accuracy, user_badges(badge_type)),
  images:post_images(id, image_url, sort_order)
`

export const SERVICE_FEE_RATE = 0.10 // 10% platform fee

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
  ilmaista: {
    label: 'categories.ilmaista',
    subtitle: 'categories.ilmaistaSub',
    icon: 'Heart',
    color: '#3B7DD8',
    bgLight: '#EBF2FE',
    bgDark: '#101A2D',
  },
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
  tapahtuma: {
    label: 'categories.tapahtuma',
    subtitle: 'categories.tapahtumaSub',
    icon: 'CalendarDays',
    color: '#2B8A62',
    bgLight: '#E8F7EF',
    bgDark: '#102D1A',
  },
  lainaa: {
    label: 'categories.lainaa',
    subtitle: 'categories.lainaaSub',
    icon: 'BookOpen',
    color: '#A97A1E',
    bgLight: '#FDF6E8',
    bgDark: '#2D2010',
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
      canLainaa: true,
      canOfferPaidServices: false,
      maxDailyFee: 50,
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
    color: '#2D7A4F',
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

// ── Lending deposit suggestions by item tag ──
// Multiplier: deposit = daily_fee × multiplier (clamped to min/max)
export const DEPOSIT_SUGGESTIONS: Record<string, { min: number; max: number; multiplier: number }> = {
  tyokalut:      { min: 50,  max: 200, multiplier: 3 },
  elektroniikka: { min: 100, max: 500, multiplier: 4 },
  urheilu:       { min: 50,  max: 300, multiplier: 3 },
  musiikki:      { min: 100, max: 400, multiplier: 4 },
} as const

/** Calculate suggested deposit from daily fee + item tags */
export function suggestDeposit(dailyFee: number, tags: string[] = []): number {
  // Find the best matching tag
  const match = tags.find(t => t in DEPOSIT_SUGGESTIONS)
  const config = match ? DEPOSIT_SUGGESTIONS[match] : { min: 50, max: 300, multiplier: 3 }
  const suggested = Math.round(dailyFee * config.multiplier)
  return Math.max(config.min, Math.min(config.max, suggested))
}

// Centralized forum category colors — used by ForumPostCard and ForumCreateModal
export const FORUM_CATEGORY_COLORS: Record<string, string> = {
  vinkit: '#2B8A62',
  kysymykset: '#3B7DD8',
  tapahtumat: '#2B8A62',
  uutiset: '#8E44AD',
} as const

// Centralized event category colors — used by EventCard, event/[id], community-events, create-event
export const EVENT_CATEGORY_COLORS: Record<string, string> = {
  social: '#7C5CBF',
  sports: '#2B8A62',
  culture: '#3B7DD8',
  nature: '#2B8A62',
  kids: '#D08B30',
  other: '#6B7280',
} as const

// Quick event ("Pöytä") categories — icon names map to Lucide React Native components
export const TABLE_CATEGORIES = {
  coffee: { icon: 'Coffee' as const, color: '#8B5E3C', bgLight: '#FDF5F0', bgDark: '#2A1E15', label: 'tables.catCoffee' },
  lunch: { icon: 'UtensilsCrossed' as const, color: '#D08B30', bgLight: '#FFF5E8', bgDark: '#2D2010', label: 'tables.catLunch' },
  walk: { icon: 'Footprints' as const, color: '#2B8A62', bgLight: '#E8F7EF', bgDark: '#102D1A', label: 'tables.catWalk' },
  sports: { icon: 'Trophy' as const, color: '#3B7DD8', bgLight: '#EBF2FE', bgDark: '#101A2D', label: 'tables.catSports' },
  hangout: { icon: 'Handshake' as const, color: '#7C5CBF', bgLight: '#F4EFFF', bgDark: '#1A1525', label: 'tables.catHangout' },
} as const

export const EVENT_CHAT_PAGE_SIZE = 30

// DEPRECATED: Use dynamic city_neighborhoods query instead. Kept as offline fallback for Helsinki.
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

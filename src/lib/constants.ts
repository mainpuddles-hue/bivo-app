import type { PostType } from './types'

export const POST_SELECT = `
  id, user_id, type, title, description, location, image_url,
  hub_pickup_id, expires_at, daily_fee, event_date,
  latitude, longitude, is_pro_listing, is_active, tags,
  like_count, comment_count,
  created_at, updated_at,
  user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto, is_pro, is_hub, user_badges(badge_type)),
  images:post_images(id, image_url, sort_order)
`

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

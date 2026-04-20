// Database types for TackBird — shared with web app

export type BoostTier = 'free' | 'pro' | 'business'

export type PostType =
  | 'tarvitsen'
  | 'tarjoan'
  | 'ilmaista'
  | 'lainaa'
  | 'tapahtuma'

export type ProfileVisibility = 'everyone' | 'neighbors' | 'hidden'
export type LocationAccuracy = 'exact' | 'area' | 'city'
export type BadgeType = 'verified' | 'pro' | 'trusted' | 'active' | 'first_post' | 'helper' | 'popular' | 'lender' | 'event_creator' | 'weekly_active' | 'neighborhood_hero' | 'first_invite' | 'community_builder' | 'salamanopea' | 'nopea'

// Three-tier trust system
export type TrustLevel = 1 | 2 | 3

export interface TrustPermissions {
  canLainaa: boolean
  canOfferPaidServices: boolean
  maxDailyFee: number | null       // null = unlimited
  maxServicePrice: number | null   // null = unlimited
  priorityInFeed: boolean
  trustedBadge: boolean
}

export interface TrustSignals {
  emailVerified: boolean
  idVerified: boolean              // has 'verified' badge
  reviewCount: number
  avgRating: number
  responseRate: number             // 0-100
  accountAgeDays: number
  hasActiveReports: boolean
}

export interface Profile {
  id: string
  email: string | null
  name: string
  avatar_url: string | null
  bio: string
  naapurusto: string
  response_rate: number
  is_hub: boolean
  is_pro: boolean
  pro_expires_at: string | null
  profile_visibility: ProfileVisibility
  location_accuracy: LocationAccuracy
  notifications_enabled: boolean
  language: string
  onboarding_completed: boolean
  is_banned?: boolean
  is_admin: boolean
  is_business: boolean
  business_name: string | null
  business_vat_id: string | null
  stripe_customer_id?: string | null
  stripe_connect_account_id?: string | null
  stripe_subscription_id?: string | null
  stripe_connect_onboarded: boolean
  identity_verified_at?: string | null
  invite_code?: string | null
  invited_by?: string | null
  invite_count?: number
  total_points?: number
  current_streak?: number
  longest_streak?: number
  last_active_date?: string | null
  onboarding_checklist?: Record<string, boolean>
  map_presence?: boolean
  business_description?: string | null
  business_phone?: string | null
  business_website?: string | null
  business_address?: string | null
  business_hours?: Record<string, string> | null
  business_images?: string[]
  business_lat?: number | null
  business_lng?: number | null
  business_category?: string | null
  city_id?: string
  push_token?: string | null
  created_at: string
  updated_at: string
}

export type EventCategory = 'social' | 'sports' | 'culture' | 'nature' | 'kids' | 'other'
export type EventType = 'event' | 'table'
export type TableCategory = 'coffee' | 'lunch' | 'walk' | 'sports' | 'hangout'

export interface CommunityEvent {
  id: string
  creator_id: string
  title: string
  description: string | null
  image_url: string | null
  event_date: string
  event_end_date: string | null
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  category: EventCategory
  event_type: EventType
  max_participants: number | null
  approval_required: boolean
  naapurusto: string | null
  city_id: string
  conversation_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined fields
  creator?: { id: string; name: string; avatar_url: string | null }
  participant_count?: number
  is_participant?: boolean
  my_status?: 'joined' | 'pending' | 'approved' | 'rejected' | null
  participants?: EventParticipant[]
}

export interface EventParticipant {
  id: string
  event_id: string
  user_id: string
  status: 'joined' | 'pending' | 'approved' | 'rejected'
  created_at: string
  user?: { id: string; name: string; avatar_url: string | null }
}

export type PartialProfile = Pick<Profile, 'id' | 'name' | 'avatar_url'> & Partial<Profile>

export interface UserBadge {
  badge_type: BadgeType
}

export interface Post {
  id: string
  user_id: string
  type: PostType
  title: string
  description: string
  location: string | null
  image_url: string | null
  hub_pickup_id: string | null
  expires_at: string | null
  daily_fee: number | null
  service_price: number | null
  event_date: string | null
  latitude: number | null
  longitude: number | null
  is_pro_listing: boolean
  tags: string[]
  is_active: boolean
  is_boosted?: boolean
  is_urgent?: boolean
  urgency_hours?: number | null
  is_anonymous?: boolean
  is_seed?: boolean
  like_count: number
  comment_count: number
  created_at: string
  updated_at: string
  user?: Profile & { user_badges?: UserBadge[] }
  is_saved?: boolean
  is_liked?: boolean
  images?: PostImage[]
}

export interface PostComment {
  id: string
  post_id: string
  user_id: string
  parent_id: string | null
  content: string
  created_at: string
  user?: PartialProfile
}

export interface PostImage {
  id: string
  post_id: string
  image_url: string
  sort_order: number
  created_at: string
}

export interface SavedSearch {
  id: string
  user_id: string
  query: string
  filters: {
    type?: string
    neighborhood?: string
    min_price?: number
    max_price?: number
    tags?: string[]
  } | null
  push_enabled: boolean
  last_notified_at: string | null
  match_count: number
  created_at: string
}

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn'

export interface Offer {
  id: string
  post_id: string
  from_user_id: string
  to_user_id: string
  amount: number
  message: string | null
  status: OfferStatus
  conversation_id: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  post_id: string | null
  creator_id: string
  title: string
  description: string | null
  event_date: string
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  icon: string
  discount: string | null
  max_attendees: number | null
  created_at: string
  creator?: Profile
  attendee_count?: number
  is_attending?: boolean
}

export interface Conversation {
  id: string
  user1_id: string
  user2_id: string
  post_id: string | null
  user1_archived: boolean
  user2_archived: boolean
  is_archived?: boolean
  created_at: string
  updated_at: string
  other_user?: Profile
  last_message?: Message
  unread_count?: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  image_url: string | null
  is_read: boolean
  is_deleted?: boolean
  deleted_at?: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  from_user_id: string | null
  type: string
  title: string
  body: string | null
  link_type: string | null
  link_id: string | null
  is_read: boolean
  created_at: string
  from_user?: { id: string; name: string; avatar_url: string | null } | null
}

export interface Review {
  id: string
  reviewer_id: string
  reviewed_id: string
  post_id: string | null
  rating: number
  comment: string | null
  created_at: string
  reviewer?: Profile
}

export interface CityEvent {
  id: string
  source: 'linkedevents' | 'ticketmaster'
  source_id: string
  name_fi: string
  name_en: string | null
  name_sv: string | null
  description_fi: string | null
  description_en: string | null
  description_sv: string | null
  start_time: string
  end_time: string | null
  location_name: string | null
  location_address: string | null
  latitude: number | null
  longitude: number | null
  image_url: string | null
  info_url: string | null
  category: string
  is_free: boolean
  price_info: string | null
  organizer: string | null
  neighborhood: string | null
  tags: string[]
  synced_at: string
  created_at: string
}

export interface LocalPlace {
  id: string
  source: 'osm' | 'palvelukartta'
  source_id: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  address: string | null
  latitude: number
  longitude: number
  phone: string | null
  website: string | null
  opening_hours: string | null
  image_url: string | null
  neighborhood: string | null
  tags: string[]
  synced_at: string
  created_at: string
}

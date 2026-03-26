// ── Country Adapter Interfaces ──
// Abstract interfaces for per-country service integrations.
// Each country maps to specific adapters via the country_configs table.

// ── Identity Verification ──

export interface IdentityAdapter {
  type: string  // 'suomifi' | 'bankid' | 'smartid' | 'eidas' | 'manual'
  name: string  // Human-readable: "Suomi.fi", "BankID", etc.
  /** Start the verification flow. Returns a URL to open or null for in-app flow. */
  startVerification(userId: string): Promise<{ url?: string; inApp?: boolean }>
  /** Check verification status */
  checkStatus(userId: string): Promise<{ verified: boolean; pending: boolean }>
  /** Get branding info for the verification modal */
  getBranding(): IdentityBranding
}

export interface IdentityBranding {
  color: string
  icon: string     // Lucide icon name
  title: string
  description: string
}

// ── Business Validation ──

export interface BusinessAdapter {
  type: string
  name: string
  /** Validate a business ID. Returns company data or null. */
  validate(businessId: string, businessName?: string): Promise<BusinessValidationResult | null>
  /** Get the format hint for the business ID input */
  getIdFormat(): BusinessIdFormat
}

export interface BusinessIdFormat {
  placeholder: string
  regex: RegExp
  label: string
  example: string
}

export interface BusinessValidationResult {
  valid: boolean
  autoApproved: boolean
  officialName: string
  businessId: string
  status: string
  address?: string
  companyForm?: string
}

// ── Events API ──

export interface EventsAdapter {
  type: string
  name: string
  /** Fetch events for a city/area */
  fetchEvents(params: EventsFetchParams): Promise<CityEventResult[]>
}

export interface EventsFetchParams {
  cityId: string
  lat: number
  lng: number
  radius?: number   // km
  limit?: number
  locale?: string
}

export interface CityEventResult {
  id: string
  source: string
  name: string
  description: string | null
  startTime: string
  endTime: string | null
  locationName: string | null
  latitude: number | null
  longitude: number | null
  imageUrl: string | null
  infoUrl: string | null
  category: string
  isFree: boolean
  organizer: string | null
}

// ── Places API ──

export interface PlacesAdapter {
  type: string
  name: string
  /** Fetch nearby places */
  fetchPlaces(params: PlacesFetchParams): Promise<PlaceResult[]>
}

export interface PlacesFetchParams {
  lat: number
  lng: number
  radius?: number     // meters
  category?: string
  limit?: number
}

export interface PlaceResult {
  id: string
  source: string
  name: string
  category: string
  subcategory: string | null
  address: string | null
  latitude: number
  longitude: number
  phone: string | null
  website: string | null
  openingHours: string | null
}

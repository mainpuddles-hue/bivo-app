// Feature flags for MVP launch
// Set to true to enable features post-launch
export const FEATURES = {
  LENDING: false,        // Lainaa category
  GRAB: true,            // Nappaa category — 24h urgent listings
  PAYMENTS: false,       // Stripe payments for services
  PRO_SUBSCRIPTION: false, // Pro tier
  BUSINESS_ACCOUNT: false, // Organization/business tier
  AD_CAMPAIGNS: false,   // Create ad campaigns
  IDENTITY_VERIFICATION: false, // Suomi.fi
  EVENTS_TAPAHTUMA_TYPE: true, // Tapahtuma post type (keep for now)
  BOOSTS: true,  // Nosto-ominaisuus — IAP-pohjainen, aina päällä
} as const

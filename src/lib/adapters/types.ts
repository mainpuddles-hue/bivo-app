// ── Country Adapter Interfaces ──
//
// Abstract interfaces for per-country service integrations. Only the
// business-validation adapter is wired up today (via the upgrade-business
// screen). Identity / Events / Places adapters were scaffolded earlier
// but never consumed, so their interfaces + implementation files were
// removed. IdentityBranding is kept because VerificationModal still
// imports it as a visual prop shape.

// ── Identity branding (used by VerificationModal) ──

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

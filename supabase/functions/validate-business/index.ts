// Supabase Edge Function: validate-business
// Validates business registration via PRH (Finnish Patent and Registration Office)
// open API before allowing organization account upgrade.
//
// Process:
// 1. User submits Y-tunnus (business ID)
// 2. This function queries PRH's BIS API (avoindata.prh.fi)
// 3. Validates: company exists, is active, name matches
// 4. Creates pending business verification in DB
// 5. Admin reviews and approves (or auto-approve if PRH data matches)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PRH BIS (Business Information System) open API
const PRH_API_URL = 'https://avoindata.prh.fi/bis/v1'

interface PRHCompany {
  businessId: string
  name: string
  registrationDate: string
  companyForm: string // OY, TMI, KY, etc.
  status: string // ACTIVE, DISSOLVED, etc.
  businessLine?: string
  address?: string
}

async function fetchCompanyFromPRH(ytunnus: string): Promise<PRHCompany | null> {
  try {
    // PRH BIS API: /bis/v1/{businessId}
    const cleanId = ytunnus.replace(/\s/g, '').trim()

    // Validate Y-tunnus format: 7 digits + dash + check digit (e.g., 1234567-8)
    if (!/^\d{7}-\d$/.test(cleanId)) {
      return null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(`${PRH_API_URL}/${cleanId}`, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const data = await res.json()

    if (!data.results || data.results.length === 0) return null

    const company = data.results[0]

    // Extract current name (last entry in names array)
    const names = company.names ?? []
    const currentName = names.length > 0
      ? names.sort((a: any, b: any) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime())[0]
      : null

    // Extract status
    const statuses = company.companyForms ?? []
    const currentStatus = statuses.length > 0 ? statuses[0] : null

    // Extract business line
    const lines = company.businessLines ?? []
    const currentLine = lines.length > 0 ? lines[0] : null

    // Extract address
    const addresses = company.addresses ?? []
    const currentAddress = addresses.length > 0 ? addresses[0] : null

    return {
      businessId: company.businessId ?? cleanId,
      name: currentName?.name ?? company.name ?? 'Unknown',
      registrationDate: company.registrationDate ?? '',
      companyForm: currentStatus?.name ?? '',
      status: company.companyForms?.[0]?.type === '0' ? 'ACTIVE' : 'UNKNOWN',
      businessLine: currentLine?.name,
      address: currentAddress ? `${currentAddress.street ?? ''}, ${currentAddress.postCode ?? ''} ${currentAddress.city ?? ''}`.trim() : undefined,
    }
  } catch (err) {
    console.error('[validate-business] PRH API error:', err)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { ytunnus, business_name, category, address } = body

    if (!ytunnus) {
      return new Response(JSON.stringify({ error: 'Y-tunnus required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: Query PRH for company data
    const prhData = await fetchCompanyFromPRH(ytunnus)

    if (!prhData) {
      return new Response(JSON.stringify({
        valid: false,
        error: 'company_not_found',
        message: 'Y-tunnusta ei löytynyt PRH:n rekisteristä. Tarkista tunnus.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Step 2: Check if company is active via PRH status
    const isActive = prhData.status === 'ACTIVE'
    if (!isActive) {
      return new Response(JSON.stringify({
        valid: false,
        error: 'company_not_active',
        message: 'Yritys ei ole aktiivinen PRH:n rekisterissä. Rekisteröinti hylätty.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 3: Check name similarity (fuzzy — allow minor differences)
    const nameMatch = business_name
      ? prhData.name.toLowerCase().includes(business_name.toLowerCase().slice(0, 10)) ||
        business_name.toLowerCase().includes(prhData.name.toLowerCase().slice(0, 10))
      : true

    // Step 4: Auto-approve if PRH data validates, or flag for manual review
    const autoApproved = isActive && nameMatch
    const verificationStatus = autoApproved ? 'approved' : 'pending_review'

    // Step 5: Update profile — store business details only.
    // is_business will be set after payment confirmation via stripe-webhook.
    await supabase.from('profiles').update({
      business_name: prhData.name, // Use official PRH name
      business_vat_id: prhData.businessId,
    }).eq('id', user.id)

    // Step 6: Create verification record for audit trail
    await (supabase.from('business_verifications') as any).insert({
      user_id: user.id,
      ytunnus: prhData.businessId,
      prh_name: prhData.name,
      submitted_name: business_name,
      prh_data: prhData,
      status: verificationStatus,
      auto_approved: autoApproved,
    }).catch(() => {
      // Table might not exist yet — still let the flow continue
    })

    return new Response(JSON.stringify({
      valid: true,
      auto_approved: autoApproved,
      status: verificationStatus,
      prh_company: {
        name: prhData.name,
        businessId: prhData.businessId,
        companyForm: prhData.companyForm,
        businessLine: prhData.businessLine,
        address: prhData.address,
      },
      message: autoApproved
        ? 'Yritys vahvistettu PRH:n rekisteristä. Yritystili aktivoitu.'
        : 'Yritystiedot lähetetty tarkistettavaksi. Saat ilmoituksen kun tili aktivoidaan.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error('[validate-business]', err.message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

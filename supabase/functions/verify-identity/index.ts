// Edge Function: verify-identity
// Server-side identity badge granting.
// Currently: stub that returns not_available until Suomi.fi OIDC is integrated.
// Production: will verify Suomi.fi OIDC token and grant 'verified' badge.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://bivoapp.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the caller's JWT
    const anonClient = createClient(supabaseUrl, getEnvOrThrow('SUPABASE_ANON_KEY'))
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'invalid_request_body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { user_id } = body

    // Security: user can only verify themselves
    if (user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if already verified
    const { data: existing } = await supabase
      .from('user_badges')
      .select('badge_type')
      .eq('user_id', user.id)
      .eq('badge_type', 'verified')
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ status: 'already_verified' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TODO: Integrate Suomi.fi OIDC verification here
    // For now, check if we're in development mode via env flag
    const allowDevVerification = Deno.env.get('ALLOW_DEV_VERIFICATION') === 'true'

    if (!allowDevVerification) {
      return new Response(
        JSON.stringify({ error: 'not_available', message: 'Identity verification not yet available' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Dev mode: grant badge directly (production will use Suomi.fi callback)
    const { error: badgeError } = await supabase
      .from('user_badges')
      .insert({ user_id: user.id, badge_type: 'verified' })

    if (badgeError) {
      return new Response(JSON.stringify({ error: 'badge_insert_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update profile — log failure but don't block (badge is the source of truth)
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ identity_verified_at: new Date().toISOString() })
      .eq('id', user.id)
    if (profileErr) {
      console.error(`[verify-identity] Failed to update identity_verified_at for ${user.id}:`, profileErr.message)
    }

    return new Response(JSON.stringify({ status: 'verified' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

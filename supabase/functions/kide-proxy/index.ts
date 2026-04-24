// Supabase Edge Function: kide-proxy
// Proxies Kide.app API requests with server-side caching.
// The Kide API is public (no key needed), but this proxy adds:
//   1. In-memory caching (1 hour TTL) to reduce upstream calls
//   2. CORS headers for web preview
//   3. Request validation via Supabase anon key

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const KIDE_BASE_URL = 'https://api.kide.app/api/products'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Simple in-memory cache
const cache = new Map<string, { body: string; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_ENTRIES = 20

function pruneCache() {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL) cache.delete(key)
  }
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (const [key] of entries.slice(0, cache.size - MAX_CACHE_ENTRIES)) {
      cache.delete(key)
    }
  }
}

const ALLOWED_PARAMS = new Set(['city', 'company', 'productType', 'page', 'limit'])

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Validate request
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const reqApiKey = req.headers.get('apikey') ?? ''
    if (!anonKey || reqApiKey !== anonKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const upstreamParams = new URLSearchParams()
    for (const param of ALLOWED_PARAMS) {
      const value = url.searchParams.get(param)
      if (value) upstreamParams.set(param, value)
    }

    // Cache key
    const sorted = [...upstreamParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const key = sorted.map(([k, v]) => `${k}=${v}`).join('&')
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(cached.body, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    // Fetch from Kide with 15s timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let kideResponse: Response
    try {
      kideResponse = await fetch(`${KIDE_BASE_URL}?${upstreamParams.toString()}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Upstream timeout' }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    const body = await kideResponse.text()

    if (!kideResponse.ok) {
      return new Response(body, {
        status: kideResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cache the response
    pruneCache()
    cache.set(key, { body, timestamp: Date.now() })

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    })
  } catch (err: any) {
    console.error('[kide-proxy]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

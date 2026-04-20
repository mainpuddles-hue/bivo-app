// Supabase Edge Function: ticketmaster-proxy
// Proxies Ticketmaster Discovery API requests so the API key stays server-side.
// Accepts GET requests with query params (city, countryCode, startDateTime, sort, size, page).
// Caches responses in-memory for 1 hour keyed by query string.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const TICKETMASTER_API_KEY = getEnvOrThrow('TICKETMASTER_API_KEY')
const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Simple in-memory cache: query string → { body, timestamp }
const cache = new Map<string, { body: string; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_ENTRIES = 50

function pruneCache() {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key)
    }
  }
  // If still over limit, remove oldest entries
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = entries.slice(0, cache.size - MAX_CACHE_ENTRIES)
    for (const [key] of toRemove) {
      cache.delete(key)
    }
  }
}

// Simple hash for cache key (use sorted query string)
function cacheKey(params: URLSearchParams): string {
  const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return sorted.map(([k, v]) => `${k}=${v}`).join('&')
}

const ALLOWED_PARAMS = new Set(['city', 'countryCode', 'startDateTime', 'sort', 'size', 'page'])

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
    // Validate request comes from our app via apikey header (Supabase anon key)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const reqApiKey = req.headers.get('apikey') ?? ''
    if (!anonKey || reqApiKey !== anonKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const incomingParams = url.searchParams

    // Build upstream query params — only forward allowed params
    const upstreamParams = new URLSearchParams()
    for (const param of ALLOWED_PARAMS) {
      const value = incomingParams.get(param)
      if (value) {
        upstreamParams.set(param, value)
      }
    }
    // Add API key server-side
    upstreamParams.set('apikey', TICKETMASTER_API_KEY)

    // Check cache
    const key = cacheKey(upstreamParams)
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
      })
    }

    // Fetch from Ticketmaster with 15s timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let tmResponse: Response
    try {
      tmResponse = await fetch(`${TM_BASE_URL}?${upstreamParams.toString()}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
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

    const body = await tmResponse.text()

    if (!tmResponse.ok) {
      return new Response(body, {
        status: tmResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Store in cache
    pruneCache()
    cache.set(key, { body, timestamp: Date.now() })

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
      },
    })
  } catch (err: any) {
    console.error('[ticketmaster-proxy]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

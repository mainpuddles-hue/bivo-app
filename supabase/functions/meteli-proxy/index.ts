// Supabase Edge Function: meteli-proxy
// Scrapes Meteli.net Helsinki event listings and returns structured JSON.
// Meteli.net uses WordPress with rendered HTML for event details.
// robots.txt is fully permissive, no ToS prohibition found.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const METELI_BASE = 'https://www.meteli.net'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

interface MetelihEvent {
  id: string
  title: string
  date: string | null
  time: string | null
  venue: string | null
  city: string | null
  price: string | null
  imageUrl: string | null
  detailUrl: string | null
  ticketUrl: string | null
}

// In-memory cache
const cache = new Map<string, { body: string; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function parseEvents(html: string): MetelihEvent[] {
  const events: MetelihEvent[] = []

  // Meteli.net event cards follow a pattern with event-item or article elements
  // Parse event blocks — each event has title, date, venue, price info
  const eventBlockRegex = /<article[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let match: RegExpExecArray | null

  while ((match = eventBlockRegex.exec(html)) !== null) {
    const block = match[1]

    // Title + link
    const titleMatch = block.match(/<h[23][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/i)
    const title = titleMatch?.[2]?.trim() ?? ''
    const detailUrl = titleMatch?.[1] ?? null

    if (!title) continue

    // Date — typically "PE 24.04" or "LA 25.04.2026"
    const dateMatch = block.match(/(\d{1,2}\.\d{1,2}\.?\d{0,4})/i)
    const dateStr = dateMatch?.[1] ?? null

    // Time — "klo 21:00" or "21:00"
    const timeMatch = block.match(/(?:klo\s*)?(\d{1,2}[:.]\d{2})/i)
    const timeStr = timeMatch?.[1]?.replace('.', ':') ?? null

    // Venue + city — "Tavastia, Helsinki"
    const venueMatch = block.match(/(?:class="[^"]*venue[^"]*"[^>]*>|<span[^>]*>)\s*([^<,]+)(?:,\s*([^<]+))?/i)
    const venue = venueMatch?.[1]?.trim() ?? null
    const city = venueMatch?.[2]?.trim() ?? null

    // Price — "alk. 43,50" or "15 €"
    const priceMatch = block.match(/(?:alk\.?\s*)?(\d+[,.]?\d*)\s*(?:€|eur)/i)
    const price = priceMatch ? priceMatch[0].trim() : null

    // Image
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*>/i)
    const imageUrl = imgMatch?.[1] ?? null

    // Ticket link
    const ticketMatch = block.match(/<a[^>]*href="([^"]*(?:tiketti|lippu|kide|ticketmaster)[^"]*)"[^>]*>/i)
    const ticketUrl = ticketMatch?.[1] ?? null

    // Generate stable ID from URL or title
    const id = detailUrl
      ? detailUrl.replace(/[^a-z0-9]/gi, '').slice(-20)
      : title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)

    events.push({
      id: `meteli-${id}`,
      title,
      date: dateStr,
      time: timeStr,
      venue,
      city: city || 'Helsinki',
      price,
      imageUrl: imageUrl?.startsWith('http') ? imageUrl : imageUrl ? `${METELI_BASE}${imageUrl}` : null,
      detailUrl: detailUrl?.startsWith('http') ? detailUrl : detailUrl ? `${METELI_BASE}${detailUrl}` : null,
      ticketUrl,
    })
  }

  // Fallback: try simpler patterns if article-based parsing found nothing
  if (events.length === 0) {
    // Try link-based parsing from event list items
    const linkRegex = /<a[^>]*href="(\/tapahtuma\/[^"]+)"[^>]*>\s*(?:<[^>]*>)*\s*([^<]+)/gi
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1]
      const title = match[2]?.trim()
      if (!title || title.length < 3) continue

      const id = url.replace(/[^a-z0-9]/gi, '').slice(-20)
      events.push({
        id: `meteli-${id}`,
        title,
        date: null,
        time: null,
        venue: null,
        city: 'Helsinki',
        price: null,
        imageUrl: null,
        detailUrl: `${METELI_BASE}${url}`,
        ticketUrl: null,
      })
    }
  }

  return events
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Auth check
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const reqApiKey = req.headers.get('apikey') ?? ''
    if (!anonKey || reqApiKey !== anonKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    const city = url.searchParams.get('city') || 'helsinki'
    const cacheKey = `meteli-${city}`

    // Check cache
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(cached.body, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    // Fetch Meteli.net Helsinki page
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let pageResponse: Response
    try {
      pageResponse = await fetch(`${METELI_BASE}/${city}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'TackBird/1.0 (Helsinki neighborhood app)',
        },
      })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Upstream timeout' }), {
          status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!pageResponse.ok) {
      return new Response(JSON.stringify({ error: `Meteli returned ${pageResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = await pageResponse.text()
    const events = parseEvents(html)

    const body = JSON.stringify({ events, count: events.length, city, scrapedAt: new Date().toISOString() })

    // Cache result
    cache.set(cacheKey, { body, timestamp: Date.now() })

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    })
  } catch (err: any) {
    console.error('[meteli-proxy]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// Supabase Edge Function: match-saved-searches
// Cron: runs every 15 min
// Matches new posts against saved searches and sends push notifications.
//
// Flow:
//   1. Fetch posts created in the last 15 minutes
//   2. For each post, find matching saved_searches (text ILIKE + filter match)
//   3. Send push via Expo for each match (respect 1h cooldown per search)
//   4. Update last_notified_at + increment match_count

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const COOLDOWN_HOURS = 1 // Min 1h between notifications per saved search
const LOOKBACK_MINUTES = 16 // Slightly over 15 min to avoid gaps

interface SavedSearch {
  id: string
  user_id: string
  query: string
  filters: {
    type?: string
    neighborhood?: string
    maxPrice?: number
    tags?: string[]
  }
  push_enabled: boolean
  last_notified_at: string | null
  match_count: number
}

interface Post {
  id: string
  title: string
  description: string | null
  type: string
  location: string | null
  service_price: number | null
  tags: string[] | null
  user_id: string
  created_at: string
}

function postMatchesSearch(post: Post, search: SavedSearch): boolean {
  const q = search.query.toLowerCase()

  // Text match: title or description contains query
  const titleMatch = post.title?.toLowerCase().includes(q)
  const descMatch = post.description?.toLowerCase().includes(q)
  if (!titleMatch && !descMatch) return false

  const filters = search.filters ?? {}

  // Filter: type
  if (filters.type && post.type !== filters.type) return false

  // Filter: neighborhood (location field contains neighborhood name)
  if (filters.neighborhood && post.location) {
    if (!post.location.toLowerCase().includes(filters.neighborhood.toLowerCase())) return false
  }

  // Filter: max price
  if (filters.maxPrice && post.service_price != null) {
    if (post.service_price > filters.maxPrice) return false
  }

  // Filter: tags (any overlap)
  if (filters.tags && filters.tags.length > 0 && post.tags) {
    const postTags = new Set(post.tags.map(t => t.toLowerCase()))
    const hasMatch = filters.tags.some(t => postTags.has(t.toLowerCase()))
    if (!hasMatch) return false
  }

  return true
}

function isCooldownActive(lastNotified: string | null): boolean {
  if (!lastNotified) return false
  const diff = Date.now() - new Date(lastNotified).getTime()
  return diff < COOLDOWN_HOURS * 60 * 60 * 1000
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  if (!token?.startsWith('ExponentPushToken[') && !token?.startsWith('ExpoPushToken[')) {
    return false
  }
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data: data ?? {},
        badge: 1,
        threadId: 'saved-search',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth: require CRON_SECRET header — reject if secret is missing or doesn't match
  const cronSecret = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret')
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    getEnvOrThrow('SUPABASE_URL'),
    getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString()

  // 1. Fetch recent posts
  const { data: newPosts, error: postsError } = await supabase
    .from('posts')
    .select('id, title, description, type, location, service_price, tags, user_id, created_at')
    .eq('is_active', true)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50)

  if (postsError || !newPosts?.length) {
    return new Response(
      JSON.stringify({ matched: 0, sent: 0, posts: newPosts?.length ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 2. Fetch saved searches with push enabled
  const { data: searches, error: searchError } = await supabase
    .from('saved_searches')
    .select('id, user_id, query, filters, push_enabled, last_notified_at, match_count')
    .eq('push_enabled', true)
    .limit(500)

  if (searchError || !searches?.length) {
    return new Response(
      JSON.stringify({ matched: 0, sent: 0, posts: newPosts.length, searches: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 3. Match and notify
  let matchCount = 0
  let sentCount = 0
  const updatedSearchIds: string[] = []

  for (const search of searches as SavedSearch[]) {
    if (isCooldownActive(search.last_notified_at)) continue

    const matches = (newPosts as Post[]).filter(post => {
      // Don't notify user about their own posts
      if (post.user_id === search.user_id) return false
      return postMatchesSearch(post, search)
    })

    if (matches.length === 0) continue
    matchCount += matches.length

    // Fetch user's push token
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token, name')
      .eq('id', search.user_id)
      .maybeSingle()

    if (!profile?.push_token) continue

    // Send push for the best match (newest)
    const bestMatch = matches[0]
    const sent = await sendExpoPush(
      profile.push_token,
      `Uusi osuma: "${search.query}"`,
      bestMatch.title,
      {
        type: 'search_match',
        postId: bestMatch.id,
        searchId: search.id,
        query: search.query,
      },
    )

    if (sent) {
      sentCount++
      updatedSearchIds.push(search.id)

      // Update search metadata
      await supabase
        .from('saved_searches')
        .update({
          last_notified_at: new Date().toISOString(),
          match_count: (search.match_count ?? 0) + matches.length,
        })
        .eq('id', search.id)

      // Also insert a notification record
      await supabase
        .from('notifications')
        .insert({
          user_id: search.user_id,
          type: 'search_match',
          title: `Uusi osuma: "${search.query}"`,
          body: bestMatch.title,
          data: { post_id: bestMatch.id, search_id: search.id },
          is_read: false,
        })
        .catch(() => {}) // Non-critical
    }
  }

  return new Response(
    JSON.stringify({
      posts: newPosts.length,
      searches: searches.length,
      matched: matchCount,
      sent: sentCount,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})

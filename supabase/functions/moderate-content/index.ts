// Supabase Edge Function: moderate-content
// Automated content moderation: spam detection, inappropriate content,
// scam patterns, and fake listing detection.
// Called before/after post creation to flag suspicious content.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Spam patterns (Finnish + English)
const SPAM_PATTERNS = [
  /https?:\/\/[^\s]+\.[^\s]+/gi,  // External URLs (suspicious in local marketplace)
  /whatsapp|telegram|signal/gi,    // Moving conversation off-platform
  /bitcoin|crypto|btc|ethereum/gi, // Crypto scams
  /\b(casino|betting|gambling)\b/gi,
  /\b(viagra|cialis|pharmacy)\b/gi,
  /(.)\1{5,}/g,                     // Repeated characters: aaaaaa
  /\b(free money|ilmaista rahaa)\b/gi,
  /\b(click here|klikkaa tästä)\b/gi,
]

// Scam patterns specific to marketplace
const SCAM_PATTERNS = [
  /pay.*(advance|etukäteen|ennakkoon)/gi,    // Advance payment requests
  /wire.*transfer|tilisiirto.*ennen/gi,       // Wire transfer before meeting
  /western union|moneygram/gi,
  /\b(lottery|arpajaiset|voitto)\b.*\b(won|voitit)\b/gi,
  /shipping.*(fee|maksu).*\b(pay|maksa)\b/gi, // Shipping fee scams
  /\b(nigerian?|prince)\b/gi,
]

// Inappropriate content patterns
const INAPPROPRIATE_PATTERNS = [
  // Explicit hate speech markers (Finnish + English)
  /\b(vittu|perkele|saatana)\b.*\b(kuole|tapa|lyö)\b/gi, // Finnish profanity + violence
  /\b(kill|murder|threat)\b/gi,
  /\b(nazi|natsit?)\b/gi,
]

interface ModerationResult {
  passed: boolean
  flags: string[]
  score: number       // 0 = clean, 100 = definitely spam/scam
  action: 'allow' | 'flag' | 'block'
  details: string[]
}

function moderateText(title: string, description: string): ModerationResult {
  const text = `${title} ${description}`.toLowerCase()
  const flags: string[] = []
  const details: string[] = []
  let score = 0

  // Check spam patterns
  for (const pattern of SPAM_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      flags.push('spam')
      score += 20
      details.push(`Spam pattern: ${matches[0].slice(0, 30)}`)
    }
  }

  // Check scam patterns
  for (const pattern of SCAM_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      flags.push('scam')
      score += 40
      details.push(`Scam pattern: ${matches[0].slice(0, 30)}`)
    }
  }

  // Check inappropriate
  for (const pattern of INAPPROPRIATE_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      flags.push('inappropriate')
      score += 30
      details.push(`Inappropriate: ${matches[0].slice(0, 30)}`)
    }
  }

  // Short/low-effort detection
  if (title.length < 5) {
    flags.push('low_quality')
    score += 10
    details.push('Title too short')
  }
  if (description.length < 10) {
    flags.push('low_quality')
    score += 10
    details.push('Description too short')
  }

  // ALL CAPS detection (shouting)
  const upperRatio = (text.replace(/[^A-ZÄÖÅ]/g, '').length) / Math.max(1, text.replace(/[^A-Za-zÄÖÅäöå]/g, '').length)
  if (upperRatio > 0.7 && text.length > 20) {
    flags.push('caps')
    score += 10
    details.push('Excessive caps')
  }

  // Duplicate content detection — check against recent posts
  // (would need DB query, done in the serve handler below)

  score = Math.min(100, score)
  const uniqueFlags = [...new Set(flags)]

  return {
    passed: score < 40,
    flags: uniqueFlags,
    score,
    action: score >= 70 ? 'block' : score >= 40 ? 'flag' : 'allow',
    details,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // JWT authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { title, description, post_id, user_id } = body

    if (!title && !description) {
      return new Response(JSON.stringify({ error: 'title or description required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Run text moderation
    const result = moderateText(title ?? '', description ?? '')

    // Check for duplicate/repeat posting (same user, similar title in last hour)
    if (user_id) {
      const { data: recentPosts } = await supabase
        .from('posts')
        .select('title')
        .eq('user_id', user_id)
        .gte('created_at', new Date(Date.now() - 3600000).toISOString())
        .limit(5)

      if (recentPosts) {
        const duplicates = recentPosts.filter(
          (p: any) => p.title?.toLowerCase().trim() === title?.toLowerCase().trim()
        )
        if (duplicates.length > 0) {
          result.flags.push('duplicate')
          result.score = Math.min(100, result.score + 30)
          result.details.push('Duplicate post in last hour')
          if (result.score >= 40) result.action = 'flag'
        }
      }

      // If flagged or blocked, insert into content_flags
      if (result.action !== 'allow' && post_id) {
        const { error: flagError } = await supabase.from('content_flags').insert({
          post_id,
          flag_type: result.flags[0] ?? 'unknown',
          details: JSON.stringify(result.details),
          auto_hidden: result.action === 'block',
        })
        if (flagError) console.error('[moderate] Failed to insert content flag:', flagError.message)

        // Auto-hide if blocked
        if (result.action === 'block') {
          const { error: hideError } = await supabase.from('posts').update({ is_active: false }).eq('id', post_id)
          if (hideError) console.error('[moderate] CRITICAL: Failed to hide blocked post:', post_id, hideError.message)
        }
      }
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[moderate-content]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

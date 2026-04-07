// Supabase Edge Function: semantic-search
// Fuzzy + semantic search using pgvector embeddings.
// Handles typos, synonyms, and Finnish language variations.
// "koiranhoitaja" finds "koiranulkoilutus", "siivous" finds "kotisiivous"

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const hfToken = Deno.env.get('HF_API_TOKEN')

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Finnish synonym expansion — helps when exact match fails
const FINNISH_SYNONYMS: Record<string, string[]> = {
  'koiranhoito': ['koiranulkoilutus', 'lemmikkihoito', 'koirankaitsija', 'koira'],
  'koiranulkoilutus': ['koiranhoito', 'lemmikkihoito', 'koirankaitsija', 'koira'],
  'siivous': ['siivoaminen', 'puhtaanapito', 'kotisiivous', 'siivota'],
  'muutto': ['muuttaminen', 'muuttoapu', 'kantoapu', 'muuttapu'],
  'lastenhoito': ['lapsenvahti', 'lapsenhoito', 'hoitaja', 'babysitter'],
  'korjaus': ['remontti', 'kunnostus', 'huolto', 'fiksaus'],
  'puutarha': ['piha', 'puutarhanhoito', 'pihanhoito', 'nurmikonleikkuu'],
  'kuljetus': ['nouto', 'toimitus', 'kyyti', 'kuriiri'],
  'opetus': ['tutorointi', 'apu', 'opettaminen', 'valmennus'],
  'ruoka': ['ateria', 'ruoanlaitto', 'kokki', 'catering'],
}

function expandQuery(query: string): string {
  const words = query.toLowerCase().split(/\s+/)
  const expanded = [...words]

  for (const word of words) {
    // Check synonyms
    for (const [key, synonyms] of Object.entries(FINNISH_SYNONYMS)) {
      if (word.includes(key) || key.includes(word)) {
        expanded.push(...synonyms)
      }
      for (const syn of synonyms) {
        if (word.includes(syn) || syn.includes(word)) {
          expanded.push(key, ...synonyms)
        }
      }
    }
  }

  return [...new Set(expanded)].join(' ')
}

async function generateEmbedding(text: string): Promise<number[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!res.ok) throw new Error(`HF API error: ${res.status}`)
  const result = await res.json()
  return Array.isArray(result[0]) ? result[0] : result
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
    const { query, type, neighborhood, limit: resultLimit = 20 } = body

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ results: [], count: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: Expand query with Finnish synonyms
    const expandedQuery = expandQuery(query.trim())

    // Step 2: Generate embedding for semantic search
    const embedding = await generateEmbedding(expandedQuery.slice(0, 512))

    // Step 2.5: Validate embedding vector before passing to SQL
    if (!Array.isArray(embedding)) {
      console.error('[semantic-search] Embedding is not an array:', typeof embedding)
      return new Response(JSON.stringify({ error: 'Embedding generation failed: invalid format' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (embedding.length !== 384) {
      console.error('[semantic-search] Embedding has wrong dimensions:', embedding.length, '(expected 384)')
      return new Response(JSON.stringify({ error: 'Embedding generation failed: wrong dimensions' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!embedding.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      console.error('[semantic-search] Embedding contains non-finite values')
      return new Response(JSON.stringify({ error: 'Embedding generation failed: non-finite values' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 3: Semantic search via pgvector
    const { data: semanticResults } = await supabase.rpc('match_posts', {
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: 0.35,  // Lower threshold for fuzzy matching
      match_count: resultLimit,
      filter_type: type ?? null,
    })

    // Step 4: Also do traditional text search (ILIKE) as fallback
    // Sanitize query to prevent PostgREST .or() injection — commas, parens, and dots
    // can break the filter syntax, and SQL wildcards must be escaped.
    const safeQuery = query.trim()
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/,/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\./g, '')

    let textQuery = supabase
      .from('posts')
      .select('id, title')
      .eq('is_active', true)
      .or(`title.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`)
      .limit(resultLimit)

    if (type) textQuery = textQuery.eq('type', type)

    const { data: textResults } = await textQuery

    // Step 5: Merge and deduplicate results
    const seen = new Set<string>()
    const merged: { post_id: string; similarity: number; source: string }[] = []

    // Semantic results first (higher quality)
    for (const r of (semanticResults ?? []) as any[]) {
      if (!seen.has(r.post_id)) {
        seen.add(r.post_id)
        merged.push({ post_id: r.post_id, similarity: r.similarity, source: 'semantic' })
      }
    }

    // Text results as fallback
    for (const r of (textResults ?? []) as any[]) {
      if (!seen.has(r.id)) {
        seen.add(r.id)
        merged.push({ post_id: r.id, similarity: 0.4, source: 'text' })
      }
    }

    // Sort by similarity
    merged.sort((a, b) => b.similarity - a.similarity)

    return new Response(
      JSON.stringify({
        results: merged.slice(0, resultLimit),
        count: merged.length,
        expanded_query: expandedQuery !== query.trim() ? expandedQuery : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[semantic-search]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

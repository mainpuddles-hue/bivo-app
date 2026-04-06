// Supabase Edge Function: semantic-match
// Finds semantically similar posts using pgvector cosine similarity.
// Used for Smart Match (tarvitsen↔tarjoan) and "related posts" on post detail.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const hfToken = Deno.env.get('HF_API_TOKEN')

const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
const HF_API_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${EMBEDDING_MODEL}`

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const embedding = await res.json()
  return Array.isArray(embedding[0]) ? embedding[0] : embedding
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
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
    const {
      query,           // text to find matches for
      post_id,         // OR: find matches for this post's embedding
      match_type,      // 'tarjoan' | 'tarvitsen' | null (any)
      threshold = 0.5, // minimum similarity
      limit = 10,
      neighborhood,    // optional filter by naapurusto
    } = body

    let queryEmbedding: number[]

    if (post_id) {
      // Use existing post's embedding
      const { data: existing } = await supabase
        .from('post_embeddings')
        .select('embedding')
        .eq('post_id', post_id)
        .single()

      if (existing?.embedding) {
        // Parse stored vector string
        queryEmbedding = JSON.parse(existing.embedding.replace(/[\[\]]/g, m => m))
      } else {
        // Generate embedding for this post first
        const { data: post } = await supabase
          .from('posts')
          .select('title, description, type, tags, location')
          .eq('id', post_id)
          .single()
        if (!post) {
          return new Response(JSON.stringify({ error: 'Post not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const text = [post.title, post.description, post.type, ...(post.tags ?? [])].filter(Boolean).join(' ').slice(0, 512)
        queryEmbedding = await generateEmbedding(text)
      }
    } else if (query) {
      queryEmbedding = await generateEmbedding(query.slice(0, 512))
    } else {
      return new Response(JSON.stringify({ error: 'query or post_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find similar posts using pgvector RPC
    const { data: matches, error: matchError } = await supabase.rpc('match_posts', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
      filter_type: match_type ?? null,
    })

    if (matchError) {
      console.error('[semantic-match] RPC error:', matchError.message)
      return new Response(JSON.stringify({ error: 'Matching failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Exclude the source post from results
    const filtered = (matches ?? []).filter((m: any) => m.post_id !== post_id)

    // Optionally filter by neighborhood
    let results = filtered
    if (neighborhood) {
      const postIds = filtered.map((m: any) => m.post_id)
      if (postIds.length > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id, user:profiles!posts_user_id_fkey(naapurusto)')
          .in('id', postIds)
        const neighborhoodPosts = new Set(
          (posts ?? []).filter((p: any) => p.user?.naapurusto === neighborhood).map((p: any) => p.id)
        )
        results = filtered.map((m: any) => ({
          ...m,
          neighborhood_match: neighborhoodPosts.has(m.post_id),
          // Boost neighborhood matches
          similarity: neighborhoodPosts.has(m.post_id) ? m.similarity * 1.15 : m.similarity,
        })).sort((a: any, b: any) => b.similarity - a.similarity)
      }
    }

    return new Response(
      JSON.stringify({ matches: results, count: results.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[semantic-match]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

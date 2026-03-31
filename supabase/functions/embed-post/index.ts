// Supabase Edge Function: embed-post
// Generates a 384-dim text embedding for a post and stores in post_embeddings.
// Called after post creation to enable semantic matching.
// Uses Hugging Face Inference API (free tier) for embeddings.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
const HF_API_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${EMBEDDING_MODEL}`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HF_TIMEOUT_MS = 15000 // 15 second timeout for HuggingFace API
const MAX_RETRIES = 2       // Retry once on transient failures

async function generateEmbedding(text: string): Promise<number[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // AbortController for timeout — prevents hanging if HuggingFace is down
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), HF_TIMEOUT_MS)

      const res = await fetch(HF_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const err = await res.text()
        // 503 = model loading, retry after brief wait
        if (res.status === 503 && attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }
        throw new Error(`HF API error: ${res.status} ${err}`)
      }

      const embedding = await res.json()
      // HF returns [[...384 numbers...]] for single input
      return Array.isArray(embedding[0]) ? embedding[0] : embedding
    } catch (err: any) {
      lastError = err
      if (err.name === 'AbortError') {
        lastError = new Error(`HF API timeout after ${HF_TIMEOUT_MS}ms`)
      }
      // Retry on network errors
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
    }
  }

  throw lastError ?? new Error('Failed to generate embedding')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()
    const { post_id } = body

    if (!post_id) {
      return new Response(JSON.stringify({ error: 'post_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch post content
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('title, description, type, tags, location')
      .eq('id', post_id)
      .single()

    if (postError || !post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build text for embedding: combine title + description + type + tags + location
    const parts = [
      post.title,
      post.description,
      post.type,
      ...(post.tags ?? []),
      post.location,
    ].filter(Boolean)
    const text = parts.join(' ').slice(0, 512) // Limit to 512 chars for model

    // Generate embedding
    const embedding = await generateEmbedding(text)

    if (embedding.length !== 384) {
      return new Response(JSON.stringify({ error: `Wrong embedding dim: ${embedding.length}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert embedding
    const { error: upsertError } = await supabase
      .from('post_embeddings')
      .upsert({
        post_id,
        embedding: `[${embedding.join(',')}]`,
      }, { onConflict: 'post_id' })

    if (upsertError) {
      console.error('[embed-post] Upsert error:', upsertError.message)
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ success: true, post_id, dimensions: embedding.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[embed-post]', err.message)
    // Return 200 with error info instead of 500 — the post should still
    // work without an embedding. Semantic matching will gracefully degrade
    // to tag-based matching when no embedding exists.
    const isTimeout = err.message?.includes('timeout')
    const isApiDown = err.message?.includes('503') || err.message?.includes('fetch')
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        retryable: isTimeout || isApiDown,
        post_still_works: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

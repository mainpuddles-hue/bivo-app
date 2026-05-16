// Supabase Edge Function: generate-event-image
// Generates a Bivo-branded AI placeholder image for community events without images.
// Uses Hugging Face Inference API (FLUX.1-schnell) for fast text-to-image generation.
// Style: monochromatic teal/mint 3D minimalist geometric city scenes,
// soft diffused lighting, matte clay-like material, abstract neighborhood shapes.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
const hfToken = Deno.env.get('HF_API_TOKEN')

const IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell'
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${IMAGE_MODEL}`
const HF_TIMEOUT_MS = 60000 // 60s — image generation is slower
const STORAGE_BUCKET = 'event-images'

// Category-specific scene elements for prompt enrichment
const CATEGORY_SCENES: Record<string, string> = {
  urheilu: 'abstract sports field, geometric ball shapes, movement lines',
  musiikki: 'abstract musical notes floating, curved sound wave shapes',
  taide: 'abstract paintbrush strokes, geometric canvas shapes, art studio elements',
  ruoka: 'abstract food shapes, geometric bowls and plates, kitchen elements',
  peli: 'abstract board game pieces, dice shapes, geometric game board',
  ulkoilu: 'abstract trees, park bench shapes, nature elements',
  opiskelu: 'abstract book shapes, geometric desk, lightbulb shapes',
  yhteiso: 'abstract group of rounded figures, community gathering shapes',
  lapset: 'abstract playground shapes, toy blocks, swing set silhouettes',
  default: 'abstract neighborhood buildings, geometric city blocks, community plaza',
}

function buildPrompt(title: string, description: string | null, category: string): string {
  const sceneHint = CATEGORY_SCENES[category] || CATEGORY_SCENES.default

  // Keep the content hint short to avoid the model trying to render text
  const contentHint = title.length > 60 ? title.slice(0, 60) : title

  return [
    'Monochromatic teal and mint colored 3D render,',
    'minimalist geometric scene,',
    `${sceneHint},`,
    `inspired by the theme: "${contentHint}",`,
    'soft diffused studio lighting,',
    'matte clay-like material,',
    'smooth rounded shapes, spheres, blocks, arches,',
    'abstract architectural neighborhood,',
    'no text, no people, no faces, no letters, no words,',
    'clean background, subtle shadows,',
    'color palette: #ABD9DB #7CBFC2 #5AA8AB #3D8E91 #E8F5F5,',
    'Pixar-style 3D illustration, product render quality,',
    '4k, high quality',
  ].join(' ')
}

async function generateImage(prompt: string): Promise<Uint8Array> {
  if (!hfToken) throw new Error('HF_API_TOKEN not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HF_TIMEOUT_MS)

  try {
    const res = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          num_inference_steps: 4,
          width: 768,
          height: 512,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'no body')
      throw new Error(`HF API ${res.status}: ${errBody}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

async function moderateImage(imageBytes: Uint8Array): Promise<boolean> {
  if (!hfToken) return true // Skip moderation if no token

  try {
    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/Falconsai/nsfw_image_detection',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBytes,
      },
    )

    if (!res.ok) return true // Allow on moderation failure — image is AI-generated anyway

    const results = await res.json()
    // results is array of { label: 'nsfw'|'normal', score: number }
    const nsfwScore = results?.find?.((r: any) => r.label === 'nsfw')?.score ?? 0
    return nsfwScore < 0.3 // Safe if NSFW score below 30%
  } catch {
    return true // Allow on error
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { event_id } = await req.json()
    if (!event_id) {
      return new Response(JSON.stringify({ error: 'event_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch event details
    const { data: event, error: fetchErr } = await (supabase
      .from('community_events') as any)
      .select('id, title, description, category, image_url')
      .eq('id', event_id)
      .single()

    if (fetchErr || !event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Skip if event already has an image
    if (event.image_url) {
      return new Response(JSON.stringify({ image_url: event.image_url, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate image
    const prompt = buildPrompt(event.title, event.description, event.category)
    const imageBytes = await generateImage(prompt)

    // Moderate generated image
    const isSafe = await moderateImage(imageBytes)
    if (!isSafe) {
      return new Response(JSON.stringify({ error: 'Generated image failed moderation' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upload to Supabase Storage
    const fileName = `generated/${event_id}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName)

    const publicUrl = urlData.publicUrl

    // Update event record with generated image
    const { error: updateErr } = await (supabase
      .from('community_events') as any)
      .update({ image_url: publicUrl })
      .eq('id', event_id)

    if (updateErr) {
      throw new Error(`Event update failed: ${updateErr.message}`)
    }

    return new Response(
      JSON.stringify({ image_url: publicUrl, generated: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-event-image]', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

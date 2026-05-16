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

// Title-to-scene keyword mapping for content-relevant imagery
const TITLE_KEYWORDS: [RegExp, string][] = [
  [/lautapeli|board.?game|peli-ilta/i, 'board game pieces, dice, game tokens on a table, meeples, game cards'],
  [/jalkapallo|football|futis/i, 'football on a field, goal posts, stadium shapes'],
  [/koripallo|basketball|basket/i, 'basketball hoop, court lines, bouncing ball'],
  [/juoks|running|maraton/i, 'running track, finish line, shoe shapes'],
  [/urhei|sport|liikunt/i, 'sports equipment shapes, balls, rackets, field markings'],
  [/musiik|music|keikka|konsertti/i, 'musical instruments, guitar, piano keys, vinyl record, musical notes'],
  [/taide|art|maalaus|piirustus/i, 'paintbrush, canvas, art palette, paint tubes, easel'],
  [/ruoka|food|kokkaus|kokki|resept/i, 'cooking pot, kitchen utensils, bowls, spoons, cutting board, vegetables'],
  [/kahvi|coffee|brunch/i, 'coffee cup, saucer, coffee beans, pastries, cafe table'],
  [/kirja|book|lukupiiri|reading/i, 'open books, reading glasses, bookshelf, stack of books'],
  [/elokuva|movie|leffa|film/i, 'film reel, movie clapperboard, cinema screen, popcorn bucket'],
  [/puutarh|garden|piha|istutus/i, 'garden tools, flower pots, watering can, small plants, seeds'],
  [/retki|hike|patikointi|luonto/i, 'hiking boots, trail path, backpack, compass, pine trees'],
  [/pyörä|bike|cycling|fillari/i, 'bicycle, wheel spokes, bike helmet, road path'],
  [/jooga|yoga|meditaat/i, 'yoga mat, meditation cushion, peaceful zen stones, candle'],
  [/käsityö|craft|neulo|ompel/i, 'yarn balls, knitting needles, fabric, scissors, thread spools'],
  [/valokuva|photo|kamera/i, 'camera, photo frames, lens, film strip'],
  [/lasten|kids|lapsi|perhe/i, 'toy blocks, teddy bear, crayons, small toy car, balloons'],
  [/grilli|bbq|piknik|picnic/i, 'grill, picnic basket, blanket on grass, outdoor plates'],
]

// Category fallback scenes (used when title keywords don't match)
const CATEGORY_SCENES: Record<string, string> = {
  urheilu: 'sports equipment, balls, racket, field markings, goal post',
  musiikki: 'musical instruments, guitar, vinyl record, piano keys',
  taide: 'paintbrush, canvas, art palette, paint tubes',
  ruoka: 'cooking pot, kitchen utensils, bowls, cutting board',
  peli: 'board game pieces, dice, game tokens, meeples, cards on table',
  ulkoilu: 'pine trees, hiking trail, compass, backpack',
  opiskelu: 'open books, notebook, pencils, desk lamp',
  yhteiso: 'park benches, lamppost, neighborhood buildings, mailbox',
  lapset: 'toy blocks, teddy bear, crayons, balloons',
  default: 'neighborhood buildings, park bench, lamppost, trees, mailbox',
}

function getSceneFromTitle(title: string): string | null {
  const lower = title.toLowerCase()
  for (const [pattern, scene] of TITLE_KEYWORDS) {
    if (pattern.test(lower)) return scene
  }
  return null
}

function buildPrompt(title: string, description: string | null, category: string): string {
  // Prioritize title-based scene for content relevance
  const sceneHint = getSceneFromTitle(title)
    || CATEGORY_SCENES[category]
    || CATEGORY_SCENES.default

  return [
    'A 3D rendered still life scene in a single monochromatic teal-green color.',
    'Exact color: soft muted teal like #9CCFD0 and #B5DFE0.',
    `Objects in the scene: ${sceneHint}.`,
    'All objects are the same teal-green color, like they are made from clay or matte plastic.',
    'Soft diffused overhead lighting, gentle shadows on a flat surface.',
    'Clean light teal background, no gradients.',
    'Rounded smooth 3D objects, Pixar-style miniature look.',
    'Absolutely no text, no letters, no numbers, no writing, no people, no faces.',
    'Isometric angle, product photography style, centered composition.',
    'High quality 3D illustration, octane render.',
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
    const { event_id, source, force } = await req.json()
    if (!event_id) {
      return new Response(JSON.stringify({ error: 'event_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Determine table based on source (post or community event)
    const table = source === 'post' ? 'posts' : 'community_events'
    const titleField = 'title'
    const imageField = 'image_url'

    // Fetch event details
    const { data: event, error: fetchErr } = await (supabase
      .from(table) as any)
      .select(`id, ${titleField}, description, ${imageField}${source === 'community' ? ', category' : ', type'}`)
      .eq('id', event_id)
      .single()

    if (fetchErr || !event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Skip if event already has an image (unless force regeneration)
    if (event[imageField] && !force) {
      return new Response(JSON.stringify({ image_url: event[imageField], skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate image
    const category = source === 'post' ? 'default' : (event.category || 'default')
    const prompt = buildPrompt(event[titleField], event.description, category)
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
    const bucket = source === 'post' ? 'post-images' : STORAGE_BUCKET
    const fileName = `generated/${event_id}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(fileName, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    const publicUrl = urlData.publicUrl

    // Update record with generated image
    const { error: updateErr } = await (supabase
      .from(table) as any)
      .update({ [imageField]: publicUrl })
      .eq('id', event_id)

    if (updateErr) {
      throw new Error(`Record update failed: ${updateErr.message}`)
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

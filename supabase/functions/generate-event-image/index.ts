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

// Title-to-scene mapping — describes scenes with simplified ball-head characters
// and geometric props in a monochrome teal miniature city setting.
// Characters: large sphere head, tiny curved smile (no other facial features),
// simple tube/cylinder body and limbs, like claymation figures.
const TITLE_KEYWORDS: [RegExp, string][] = [
  [/lautapeli|board.?game|peli-ilta/i, 'two ball-headed figures sitting on cube blocks around a flat square table with small cube dice and cone-shaped game pawns between them, rectangular buildings behind'],
  [/jalkapallo|football|futis/i, 'ball-headed figures running near a large sphere ball, rectangular goal frame, block buildings and lollipop trees in background'],
  [/koripallo|basketball|basket/i, 'a ball-headed figure reaching toward a sphere near a cylindrical hoop on a tall post, block buildings behind'],
  [/juoks|running|maraton/i, 'several ball-headed figures running along a flat path between block buildings, lollipop trees along the route'],
  [/urhei|sport|liikunt/i, 'ball-headed figures with sphere balls and simple equipment shapes, block buildings and lollipop trees behind'],
  [/musiik|music|keikka|konsertti/i, 'ball-headed figures on a rectangular stage platform, simplified geometric instrument shapes, block buildings behind'],
  [/taide|art|maalaus|piirustus/i, 'a ball-headed figure standing at a rectangular easel shape, block buildings and lollipop trees behind'],
  [/ruoka|food|kokkaus|kokki|resept/i, 'ball-headed figures around a rectangular counter with cylinder pot shapes and hemisphere bowls, block buildings behind'],
  [/kahvi|coffee|brunch/i, 'ball-headed figures sitting on cube blocks at a rectangular table with cylinder cup shapes, block buildings and lollipop trees behind'],
  [/kirja|book|lukupiiri|reading/i, 'ball-headed figures sitting on cube blocks holding flat rectangular shapes, surrounded by stacked slab book shapes, buildings behind'],
  [/elokuva|movie|leffa|film/i, 'ball-headed figures sitting on cube seats facing a large flat rectangle screen, block buildings behind'],
  [/puutarh|garden|piha|istutus/i, 'ball-headed figures near cylinder pot shapes and lollipop trees, rectangular raised bed blocks, buildings behind'],
  [/retki|hike|patikointi|luonto/i, 'ball-headed figures walking along a path between cone-shaped trees and triangular mountain shapes'],
  [/pyörä|bike|cycling|fillari/i, 'a ball-headed figure on a simplified geometric bicycle shape, flat road path, block buildings and lollipop trees'],
  [/jooga|yoga|meditaat/i, 'ball-headed figures on flat rectangular mats in calm poses, lollipop trees and block buildings behind'],
  [/käsityö|craft|neulo|ompel/i, 'ball-headed figures at a rectangular table with sphere yarn shapes and thin cylinder tools, buildings behind'],
  [/valokuva|photo|kamera/i, 'a ball-headed figure holding a small rectangular box camera, other figures posing, block buildings behind'],
  [/lasten|kids|lapsi|perhe/i, 'a tall ball-headed figure holding hands with a smaller ball-headed figure, stacked cube play blocks, lollipop trees and buildings'],
  [/grilli|bbq|piknik|picnic/i, 'ball-headed figures around a hemisphere dome grill shape, flat disc plates on a rectangular table block, lollipop trees behind'],
  [/siivous|clean|talkoo/i, 'ball-headed figures with simple cylinder tool shapes near rectangular buildings and lollipop trees, cube blocks on the ground'],
  [/kirppu|flea.?market|myynti/i, 'ball-headed figures at rectangular table blocks with small cube items, under flat rectangular canopy shapes, buildings behind'],
]

const CATEGORY_SCENES: Record<string, string> = {
  urheilu: 'ball-headed figures with sphere balls near rectangular goals and cone markers, block buildings behind',
  musiikki: 'ball-headed figures on a rectangular stage with geometric instrument shapes, block buildings behind',
  taide: 'a ball-headed figure at a rectangular easel, block buildings and lollipop trees behind',
  ruoka: 'ball-headed figures around rectangular counters with cylinder pots and hemisphere bowls, buildings behind',
  peli: 'ball-headed figures at a flat table with cube dice and cone pawns, block buildings behind',
  ulkoilu: 'ball-headed figures walking between cone-shaped trees and triangular mountains',
  opiskelu: 'ball-headed figures at rectangular desks with stacked slab books, buildings behind',
  yhteiso: 'ball-headed figures walking among rectangular buildings of varying heights with lollipop trees',
  lapset: 'tall and small ball-headed figures near stacked cube blocks and lollipop trees, buildings behind',
  default: 'ball-headed figures walking among rectangular buildings of varying heights, lollipop trees, cube blocks',
}

function getSceneFromTitle(title: string): string | null {
  const lower = title.toLowerCase()
  for (const [pattern, scene] of TITLE_KEYWORDS) {
    if (pattern.test(lower)) return scene
  }
  return null
}

function buildPrompt(title: string, description: string | null, category: string): string {
  const sceneHint = getSceneFromTitle(title)
    || CATEGORY_SCENES[category]
    || CATEGORY_SCENES.default

  return [
    // Exact style reference
    'Monochromatic 3D claymation-style scene. The exact style is:',
    'a miniature city made entirely of smooth matte teal clay,',
    'with simplified ball-headed humanoid figures interacting in the scene.',

    // Color — the critical rule
    'ENTIRE IMAGE IS ONE COLOR: medium mint teal, hex #7EC8C8.',
    'Background, ground, sky, buildings, figures, props — ALL #7EC8C8 teal.',
    'The ground seamlessly blends into the background with no visible horizon.',
    'Depth is shown ONLY through soft directional shadows, not color changes.',

    // Character description
    'Characters are simple clay figures: oversized smooth sphere head,',
    'tiny curved line smile (no eyes, no nose, no other facial features),',
    'simple cylinder/tube body and limbs, slightly rounded. Like toy figurines.',
    'Characters are the SAME teal color as everything else.',

    // Scene
    `Scene: ${sceneHint}.`,

    // Environment
    'Background: rectangular block buildings of varying heights.',
    'Trees are lollipop style: sphere on thin cylinder stick.',
    'All shapes are simple geometric primitives — cubes, cylinders, spheres, cones.',

    // Material and lighting
    'Smooth matte clay material on everything. No realistic textures.',
    'No wood, metal, glass, fabric, grass, or any natural material.',
    'Soft directional light from upper left creating gentle visible shadows for depth.',
    'Shadows are a slightly darker shade of the same teal, never black or gray.',

    // Restrictions
    'NO text, letters, numbers, or writing anywhere.',
    'NO realistic objects — everything is simplified geometric clay.',
    'NO other colors — no black, white, brown, or any accent color.',
    'NO detailed facial features — only a tiny smile curve on sphere heads.',
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

    // Append cache buster so clients fetch fresh image after regeneration
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

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

// Supabase Edge Function: process-image-queue
// Cron-triggered (every minute via pg_cron). Picks pending items from
// image_generation_queue, generates AI images, and updates the records.
// Processes up to BATCH_SIZE items per invocation to stay within timeout.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
const hfToken = Deno.env.get('HF_API_TOKEN')

const IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell'
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${IMAGE_MODEL}`
const HF_TIMEOUT_MS = 60000
const BATCH_SIZE = 3
const MAX_ATTEMPTS = 3

// ── Prompt building (same logic as generate-event-image) ──

const TITLE_KEYWORDS: [RegExp, string][] = [
  [/lautapeli|board.?game|peli-ilta/i, 'two figures sitting on cube blocks around a flat table with small cube dice and cone game pawns between them, block buildings behind'],
  [/jalkapallo|football|futis/i, 'figures running near a large sphere ball, rectangular goal frame, block buildings and sphere-top trees in background'],
  [/koripallo|basketball|basket/i, 'a figure reaching toward a sphere near a cylindrical hoop on a tall post, block buildings behind'],
  [/juoks|running|maraton/i, 'several figures running along a flat path between block buildings, sphere-top trees along the route'],
  [/urhei|sport|liikunt/i, 'figures with sphere balls and simple geometric equipment, block buildings and sphere-top trees behind'],
  [/musiik|music|keikka|konsertti/i, 'figures on a rectangular stage platform, simplified geometric instrument shapes, block buildings behind'],
  [/taide|art|maalaus|piirustus/i, 'a figure standing at a rectangular easel shape, block buildings and sphere-top trees behind'],
  [/ruoka|food|kokkaus|kokki|resept/i, 'figures around a rectangular counter with cylinder pot shapes and hemisphere bowls, block buildings behind'],
  [/kahvi|coffee|brunch/i, 'figures sitting on cube blocks at a rectangular table with cylinder cup shapes, block buildings and sphere-top trees behind'],
  [/kirja|book|lukupiiri|reading/i, 'figures sitting on cube blocks holding flat rectangular shapes, surrounded by stacked slab shapes, buildings behind'],
  [/elokuva|movie|leffa|film/i, 'figures sitting on cube seats facing a large flat rectangle screen, block buildings behind'],
  [/puutarh|garden|piha|istutus/i, 'figures near cylinder pot shapes and sphere-top trees, rectangular raised bed blocks, buildings behind'],
  [/retki|hike|patikointi|luonto/i, 'figures walking along a path between cone-shaped trees and triangular mountain shapes'],
  [/pyörä|bike|cycling|fillari/i, 'a figure on a simplified geometric bicycle frame, flat road path, block buildings and sphere-top trees'],
  [/jooga|yoga|meditaat/i, 'figures on flat rectangular mats in calm poses, sphere-top trees and block buildings behind'],
  [/käsityö|craft|neulo|ompel/i, 'figures at a rectangular table with sphere shapes and thin cylinder tools, buildings behind'],
  [/valokuva|photo|kamera/i, 'a figure holding a small rectangular box, other figures posing, block buildings behind'],
  [/lasten|kids|lapsi|perhe/i, 'a tall figure holding hands with a smaller figure, stacked cube play blocks, sphere-top trees and buildings'],
  [/grilli|bbq|piknik|picnic/i, 'figures around a hemisphere dome shape, flat disc shapes on a rectangular table block, sphere-top trees behind'],
  [/siivous|clean|talkoo/i, 'figures with simple cylinder tool shapes near rectangular buildings and sphere-top trees, cube blocks on the ground'],
  [/kirppu|flea.?market|myynti/i, 'figures at rectangular table blocks with small cube items, under flat rectangular canopy shapes, buildings behind'],
]

const CATEGORY_SCENES: Record<string, string> = {
  urheilu: 'figures with sphere balls near rectangular goals and cone markers, block buildings behind',
  musiikki: 'figures on a rectangular stage with geometric instrument shapes, block buildings behind',
  taide: 'a figure at a rectangular easel, block buildings and sphere-top trees behind',
  ruoka: 'figures around rectangular counters with cylinder pots and hemisphere bowls, buildings behind',
  peli: 'figures at a flat table with cube dice and cone pawns, block buildings behind',
  ulkoilu: 'figures walking between cone-shaped trees and triangular mountains',
  opiskelu: 'figures at rectangular desks with stacked slab shapes, buildings behind',
  yhteiso: 'figures walking among rectangular buildings of varying heights with sphere-top trees',
  lapset: 'tall and small figures near stacked cube blocks and sphere-top trees, buildings behind',
  default: 'figures walking among rectangular buildings of varying heights, sphere-top trees, cube blocks',
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
    'Blender 3D render of a monochrome miniature city diorama.',
    'Smooth matte plastic material like injection-molded toy figures.',
    'NOT claymation, NOT clay, NOT realistic. Clean 3D-printed plastic look.',
    'ENTIRE IMAGE IS ONE SINGLE COLOR: light aqua-cyan, hex #A5DDE0.',
    'Everything is #A5DDE0: background, ground plane, sky, buildings, figures, props, trees.',
    'The ground plane seamlessly blends into the background with no visible horizon line.',
    'There is absolutely NO color variation except through lighting and shadow.',
    'Humanoid figures have oversized perfectly smooth sphere heads.',
    'Heads are COMPLETELY BLANK — NO eyes, NO mouth, NO nose, NO smile, NO face at all.',
    'Just a smooth featureless sphere. Bodies are simple cylinder torso and thin cylinder limbs.',
    'Figures are the SAME #A5DDE0 color as everything else.',
    `Scene: ${sceneHint}.`,
    'Background: rectangular block buildings of varying heights, no windows or doors.',
    'Trees are sphere on thin cylinder stick (lollipop shape).',
    'All objects are simple geometric primitives: cubes, cylinders, spheres, cones, flat planes.',
    'Smooth matte non-reflective plastic on everything. No glossy surfaces.',
    'No reflection, no specular highlights, no shine.',
    'No wood, metal, glass, fabric, grass, or any natural material texture.',
    'Soft directional light from upper left creating small visible shadows for depth.',
    'Shadows are a slightly darker shade of the same aqua-cyan, never black or gray.',
    'NO text, letters, numbers, or writing anywhere in the image.',
    'NO realistic objects — everything is simplified geometric plastic.',
    'NO other colors — no black, white, brown, green, or any accent color.',
    'NO facial features whatsoever on any figure — completely smooth blank sphere heads.',
    'NO reflection or glossy surfaces.',
  ].join(' ')
}

// ── Image generation ──

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
        parameters: { num_inference_steps: 4, width: 768, height: 512 },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'no body')
      throw new Error(`HF API ${res.status}: ${errBody}`)
    }

    return new Uint8Array(await res.arrayBuffer())
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

async function moderateImage(imageBytes: Uint8Array): Promise<boolean> {
  if (!hfToken) return true
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
    if (!res.ok) return true
    const results = await res.json()
    const nsfwScore = results?.find?.((r: any) => r.label === 'nsfw')?.score ?? 0
    return nsfwScore < 0.3
  } catch {
    return true
  }
}

// ── Queue processing ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const results: { id: string; status: string; error?: string }[] = []

  try {
    // Claim pending items atomically (SKIP LOCKED prevents concurrent processing)
    const { data: items, error: claimErr } = await supabase.rpc('claim_image_queue_items', {
      batch_size: BATCH_SIZE,
    })

    if (claimErr) {
      // Fallback: direct query if RPC not yet created
      console.warn('[process-image-queue] RPC fallback:', claimErr.message)
      const { data: fallbackItems } = await (supabase
        .from('image_generation_queue') as any)
        .select('*')
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE)

      if (!fallbackItems?.length) {
        return jsonResponse({ processed: 0, message: 'Queue empty' })
      }

      // Mark as processing
      const ids = fallbackItems.map((i: any) => i.id)
      await (supabase.from('image_generation_queue') as any)
        .update({ status: 'processing', attempts: supabase.rpc ? undefined : undefined })
        .in('id', ids)

      for (const item of fallbackItems) {
        const result = await processItem(supabase, item)
        results.push(result)
      }

      return jsonResponse({ processed: results.length, results })
    }

    if (!items?.length) {
      return jsonResponse({ processed: 0, message: 'Queue empty' })
    }

    // Process each claimed item
    for (const item of items) {
      const result = await processItem(supabase, item)
      results.push(result)
    }

    return jsonResponse({ processed: results.length, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[process-image-queue]', message)
    return jsonResponse({ error: message }, 500)
  }
})

async function processItem(
  supabase: any,
  item: { id: string; event_id: string; source: string; attempts: number },
): Promise<{ id: string; status: string; error?: string }> {
  try {
    // Fetch event/post details
    const table = item.source === 'post' ? 'posts' : 'community_events'
    const selectFields = item.source === 'post'
      ? 'id, title, description, type'
      : 'id, title, description, category'

    const { data: event, error: fetchErr } = await (supabase
      .from(table) as any)
      .select(selectFields)
      .eq('id', item.event_id)
      .single()

    if (fetchErr || !event) {
      await markFailed(supabase, item.id, 'Event not found')
      return { id: item.id, status: 'failed', error: 'Event not found' }
    }

    // Build prompt and generate
    const category = item.source === 'post' ? 'default' : (event.category || 'default')
    const prompt = buildPrompt(event.title, event.description, category)
    const imageBytes = await generateImage(prompt)

    // Moderate
    const isSafe = await moderateImage(imageBytes)
    if (!isSafe) {
      await markFailed(supabase, item.id, 'Failed moderation')
      return { id: item.id, status: 'failed', error: 'Failed moderation' }
    }

    // Upload to storage
    const bucket = item.source === 'post' ? 'post-images' : 'event-images'
    const fileName = `generated/${item.event_id}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(fileName, imageBytes, { contentType: 'image/jpeg', upsert: true })

    if (uploadErr) {
      await markFailed(supabase, item.id, `Upload: ${uploadErr.message}`)
      return { id: item.id, status: 'failed', error: uploadErr.message }
    }

    // Get public URL with cache buster
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName)
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

    // Update the record
    await (supabase.from(table) as any)
      .update({ image_url: publicUrl })
      .eq('id', item.event_id)

    // Mark queue item complete
    await (supabase.from('image_generation_queue') as any)
      .update({ status: 'completed', processed_at: new Date().toISOString() })
      .eq('id', item.id)

    console.log(`[process-image-queue] Generated: ${event.title}`)
    return { id: item.id, status: 'completed' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await markFailed(supabase, item.id, msg)
    return { id: item.id, status: 'failed', error: msg }
  }
}

async function markFailed(supabase: any, queueId: string, error: string) {
  await (supabase.from('image_generation_queue') as any)
    .update({
      status: 'failed',
      error,
      processed_at: new Date().toISOString(),
    })
    .eq('id', queueId)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

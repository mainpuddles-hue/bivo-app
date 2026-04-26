// Edge Function: verify-face
// Uses Hugging Face free Inference API to detect faces in avatar images.
// Sets face_verified = true on the user's profile if a face is detected.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HF_MODEL = 'facebook/detr-resnet-50' // Free object detection — detects "person"
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`

// Person-related labels that indicate a face/person is present
const FACE_LABELS = ['person', 'face', 'man', 'woman', 'boy', 'girl', 'child', 'human']

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify JWT
    const anonClient = createClient(supabaseUrl, anonKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the user's avatar URL
    const supabase = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()

    if (!profile?.avatar_url) {
      return new Response(JSON.stringify({ error: 'no_avatar', verified: false }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Download the avatar image
    const imgResponse = await fetch(profile.avatar_url)
    if (!imgResponse.ok) {
      return new Response(JSON.stringify({ error: 'avatar_fetch_failed', verified: false }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const imageBytes = await imgResponse.arrayBuffer()

    // Call Hugging Face free Inference API for object detection
    const hfToken = Deno.env.get('HUGGINGFACE_TOKEN') // Optional — works without for public models
    const hfHeaders: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
    if (hfToken) hfHeaders['Authorization'] = `Bearer ${hfToken}`

    const hfResponse = await fetch(HF_API_URL, {
      method: 'POST',
      headers: hfHeaders,
      body: imageBytes,
    })

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text()
      // Model might be loading — return retry hint
      if (hfResponse.status === 503) {
        return new Response(JSON.stringify({ error: 'model_loading', verified: false, retry: true }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'detection_failed', detail: errorText, verified: false }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const detections = await hfResponse.json() as Array<{ label: string; score: number }>

    // Check if any detection is a person/face with confidence > 0.5
    const faceDetected = detections.some(
      (d) => FACE_LABELS.includes(d.label.toLowerCase()) && d.score > 0.5
    )

    if (faceDetected) {
      // Mark profile as face-verified
      await supabase
        .from('profiles')
        .update({ face_verified: true })
        .eq('id', user.id)

      return new Response(JSON.stringify({ verified: true, detections: detections.filter(d => d.score > 0.3) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      verified: false,
      reason: 'no_face_detected',
      detections: detections.filter(d => d.score > 0.3),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', message: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

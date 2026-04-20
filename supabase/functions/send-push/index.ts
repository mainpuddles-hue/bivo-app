// Supabase Edge Function: send-push
// Intelligent push notification sender with priority routing, batching,
// quiet hours, and urgent auto-matching.
//
// Priority levels:
//   immediate: urgent_help, new_message → send NOW (bypasses quiet hours)
//   batch: like, follow, thanks, comment → batch every 15 min
//
// Quiet hours: 22:00-07:00 Helsinki time → delay until 07:00
// Exception: urgent_help always sends immediately

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

// Expo push notification API
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// Helsinki timezone — uses Intl for correct DST transitions
function getHelsinkiHour(): number {
  try {
    const helsinkiTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Helsinki',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
    return parseInt(helsinkiTime, 10)
  } catch {
    // Fallback: approximate offset (March-October = UTC+3, else UTC+2)
    const now = new Date()
    const month = now.getUTCMonth()
    const offset = (month >= 2 && month <= 9) ? 3 : 2
    return (now.getUTCHours() + offset) % 24
  }
}

function isQuietHours(): boolean {
  const hour = getHelsinkiHour()
  return hour >= 22 || hour < 7
}

// Notification types and their priority
const IMMEDIATE_TYPES = new Set(['urgent_help', 'new_message'])

const BATCH_TYPES = new Set([
  'post_like', 'post_comment', 'new_follower', 'thanks_received',
  'forum_reply', 'badge_earned', 'review_received',
])

interface PushPayload {
  user_id: string          // recipient
  title: string
  body: string
  type: string             // notification type
  data?: Record<string, string>  // deep link data
  post_id?: string         // for urgent matching
}

interface ExpoPushResult {
  success: boolean
  tokenInvalid: boolean
}

async function sendExpoPush(token: string, title: string, body: string, data?: Record<string, string>, threadId?: string): Promise<ExpoPushResult> {
  // Validate token format before sending
  if (!token || (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken['))) {
    return { success: false, tokenInvalid: true }
  }

  const message: Record<string, any> = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    badge: 1,
  }
  // iOS notification grouping — Apple HIG: group related notifications
  // threadId collapses pushes of the same thread in Notification Center
  if (threadId) {
    message.threadId = threadId
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return { success: false, tokenInvalid: false }

    // Check Expo's response for token errors
    // Expo returns { data: { status: 'ok' | 'error', message?, details? } }
    const result = await res.json()
    const pushResult = result?.data

    if (pushResult?.status === 'error') {
      // Expo returns 'DeviceNotRegistered' when the token is expired/invalid
      const isDeviceNotRegistered = pushResult?.details?.error === 'DeviceNotRegistered'
      const isInvalidToken = pushResult?.details?.error === 'InvalidCredentials'
        || pushResult?.message?.includes('is not a registered push notification recipient')
      return { success: false, tokenInvalid: isDeviceNotRegistered || isInvalidToken }
    }

    return { success: true, tokenInvalid: false }
  } catch {
    clearTimeout(timeout)
    return { success: false, tokenInvalid: false }
  }
}

/** Remove an expired/invalid push token from the user's profile */
async function removeInvalidToken(supabase: any, userId: string) {
  await supabase
    .from('profiles')
    .update({ push_token: null })
    .eq('id', userId)
    .catch(() => {})
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { user_id, title, body: pushBody, type, data, post_id } = body as PushPayload

    if (!user_id || !title || !pushBody || !type) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authorization: only allow sending push to yourself, or urgent broadcasts (which go to nearby users)
    const BROADCAST_TYPES = ['urgent_help', 'juuri_nyt']
    if (!BROADCAST_TYPES.includes(type) && user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Cannot send push to other users' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === URGENT AUTO-MATCH: If this is an urgent post, find and notify nearby helpers ===
    if ((type === 'urgent_help' || type === 'juuri_nyt') && post_id) {
      // Rate limit: check if this user sent an urgent broadcast in the last 30 minutes
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { count: recentUrgentCount } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('is_urgent', true)
        .gte('created_at', thirtyMinAgo)

      if ((recentUrgentCount ?? 0) > 1) {
        return new Response(
          JSON.stringify({ sent: 0, type: 'urgent_rate_limited', reason: 'Too many urgent posts in 30 minutes' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Fetch the post to get neighborhood
      const { data: post } = await supabase
        .from('posts')
        .select('title, location, user_id, user:profiles!posts_user_id_fkey(naapurusto)')
        .eq('id', post_id)
        .single()

      if (post) {
        const neighborhood = (post as any).user?.naapurusto

        // Find users in same neighborhood with push tokens (exclude post creator)
        const { data: neighbors } = await supabase
          .from('profiles')
          .select('id, push_token, name')
          .eq('naapurusto', neighborhood)
          .neq('id', (post as any).user_id)
          .not('push_token', 'is', null)
          .limit(200)

        // Build batch messages for Expo push API (up to 100 per request)
        const BATCH_SIZE = 100
        const validNeighbors = (neighbors ?? []).filter((n: any) => {
          const token = n.push_token
          return token && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
        })

        const sent: string[] = []
        const invalidTokenUserIds: string[] = []

        for (let i = 0; i < validNeighbors.length; i += BATCH_SIZE) {
          const batch = validNeighbors.slice(i, i + BATCH_SIZE)
          const messages = batch.map((n: any) => ({
            to: n.push_token,
            sound: 'default',
            title: `🚨 ${title}`,
            body: pushBody,
            data: { post_id: post_id!, type: 'urgent', screen: 'post' },
            badge: 1,
          }))

          const batchController = new AbortController()
          const batchTimeout = setTimeout(() => batchController.abort(), 15000)
          try {
            const res = await fetch(EXPO_PUSH_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(messages),
              signal: batchController.signal,
            })
            clearTimeout(batchTimeout)

            if (res.ok) {
              const results = await res.json()
              // Expo returns { data: [...] } for batch requests
              const dataArr = Array.isArray(results?.data) ? results.data : [results?.data].filter(Boolean)
              dataArr.forEach((result: any, idx: number) => {
                const neighbor = batch[idx]
                if (!neighbor) return
                if (result?.status === 'ok') {
                  sent.push(neighbor.id)
                } else if (
                  result?.details?.error === 'DeviceNotRegistered' ||
                  result?.details?.error === 'InvalidCredentials'
                ) {
                  invalidTokenUserIds.push(neighbor.id)
                }
              })
            }
          } catch (batchErr: any) {
            clearTimeout(batchTimeout)
            console.error('[send-push] Urgent broadcast batch failed:', {
              batch_index: i / BATCH_SIZE,
              batch_size: batch.length,
              total_neighbors: validNeighbors.length,
              post_id,
              error: batchErr?.message ?? String(batchErr),
            })
          }
        }

        // Clean up expired/invalid tokens in the background
        if (invalidTokenUserIds.length > 0) {
          await Promise.all(invalidTokenUserIds.map(uid => removeInvalidToken(supabase, uid)))
        }

        return new Response(
          JSON.stringify({ sent: sent.length, type: 'urgent_broadcast', neighborhood }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // === STANDARD PUSH: Single user notification ===

    // Get recipient's push token
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token, language')
      .eq('id', user_id)
      .single()

    if (!profile?.push_token) {
      return new Response(
        JSON.stringify({ sent: false, reason: 'no_push_token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Check user's notification preferences — respect opt-out
    // Map push types to preference types (e.g. 'post_like' → 'likes', 'new_message' → 'messages')
    const TYPE_TO_PREF: Record<string, string> = {
      post_like: 'likes',
      post_comment: 'comments',
      new_follower: 'follows',
      new_message: 'messages',
      review_received: 'reviews',
      thanks_received: 'nappaa',
      badge_earned: 'system',
      forum_reply: 'comments',
      nearby_post: 'nearby_posts',
      event_reminder: 'events',
      event_invite: 'events',
    }
    const prefType = TYPE_TO_PREF[type]
    if (prefType) {
      const { data: prefRow } = await supabase
        .from('notification_preferences')
        .select('enabled')
        .eq('user_id', user_id)
        .eq('type', prefType)
        .maybeSingle()
      // If user explicitly disabled this type, skip push (notification row in DB remains)
      if (prefRow && prefRow.enabled === false) {
        return new Response(
          JSON.stringify({ sent: false, reason: 'user_opted_out', type: prefType }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Check priority
    const isImmediate = IMMEDIATE_TYPES.has(type)
    const isBatch = BATCH_TYPES.has(type)

    // Quiet hours check (except urgent).
    // The original notification row still exists in the notifications table,
    // so the user will see it next time they open the app. We are NOT
    // actually queueing the push for later delivery — a future cron job
    // could do that via scheduled_notifications, but that isn't wired up
    // yet. Reporting `queued: true` here misled callers into thinking a
    // delayed push was scheduled.
    if (isQuietHours() && !IMMEDIATE_TYPES.has(type)) {
      return new Response(
        JSON.stringify({ sent: false, reason: 'quiet_hours' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Batch notifications: check if we should batch
    if (isBatch) {
      // Check how many similar notifications in last 15 minutes
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('type', type)
        .eq('is_read', false)
        .gte('created_at', new Date(Date.now() - 15 * 60000).toISOString())

      if ((count ?? 0) > 1) {
        // Batch: send summary instead of individual
        const result = await sendExpoPush(
          profile.push_token,
          title,
          profile.language === 'en' ? `${count} new notifications`
            : profile.language === 'sv' ? `${count} nya aviseringar`
            : `${count} uutta ilmoitusta`,
          data,
        )
        // Clean up invalid token if detected
        if (result.tokenInvalid) {
          await removeInvalidToken(supabase, user_id)
        }
        return new Response(
          JSON.stringify({ sent: result.success, type: 'batched', count }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Derive thread ID for iOS notification grouping (Apple HIG).
    // - Messages: group per conversation (or global fallback)
    // - Likes/comments: group per post
    // - Follows/reviews/badges: group per type
    const threadId = type === 'new_message' && data?.conversationId
      ? `conv_${data.conversationId}`
      : (type === 'post_like' || type === 'post_comment') && data?.postId
      ? `post_${data.postId}`
      : type

    // Send individual push
    const result = await sendExpoPush(profile.push_token, title, pushBody, data, threadId)

    // Clean up expired/invalid push tokens so we don't keep trying to send to them
    if (result.tokenInvalid) {
      await removeInvalidToken(supabase, user_id)
    }

    return new Response(
      JSON.stringify({ sent: result.success, type: isImmediate ? 'immediate' : 'standard' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[send-push]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

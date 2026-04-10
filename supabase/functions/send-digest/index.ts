import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Auth: only allow cron calls with the correct secret
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (req.headers.get('x-cron-secret') !== cronSecret) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'No RESEND_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    // Get active users with neighborhoods
    const { data: users } = await supabase
      .from('profiles')
      .select('id, email, name, naapurusto, language')
      .not('email', 'is', null)
      .not('naapurusto', 'is', null)
      .eq('is_banned', false)

    if (!users?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get activity counts per neighborhood. Posts and community_events don't
    // have a direct neighborhood column — they're filtered via the creator's
    // profile.naapurusto. Previously the inner-join filter was missing, so
    // every user in every neighborhood saw the same system-wide count in their
    // digest (misleading "X new posts in your neighborhood" stat).
    const neighborhoods = [...new Set(users.map((u: any) => u.naapurusto).filter(Boolean))]
    const activityByNeighborhood: Record<string, { posts: number; events: number }> = {}

    for (const nh of neighborhoods) {
      const [postsRes, eventsRes] = await Promise.all([
        supabase
          .from('posts')
          .select('id, creator:profiles!posts_user_id_fkey!inner(naapurusto)', { count: 'exact', head: true })
          .eq('is_active', true)
          .gte('created_at', weekAgo)
          .eq('creator.naapurusto', nh),
        supabase
          .from('community_events')
          .select('id, creator:profiles!community_events_creator_id_fkey!inner(naapurusto)', { count: 'exact', head: true })
          .eq('is_active', true)
          .gte('created_at', weekAgo)
          .eq('creator.naapurusto', nh),
      ])
      activityByNeighborhood[nh] = {
        posts: postsRes.count ?? 0,
        events: eventsRes.count ?? 0,
      }
    }

    let sentCount = 0
    for (const user of users) {
      const activity = activityByNeighborhood[user.naapurusto]
      if (!activity || (activity.posts === 0 && activity.events === 0)) continue

      // Check notification preferences
      const { data: pref } = await supabase
        .from('notification_preferences')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('type', 'nearby_posts')
        .maybeSingle()
      if (pref?.enabled === false) continue

      const isFi = user.language === 'fi'
      const subject = isFi
        ? `Viikon kooste — ${user.naapurusto}`
        : `Weekly digest — ${user.naapurusto}`
      const html = `
        <h2>${subject}</h2>
        <p>${activity.posts} ${isFi ? 'uutta ilmoitusta' : 'new posts'}</p>
        <p>${activity.events} ${isFi ? 'uutta tapahtumaa' : 'new events'}</p>
        <br>
        <a href="https://tackbird.com" style="display:inline-block;padding:12px 24px;background:#2D6B5E;color:#fff;text-decoration:none;border-radius:8px;">
          ${isFi ? 'Avaa TackBird' : 'Open TackBird'}
        </a>
        <br><br>
        <p style="font-size:12px;color:#999;">— TackBird</p>
      `

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'TackBird <digest@tackbird.com>',
            to: user.email,
            subject,
            html,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        sentCount++
      } catch (err) {
        clearTimeout(timeout)
        console.error(`[send-digest] Failed to send to ${user.id}:`, err)
      }

      // Rate limit: max 50 emails per batch
      if (sentCount >= 50) break
    }

    // Log the digest run
    try {
      await (supabase.from('edge_function_errors') as any).insert({
        function_name: 'send-digest',
        error_message: `Digest completed: ${sentCount} sent`,
        context: { sent: sentCount, total: users.length },
      })
    } catch {}

    return new Response(JSON.stringify({ sent: sentCount, total: users.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-digest]', err.message)

    // Try to log the error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      await (supabase.from('edge_function_errors') as any).insert({
        function_name: 'send-digest',
        error_message: err.message,
        error_stack: err.stack,
      })
    } catch {}

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

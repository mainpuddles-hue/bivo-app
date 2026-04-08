// Supabase Edge Function: admin-api
// Unified admin endpoint for dashboard stats, user management,
// content moderation, report resolution, and audit log access.
// Requires admin authentication (profiles.is_admin = true).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      getEnvOrThrow('SUPABASE_URL'),
      getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401)
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_admin) {
      return jsonResponse({ error: 'Forbidden: admin access required' }, 403)
    }

    // Parse request body
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400)
    }

    const { action, ...params } = body

    switch (action) {
      case 'dashboard_stats': {
        const [users, posts, events, messages, reports] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('community_events').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('messages').select('id', { count: 'exact', head: true }),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ])
        return jsonResponse({
          users: users.count ?? 0,
          posts: posts.count ?? 0,
          events: events.count ?? 0,
          messages: messages.count ?? 0,
          pending_reports: reports.count ?? 0,
        })
      }

      case 'ban_user': {
        const { user_id, banned } = params as { user_id: string; banned: boolean }
        if (!user_id) return jsonResponse({ error: 'user_id required' }, 400)
        const { error } = await supabase
          .from('profiles')
          .update({ is_banned: banned ?? true })
          .eq('id', user_id)
        if (error) return jsonResponse({ error: error.message }, 500)
        return jsonResponse({ success: true, user_id, banned: banned ?? true })
      }

      case 'resolve_report': {
        const { report_id, resolution } = params as { report_id: string; resolution: string }
        if (!report_id || !resolution) {
          return jsonResponse({ error: 'report_id and resolution required' }, 400)
        }
        const { error } = await supabase
          .from('reports')
          .update({ status: resolution })
          .eq('id', report_id)
        if (error) return jsonResponse({ error: error.message }, 500)
        return jsonResponse({ success: true, report_id, resolution })
      }

      case 'content_flags': {
        const { data, error } = await supabase
          .from('content_flags')
          .select('*, post:posts(id, title, user_id)')
          .eq('reviewed', false)
          .order('created_at', { ascending: false })
          .limit(20)
        if (error) return jsonResponse({ error: error.message }, 500)
        return jsonResponse(data ?? [])
      }

      case 'review_flag': {
        const { flag_id, action: flagAction } = params as { flag_id: string; action: string }
        if (!flag_id) return jsonResponse({ error: 'flag_id required' }, 400)

        const { error: updateError } = await supabase
          .from('content_flags')
          .update({ reviewed: true })
          .eq('id', flag_id)
        if (updateError) return jsonResponse({ error: updateError.message }, 500)

        if (flagAction === 'hide') {
          const { data: flag } = await supabase
            .from('content_flags')
            .select('post_id')
            .eq('id', flag_id)
            .maybeSingle()
          if (flag?.post_id) {
            await supabase.from('posts').update({ is_active: false }).eq('id', flag.post_id)
          }
        }
        return jsonResponse({ success: true, flag_id, action: flagAction ?? 'reviewed' })
      }

      case 'audit_log': {
        const { data, error } = await supabase
          .from('audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) return jsonResponse({ error: error.message }, 500)
        return jsonResponse(data ?? [])
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin-api]', msg)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

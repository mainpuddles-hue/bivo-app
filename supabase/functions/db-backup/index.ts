// Supabase Edge Function: db-backup
// Exports critical table data as JSON and stores in Supabase Storage.
// Designed to run on a daily cron schedule (3 AM).
// Authenticate with CRON_SECRET header for scheduled invocations.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

serve(async (req) => {
  try {
    // Cron secret authentication
    const cronSecret = Deno.env.get('CRON_SECRET')
    const reqSecret = req.headers.get('x-cron-secret')
    if (cronSecret && reqSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      getEnvOrThrow('SUPABASE_URL'),
      getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    )

    const tables = [
      'profiles',
      'posts',
      'conversations',
      'messages',
      'community_events',
      'notifications',
      'user_points',
      'reviews',
      'rental_bookings',
      'service_bookings',
    ]

    const backup: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      tables: {} as Record<string, { count: number; data: unknown[] }>,
    }

    const tableResults = backup.tables as Record<string, { count: number; data: unknown[] }>

    // Fetch tables in parallel batches of 3 to stay within timeout
    for (let i = 0; i < tables.length; i += 3) {
      const batch = tables.slice(i, i + 3)
      const results = await Promise.allSettled(
        batch.map(table => supabase.from(table).select('*').limit(5000))
      )
      for (let j = 0; j < batch.length; j++) {
        const table = batch[j]
        const result = results[j]
        if (result.status === 'fulfilled' && result.value.data) {
          tableResults[table] = { count: result.value.data.length, data: result.value.data }
        }
      }
    }
    // All tables fetched in parallel batches above

    // Save to storage
    const date = new Date().toISOString().split('T')[0]
    const path = `backups/${date}.json`
    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(path, JSON.stringify(backup), {
        contentType: 'application/json',
        upsert: true,
      })

    const response = {
      success: !uploadError,
      path,
      tables: Object.keys(tableResults).length,
      total_rows: Object.values(tableResults).reduce((sum, t) => sum + t.count, 0),
      timestamp: backup.timestamp,
      error: uploadError?.message ?? null,
    }

    return new Response(JSON.stringify(response), {
      status: uploadError ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[db-backup]', msg)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

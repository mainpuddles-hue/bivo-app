// Supabase Edge Function: health-check
// Monitors the health of database, storage, and auth services.
// Returns latency measurements and an overall status.
// No authentication required — designed for uptime monitoring.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

interface HealthCheck {
  status: 'ok' | 'error'
  latency?: number
  error?: string
}

serve(async () => {
  const start = Date.now()
  const checks: Record<string, HealthCheck> = {}

  const supabase = createClient(
    getEnvOrThrow('SUPABASE_URL'),
    getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
  )

  // Database check
  try {
    const dbStart = Date.now()
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    checks.database = { status: 'ok', latency: Date.now() - dbStart }
  } catch (err: unknown) {
    console.error('[health-check] DB:', err instanceof Error ? err.message : err)
    checks.database = { status: 'error', error: 'database_unavailable' }
  }

  // Storage check
  try {
    const stStart = Date.now()
    const { error } = await supabase.storage.listBuckets()
    if (error) throw error
    checks.storage = { status: 'ok', latency: Date.now() - stStart }
  } catch (err: unknown) {
    console.error('[health-check] Storage:', err instanceof Error ? err.message : err)
    checks.storage = { status: 'error', error: 'storage_unavailable' }
  }

  // Auth check
  try {
    const authStart = Date.now()
    // Use admin API to verify auth service is responding
    const { error } = await supabase.auth.getSession()
    if (error) throw error
    checks.auth = { status: 'ok', latency: Date.now() - authStart }
  } catch (err: unknown) {
    console.error('[health-check] Auth:', err instanceof Error ? err.message : err)
    checks.auth = { status: 'error', error: 'auth_unavailable' }
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok')
  const totalLatency = Date.now() - start

  return new Response(
    JSON.stringify({
      status: allOk ? 'healthy' : 'degraded',
      checks,
      total_latency: totalLatency,
      timestamp: new Date().toISOString(),
    }),
    {
      status: allOk ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    }
  )
})

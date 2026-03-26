import { createClient } from '@/lib/supabase/client'

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`

interface PushParams {
  user_id: string
  title: string
  body: string
  type: string
  data?: Record<string, string>
  post_id?: string
}

/**
 * Fire-and-forget push notification via Edge Function.
 * Handles batching, quiet hours, and urgent broadcasting server-side.
 */
export async function triggerPush(params: PushParams): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
    await fetch(`${FUNCTIONS_URL}/send-push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })
  } catch {} // Non-blocking — never fail the main action
}

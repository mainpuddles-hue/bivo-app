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
    await fetch(`${FUNCTIONS_URL}/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch {} // Non-blocking — never fail the main action
}

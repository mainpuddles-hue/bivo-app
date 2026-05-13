import { SupabaseClient } from '@supabase/supabase-js'

const PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

async function callEdgeFunction<T>(
  supabase: SupabaseClient,
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ data?: T; error?: string }> {
  let session
  try {
    const resp = await supabase.auth.getSession()
    session = resp.data.session
  } catch {
    return { error: 'Istunnon haku epäonnistui. Tarkista verkkoyhteys.' }
  }
  if (!session?.access_token) return { error: 'Et ole kirjautunut.' }

  const res = await fetch(`${PROJECT_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let payload: any
  try { payload = await res.json() } catch { payload = {} }

  if (!res.ok) return { error: payload?.error ?? `HTTP ${res.status}` }
  return { data: payload as T }
}

export interface MintTokenResult {
  token: string
  expires_at: string
  booking_id: string
}

export async function mintHandoverToken(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ data?: MintTokenResult; error?: string }> {
  return callEdgeFunction<MintTokenResult>(supabase, 'mint-handover-token', { booking_id: bookingId })
}

export interface VerifyTokenResult {
  verified: boolean
  booking_id: string
  item_id: string
}

export async function verifyHandoverToken(
  supabase: SupabaseClient,
  bookingId: string,
  token: string,
): Promise<{ data?: VerifyTokenResult; error?: string }> {
  return callEdgeFunction<VerifyTokenResult>(supabase, 'verify-handover-token', {
    booking_id: bookingId,
    token,
  })
}

export function encodeHandoverPayload(bookingId: string, token: string): string {
  return `bivo:handover:${bookingId}:${token}`
}

export function decodeHandoverPayload(payload: string): { bookingId: string; token: string } | null {
  const match = payload.match(/^bivo:handover:([a-f0-9-]+):([a-zA-Z0-9_-]+)$/i)
  if (!match) return null
  return { bookingId: match[1], token: match[2] }
}

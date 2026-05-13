import * as WebBrowser from 'expo-web-browser'
import { SupabaseClient } from '@supabase/supabase-js'

const PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

async function callEdgeFunction<T>(
  supabase: SupabaseClient,
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ data?: T; error?: string; errorCode?: string }> {
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

  if (!res.ok) {
    return {
      error: payload?.error ?? `HTTP ${res.status}`,
      errorCode: payload?.error_code,
    }
  }
  return { data: payload as T }
}

export async function startConnectOnboarding(
  supabase: SupabaseClient,
  returnUrl = 'bivo://payouts',
): Promise<{ error?: string; completed?: boolean }> {
  const { data, error } = await callEdgeFunction<{ url: string; account_id: string }>(
    supabase,
    'stripe-connect-onboard',
    { return_url: returnUrl },
  )
  if (error || !data) return { error: error ?? 'Maksutietojen lisäys ei onnistunut.' }

  const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl)

  if (result.type === 'success') return { completed: true }
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: 'Maksutietojen lisäys keskeytettiin.' }
  }
  return { error: 'Maksutietojen lisäys ei onnistunut.' }
}

export async function startRentalCheckout(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string; errorCode?: string; paid?: boolean; cancelled?: boolean }> {
  const { data, error, errorCode } = await callEdgeFunction<{ url: string; session_id: string }>(
    supabase,
    'stripe-checkout',
    { booking_id: bookingId },
  )
  if (error || !data) return { error: error ?? 'Maksusivun avaaminen epäonnistui.', errorCode }

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'bivo://payment')

  if (result.type === 'success') {
    try {
      const parsed = new URL(result.url)
      if (parsed.pathname.includes('payment/success')) return { paid: true }
      if (parsed.pathname.includes('payment/cancel')) return { cancelled: true }
    } catch {
      return { error: 'Maksun tila tuntematon. Tarkista tilanne hetken päästä.' }
    }
    return { error: 'Maksun tila tuntematon. Tarkista tilanne hetken päästä.' }
  }
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { cancelled: true }
  }
  return { error: 'Maksu ei onnistunut' }
}

export async function captureRentalPayment(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string; conversationId?: string }> {
  const { data, error } = await callEdgeFunction<{
    captured: boolean
    conversation_id: string | null
  }>(supabase, 'capture-rental', { booking_id: bookingId })
  if (error || !data) return { error: error ?? 'Maksun veloitus epäonnistui.' }
  return { conversationId: data.conversation_id ?? undefined }
}

export async function cancelRentalPayment(
  supabase: SupabaseClient,
  bookingId: string,
  newStatus: 'rejected' | 'cancelled',
): Promise<{ error?: string }> {
  const { data, error } = await callEdgeFunction<{
    cancelled: boolean
    pi_cancelled: boolean
    new_status: string
  }>(supabase, 'cancel-rental-payment', { booking_id: bookingId, new_status: newStatus })
  if (error || !data) return { error: error ?? 'Peruutus epäonnistui' }
  return {}
}

export async function startCardSetup(
  supabase: SupabaseClient,
  returnUrl = 'bivo://payment/card-added',
): Promise<{ error?: string; added?: boolean; cancelled?: boolean }> {
  const { data, error } = await callEdgeFunction<{ url: string }>(
    supabase,
    'create-setup-session',
    { return_url: returnUrl },
  )
  if (error || !data) return { error: error ?? 'Kortin lisäys ei onnistunut.' }

  const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl)

  if (result.type === 'success') {
    try {
      const parsed = new URL(result.url)
      if (parsed.pathname.includes('card-added')) return { added: true }
    } catch {
      return { cancelled: true }
    }
    return { cancelled: true }
  }
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { cancelled: true }
  }
  return { error: 'Kortin lisäys epäonnistui' }
}

export async function getLenderOnboardingStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ hasAccount: boolean; onboarded: boolean }> {
  const { data } = await supabase
    .from('profiles')
    .select('stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', userId)
    .maybeSingle()
  return {
    hasAccount: !!data?.stripe_connect_account_id,
    onboarded: !!data?.stripe_connect_onboarded,
  }
}

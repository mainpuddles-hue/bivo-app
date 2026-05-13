import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { PLATFORM_COMMISSION_RATE, MAX_RENTAL_DAYS } from './constants'

export interface RentalBooking {
  id: string
  item_id: string
  borrower_id: string
  lender_id: string
  start_date: string
  end_date: string
  days: number
  daily_fee: number
  total_fee: number
  platform_commission: number
  deposit_amount: number
  deposit_status: 'none' | 'authorized' | 'captured' | 'released' | 'partial_captured'
  status: 'pending' | 'confirmed' | 'paid' | 'completed' | 'cancelled' | 'rejected' | 'disputed' | 'refunded'
  pickup_method: 'address' | 'hub' | 'locker'
  pickup_state: 'pending_method' | 'awaiting_lender_dropoff' | 'awaiting_borrower_pickup' | 'in_use' | 'awaiting_borrower_return' | 'awaiting_lender_collection' | 'completed_pickup_flow'
  notes: string | null
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_deposit_intent_id: string | null
  handover_token: string | null
  actual_return_date: string | null
  penalty_amount: number | null
  created_at: string
}

interface CreateRentalRequestInput {
  itemId: string
  borrowerId: string
  lenderId: string
  startDate: string
  endDate: string
  dailyFee: number
  depositAmount: number
  pickupMethod?: 'address' | 'hub' | 'locker'
  notes?: string
}

export async function createRentalRequest(
  supabase: SupabaseClient,
  input: CreateRentalRequestInput,
): Promise<{ id: string } | { error: string }> {
  const days = daysBetween(input.startDate, input.endDate)
  if (days < 1) return { error: 'Palautuspäivän on oltava noutopäivän jälkeen.' }
  if (days > MAX_RENTAL_DAYS) return { error: `Vuokra-aika voi olla enintään ${MAX_RENTAL_DAYS} päivää.` }

  const totalFee = input.dailyFee * days
  const platformCommission = totalFee * PLATFORM_COMMISSION_RATE

  const { data, error } = await supabase
    .from('rental_bookings')
    .insert({
      item_id: input.itemId,
      borrower_id: input.borrowerId,
      lender_id: input.lenderId,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      daily_fee: input.dailyFee,
      total_fee: totalFee,
      platform_commission: platformCommission,
      platform_commission_rate: PLATFORM_COMMISSION_RATE,
      deposit_amount: input.depositAmount,
      deposit_status: 'none',
      status: 'pending',
      pickup_method: input.pickupMethod ?? 'address',
      pickup_state: 'pending_method',
      notes: input.notes ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Pyynnön luonti epäonnistui' }
  }
  return { id: data.id }
}

export interface RentalListItem extends RentalBooking {
  item: {
    id: string
    title: string
    images: { image_url: string; sort_order: number }[]
  }
  borrower: { id: string; name: string; avatar_url: string | null }
  lender: { id: string; name: string; avatar_url: string | null }
}

export function useMyRentals(supabase: SupabaseClient, userId: string | undefined) {
  const [asBorrower, setAsBorrower] = useState<RentalListItem[]>([])
  const [asLender, setAsLender] = useState<RentalListItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRentals = async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const select = `
      *,
      item:items!rental_bookings_item_id_fkey ( id, title, images:item_images ( image_url, sort_order ) ),
      borrower:profiles!rental_bookings_borrower_id_fkey ( id, name, avatar_url ),
      lender:profiles!rental_bookings_lender_id_fkey ( id, name, avatar_url )
    `

    const [borrowerRes, lenderRes] = await Promise.all([
      supabase.from('rental_bookings').select(select).eq('borrower_id', userId).order('created_at', { ascending: false }),
      supabase.from('rental_bookings').select(select).eq('lender_id', userId).order('created_at', { ascending: false }),
    ])

    setAsBorrower((borrowerRes.data ?? []) as unknown as RentalListItem[])
    setAsLender((lenderRes.data ?? []) as unknown as RentalListItem[])
    setLoading(false)
  }

  useEffect(() => {
    fetchRentals()

    if (!userId) return
    const channel = supabase
      .channel(`my_rentals:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rental_bookings', filter: `borrower_id=eq.${userId}` },
        () => fetchRentals(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rental_bookings', filter: `lender_id=eq.${userId}` },
        () => fetchRentals(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { asBorrower, asLender, loading, refetch: fetchRentals }
}

export async function approveRental(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string; conversationId?: string }> {
  const { captureRentalPayment } = await import('./stripe')
  return captureRentalPayment(supabase, bookingId)
}

export async function rejectRental(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string }> {
  const { cancelRentalPayment } = await import('./stripe')
  return cancelRentalPayment(supabase, bookingId, 'rejected')
}

export async function cancelRental(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string }> {
  const { cancelRentalPayment } = await import('./stripe')
  return cancelRentalPayment(supabase, bookingId, 'cancelled')
}

export async function markReturned(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('rental_bookings')
    .update({ pickup_state: 'awaiting_lender_collection' })
    .eq('id', bookingId)
  if (error) return { error: error.message }
  return {}
}

export async function confirmReceipt(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('rental_bookings')
    .update({
      pickup_state: 'completed_pickup_flow',
      status: 'completed',
    })
    .eq('id', bookingId)
  if (error) return { error: error.message }
  return {}
}

export async function submitReview(
  supabase: SupabaseClient,
  bookingId: string,
  rating: number,
  content: string,
): Promise<{ reviewId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('submit_review', {
    p_booking_id: bookingId,
    p_rating: rating,
    p_content: content,
  })
  if (error) return { error: error.message }
  return { reviewId: data as string }
}

export interface RentalReview {
  id: string
  booking_id: string
  reviewer_id: string
  reviewed_id: string
  role: 'borrower' | 'lender'
  rating: number
  content: string | null
  created_at: string
}

export function useReviewsForBooking(supabase: SupabaseClient, bookingId: string | undefined) {
  const [reviews, setReviews] = useState<RentalReview[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReviews = async () => {
    if (!bookingId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase.rpc('get_reviews_for_rental', { p_booking_id: bookingId })
    setReviews(((data ?? []) as unknown) as RentalReview[])
    setLoading(false)
  }

  useEffect(() => {
    fetchReviews()
    if (!bookingId) return
    const channel = supabase
      .channel(`reviews_for:${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rental_bookings', filter: `id=eq.${bookingId}` },
        () => fetchReviews(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bookingId])

  return { reviews, loading, refetch: fetchReviews }
}

export function useRentalBooking(supabase: SupabaseClient, id: string | undefined) {
  const [booking, setBooking] = useState<RentalBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false

    const fetchBooking = async () => {
      const { data, error } = await supabase
        .from('rental_bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (error) setError(error.message)
      setBooking(data as RentalBooking | null)
      setLoading(false)
    }

    fetchBooking()

    const channel = supabase
      .channel(`rental_booking:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rental_bookings', filter: `id=eq.${id}` },
        (payload) => {
          if (!cancelled) setBooking(payload.new as RentalBooking)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [id])

  return { booking, loading, error }
}

function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const s = new Date(sy, sm - 1, sd)
  const e = new Date(ey, em - 1, ed)
  const diffMs = e.getTime() - s.getTime()
  return Math.round(diffMs / 86400000)
}

export function formatDate(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'tänään'
  if (d.toDateString() === tomorrow.toDateString()) return 'huomenna'

  return d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(base: string, days: number): string {
  const [y, m, day] = base.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

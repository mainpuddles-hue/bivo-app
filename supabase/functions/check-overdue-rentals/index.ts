// Supabase Edge Function: check-overdue-rentals
// Cron: runs daily at 08:00 UTC
// Checks for overdue rental bookings and applies escalating consequences:
//   0-24h  → Grace period reminder
//   24-48h → Warning to both parties
//   48h+   → Daily penalty (1.5x daily fee per day over 24h)
//   168h+  → Deposit forfeiture via Stripe capture + trust level demotion

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

// Overdue tier thresholds in hours
const GRACE_PERIOD_HOURS = 24
const WARNING_HOURS = 48
const FORFEIT_HOURS = 168 // 7 days

// Penalty multiplier: per day over 24h, charge 1.5x the daily fee
const PENALTY_MULTIPLIER = 1.5

interface OverdueBooking {
  id: string
  borrower_id: string
  lender_id: string
  post_id: string | null
  end_date: string
  daily_fee: number
  deposit_amount: number | null
  stripe_deposit_intent_id: string | null
  deposit_status: string | null
  overdue_notified_at: string | null
  overdue_warning_at: string | null
  overdue_penalty_at: string | null
  overdue_forfeit_at: string | null
}

type OverdueTier = 'grace' | 'warning' | 'penalty' | 'forfeit'

function classifyOverdueTier(hoursOverdue: number): OverdueTier {
  if (hoursOverdue >= FORFEIT_HOURS) return 'forfeit'
  if (hoursOverdue >= WARNING_HOURS) return 'penalty'
  if (hoursOverdue >= GRACE_PERIOD_HOURS) return 'warning'
  return 'grace'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const stripeSecretKey = getEnvOrThrow('STRIPE_SECRET_KEY')

    // ── Auth: require cron secret or admin JWT ─────────────────
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')

    if (!expectedSecret || cronSecret !== expectedSecret) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authSupabase = createClient(supabaseUrl, supabaseServiceKey)
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userError } = await authSupabase.auth.getUser(token)
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: profile } = await authSupabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-04-10' })
    const now = new Date()
    const nowIso = now.toISOString()

    // ── Query overdue bookings ─────────────────────────────────
    // status IN ('active', 'confirmed', 'paid'), end_date < now, not yet returned
    const { data: overdueBookings, error: queryError } = await supabase
      .from('rental_bookings')
      .select(
        'id, borrower_id, lender_id, post_id, end_date, daily_fee, ' +
        'deposit_amount, stripe_deposit_intent_id, deposit_status, ' +
        'overdue_notified_at, overdue_warning_at, overdue_penalty_at, overdue_forfeit_at'
      )
      .in('status', ['active', 'confirmed', 'paid'])
      .lt('end_date', nowIso)
      .is('actual_return_date', null)

    if (queryError) {
      console.error('[check-overdue-rentals] Query failed:', queryError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to query overdue bookings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!overdueBookings?.length) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'No overdue bookings found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Process each overdue booking ───────────────────────────
    const stats = { grace: 0, warning: 0, penalty: 0, forfeit: 0, errors: 0 }

    for (const booking of overdueBookings as OverdueBooking[]) {
      try {
        const endDate = new Date(booking.end_date)
        const msOverdue = now.getTime() - endDate.getTime()
        const hoursOverdue = msOverdue / (1000 * 60 * 60)
        const tier = classifyOverdueTier(hoursOverdue)

        // Skip if this tier's notification has already been sent
        if (tier === 'grace' && booking.overdue_notified_at) continue
        if (tier === 'warning' && booking.overdue_warning_at) continue
        if (tier === 'penalty' && booking.overdue_penalty_at) continue
        if (tier === 'forfeit' && booking.overdue_forfeit_at) continue

        switch (tier) {
          case 'grace': {
            // 0-24h: Send reminder to borrower
            // Conditional update: only set overdue_notified_at if still NULL
            // to prevent concurrent runs from double-processing
            const { data: graceUpdated } = await (supabase.from('rental_bookings') as any)
              .update({ overdue_notified_at: nowIso })
              .eq('id', booking.id)
              .is('overdue_notified_at', null)
              .select('id')

            if (!graceUpdated?.length) break // Another run already processed this

            await (supabase.from('notifications') as any).insert({
              user_id: booking.borrower_id,
              type: 'rental_overdue_reminder',
              title: 'Palautusaika umpeutunut',
              body: 'Lainasi palautusaika on umpeutunut. Palauta tavara mahdollisimman pian.',
              link_type: 'rental_bookings',
              link_id: booking.id,
            })

            stats.grace++
            break
          }

          case 'warning': {
            // 24-48h: Warning to both borrower and lender
            // Conditional update: only set overdue_warning_at if still NULL
            const { data: warnUpdated } = await (supabase.from('rental_bookings') as any)
              .update({
                overdue_notified_at: booking.overdue_notified_at || nowIso,
                overdue_warning_at: nowIso,
              })
              .eq('id', booking.id)
              .is('overdue_warning_at', null)
              .select('id')

            if (!warnUpdated?.length) break // Another run already processed this

            const warnNotifications = [
              {
                user_id: booking.borrower_id,
                type: 'rental_overdue_warning',
                title: 'Laina myöhässä yli 24h',
                body: 'Lainasi on yli 24 tuntia myöhässä. Viivästysmaksut alkavat kertyä pian.',
                link_type: 'rental_bookings',
                link_id: booking.id,
              },
              {
                user_id: booking.lender_id,
                type: 'rental_overdue_warning',
                title: 'Lainaajasi on myöhässä',
                body: 'Lainaajasi ei ole palauttanut tavaraa. Myöhässä yli 24 tuntia.',
                link_type: 'rental_bookings',
                link_id: booking.id,
              },
            ]

            await (supabase.from('notifications') as any).insert(warnNotifications)

            stats.warning++
            break
          }

          case 'penalty': {
            // 48h+: Calculate and apply penalty
            const hoursOver24 = hoursOverdue - GRACE_PERIOD_HOURS
            const daysOver24 = Math.ceil(hoursOver24 / 24)
            const penaltyAmount = daysOver24 * (booking.daily_fee || 0) * PENALTY_MULTIPLIER

            // Conditional update: only set overdue_penalty_at if still NULL
            const { data: penaltyUpdated } = await (supabase.from('rental_bookings') as any)
              .update({
                penalty_amount: penaltyAmount,
                overdue_notified_at: booking.overdue_notified_at || nowIso,
                overdue_warning_at: booking.overdue_warning_at || nowIso,
                overdue_penalty_at: nowIso,
              })
              .eq('id', booking.id)
              .is('overdue_penalty_at', null)
              .select('id')

            if (!penaltyUpdated?.length) break // Another run already processed this

            const penaltyNotifications = [
              {
                user_id: booking.borrower_id,
                type: 'rental_overdue_penalty',
                title: 'Viivästysmaksu lisätty',
                body: `Lainasi on ${daysOver24} päivää myöhässä. Viivästysmaksu: ${penaltyAmount.toFixed(2)}€`,
                link_type: 'rental_bookings',
                link_id: booking.id,
              },
              {
                user_id: booking.lender_id,
                type: 'rental_overdue_penalty',
                title: 'Viivästysmaksu kirjattu',
                body: `Lainaajan viivästysmaksu (${penaltyAmount.toFixed(2)}€) on kirjattu.`,
                link_type: 'rental_bookings',
                link_id: booking.id,
              },
            ]

            await (supabase.from('notifications') as any).insert(penaltyNotifications)

            stats.penalty++
            break
          }

          case 'forfeit': {
            // 168h+ (7 days): Forfeit deposit, capture Stripe hold, demote trust
            // Conditional update: only set overdue_forfeit_at if still NULL
            const { data: forfeitUpdated } = await (supabase.from('rental_bookings') as any)
              .update({ overdue_forfeit_at: nowIso })
              .eq('id', booking.id)
              .is('overdue_forfeit_at', null)
              .select('id')

            if (!forfeitUpdated?.length) break // Another run already processed this

            const hoursOver24 = hoursOverdue - GRACE_PERIOD_HOURS
            const daysOver24 = Math.ceil(hoursOver24 / 24)
            const penaltyAmount = daysOver24 * (booking.daily_fee || 0) * PENALTY_MULTIPLIER

            // ── Capture Stripe deposit if authorized ──────────────
            let depositCaptured = false
            if (
              booking.stripe_deposit_intent_id &&
              booking.deposit_status !== 'forfeited' &&
              booking.deposit_status !== 'captured'
            ) {
              try {
                const paymentIntent = await stripe.paymentIntents.capture(
                  booking.stripe_deposit_intent_id,
                )
                if (paymentIntent.status === 'succeeded') {
                  depositCaptured = true
                  console.log(
                    `[check-overdue-rentals] Deposit captured: ${booking.stripe_deposit_intent_id} ` +
                    `(${(paymentIntent.amount / 100).toFixed(2)}€) for booking ${booking.id}`,
                  )
                }
              } catch (stripeErr: any) {
                // Capture may fail if authorization expired or was already captured
                console.error(
                  `[check-overdue-rentals] Stripe capture failed for ${booking.stripe_deposit_intent_id}:`,
                  stripeErr.message,
                )
                // Still proceed with DB updates — the deposit may need manual handling
              }
            }

            // ── Demote borrower trust level ───────────────────────
            // GREATEST(1, trust_level - 1) — never below 1
            const { data: borrowerProfile } = await supabase
              .from('profiles')
              .select('trust_level')
              .eq('id', booking.borrower_id)
              .single()

            if (borrowerProfile) {
              const newTrustLevel = Math.max(1, (borrowerProfile.trust_level ?? 3) - 1)
              await (supabase.from('profiles') as any)
                .update({ trust_level: newTrustLevel })
                .eq('id', booking.borrower_id)
            }

            // ── Send final notifications ──────────────────────────
            const depositNote = depositCaptured
              ? ` Vakuusmaksu (${((booking.deposit_amount ?? 0)).toFixed(2)}€) on pidätetty.`
              : booking.deposit_amount
                ? ' Vakuusmaksun pidätys käsitellään erikseen.'
                : ''

            const forfeitNotifications = [
              {
                user_id: booking.borrower_id,
                type: 'rental_overdue_forfeit',
                title: 'Vakuusmaksu pidätetty — luottotaso laskettu',
                body:
                  `Lainasi on yli 7 päivää myöhässä.${depositNote} ` +
                  `Viivästysmaksu: ${penaltyAmount.toFixed(2)}€. Luottotasosi on laskettu.`,
                link_type: 'rental_bookings',
                link_id: booking.id,
              },
              {
                user_id: booking.lender_id,
                type: 'rental_overdue_forfeit',
                title: depositCaptured ? 'Vakuusmaksu hyvitetty' : 'Laina palautumatta — käsitellään',
                body:
                  `Lainaajasi ei palauttanut tavaraa 7 päivän kuluessa.${depositNote} ` +
                  `Viivästysmaksu: ${penaltyAmount.toFixed(2)}€.`,
                link_type: 'rental_bookings',
                link_id: booking.id,
              },
            ]

            await (supabase.from('notifications') as any).insert(forfeitNotifications)

            // ── Update remaining booking fields ─────────────────────
            await (supabase.from('rental_bookings') as any)
              .update({
                penalty_amount: penaltyAmount,
                deposit_status: depositCaptured ? 'forfeited' : (booking.deposit_status ?? 'pending_forfeit'),
                status: 'overdue_forfeit',
                overdue_notified_at: booking.overdue_notified_at || nowIso,
                overdue_warning_at: booking.overdue_warning_at || nowIso,
                overdue_penalty_at: booking.overdue_penalty_at || nowIso,
              })
              .eq('id', booking.id)

            stats.forfeit++
            break
          }
        }
      } catch (bookingErr: any) {
        console.error(
          `[check-overdue-rentals] Error processing booking ${booking.id}:`,
          bookingErr.message,
        )
        stats.errors++
      }
    }

    // ── Log the run ──────────────────────────────────────────────
    const summary = {
      total: overdueBookings.length,
      ...stats,
    }

    console.log(
      `[check-overdue-rentals] Processed ${summary.total} overdue bookings: ` +
      `${stats.grace} grace, ${stats.warning} warning, ${stats.penalty} penalty, ` +
      `${stats.forfeit} forfeit, ${stats.errors} errors`,
    )

    try {
      await (supabase.from('edge_function_errors') as any).insert({
        function_name: 'check-overdue-rentals',
        error_message: `Overdue check completed: ${JSON.stringify(summary)}`,
        context: summary,
      })
    } catch {} // Non-critical

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[check-overdue-rentals]', err.message)

    // Try to log the error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      await (supabase.from('edge_function_errors') as any).insert({
        function_name: 'check-overdue-rentals',
        error_message: err.message,
        error_stack: err.stack,
      })
    } catch {} // Best effort

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

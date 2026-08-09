import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { initiateStkPush } from '../_shared/daraja.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return `254${digits}`
  throw new Error('Phone must be a valid Safaricom M-Pesa number (e.g. 07XX XXX XXX).')
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { experienceId?: unknown; name?: unknown; email?: unknown; phone?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  if (typeof body.experienceId !== 'string') return Response.json({ error: 'experienceId required' }, { status: 400, headers: CORS })
  if (typeof body.email !== 'string' || !body.email.includes('@')) return Response.json({ error: 'Valid email required' }, { status: 400, headers: CORS })

  const guestName = typeof body.name === 'string' ? body.name.trim() || null : null
  const guestEmail = body.email.trim().toLowerCase()

  // 1. Fetch experience + gym
  const { data: experience, error: expErr } = await admin
    .from('experiences')
    .select('*, gyms!gym_id(*)')
    .eq('id', body.experienceId)
    .single()

  if (expErr || !experience) return Response.json({ error: 'Experience not found' }, { status: 404, headers: CORS })
  if ((experience.spots_left ?? 0) <= 0) return Response.json({ error: 'No spots available' }, { status: 409, headers: CORS })

  const gym = Array.isArray(experience.gyms) ? experience.gyms[0] : experience.gyms
  const experiencePrice = Number(experience.price_kes)
  const cutoffHours: number | null = experience.cancellation_cutoff_hours ?? null
  const expDepositPct: number | null = experience.deposit_pct ?? null
  const isFullPayment = cutoffHours === 0 && !expDepositPct
  const depositPct: number = isFullPayment ? 100 : Number(expDepositPct ?? gym?.deposit_pct ?? 30)
  const depositAmount = isFullPayment ? experiencePrice : Math.round(experiencePrice * depositPct / 100)
  const remainderAmount = experiencePrice - depositAmount

  // Platform-funded discount: partner payout stays based on the full price
  // above; only the amount actually collected from the customer is reduced.
  const discountKes = Math.min(Number(experience.discount_kes ?? 0), depositAmount)
  const customerAmount = depositAmount - discountKes
  const isFree = customerAmount <= 0

  let phone = '254000000000'
  let phoneProvided = false
  if (!isFree) {
    if (typeof body.phone !== 'string') return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })
    try { phone = normalisePhone(body.phone); phoneProvided = true }
    catch (e: any) { return Response.json({ error: e.message }, { status: 400, headers: CORS }) }
  } else if (typeof body.phone === 'string' && body.phone.length > 6) {
    try { phone = normalisePhone(body.phone); phoneProvided = true } catch { /* optional for free bookings */ }
  }

  // 2. Prevent duplicate active guest bookings
  const { data: existing } = await admin
    .from('experience_bookings')
    .select('id, status')
    .eq('email', guestEmail)
    .eq('experience_id', body.experienceId)
    .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
    .maybeSingle()

  if (existing) {
    if (existing.status === 'pending_payment') {
      await admin.from('experience_bookings').update({
        status: 'cancelled',
        cancellation_reason: 'retried_by_user',
        cancelled_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      return Response.json(
        { error: 'A booking already exists for this email', bookingId: existing.id },
        { status: 409, headers: CORS }
      )
    }
  }

  // 3. Create booking record
  const confirmationCode = generateCode()

  const { data: booking, error: bookingErr } = await admin
    .from('experience_bookings')
    .insert({
      experience_id: body.experienceId,
      gym_id: experience.gym_id,
      email: guestEmail,
      guest_name: guestName,
      guest_phone: phoneProvided ? phone : null,
      status: isFree ? 'confirmed' : 'pending_payment',
      confirmation_code: confirmationCode,
      session_price: experiencePrice,
      deposit_pct: depositPct,
      deposit_amount: depositAmount,
      remainder_amount: remainderAmount,
      discount_kes: discountKes,
      payment_phone: phoneProvided ? phone : null,
    })
    .select()
    .single()

  if (bookingErr || !booking) {
    console.error('guest experience booking insert error:', bookingErr)
    return Response.json({ error: 'Failed to create booking' }, { status: 500, headers: CORS })
  }

  const qrPayload = `acp:exp-booking:${booking.id}:${confirmationCode}`
  await admin.from('experience_bookings').update({ qr_payload: qrPayload }).eq('id', booking.id)

  // Free (or fully discounted) experience — booked immediately, no payment step needed
  if (isFree) {
    return Response.json({
      bookingId: booking.id,
      confirmationCode,
      qrPayload,
      experiencePrice,
      depositAmount: 0,
      remainderAmount,
      confirmed: true,
    }, { status: 201, headers: CORS })
  }

  // 4. Initiate M-Pesa STK push directly via Daraja
  let stkResult: { checkoutRequestId: string; merchantRequestId: string }
  try {
    stkResult = await initiateStkPush({
      phone,
      amount: customerAmount,
      accountRef: booking.id.slice(0, 12),
      description: 'Booking deposit',
    })
  } catch (e: any) {
    await admin.from('experience_bookings').update({
      status: 'cancelled',
      cancellation_reason: 'stk_push_failed',
      cancelled_at: new Date().toISOString(),
    }).eq('id', booking.id)
    return Response.json({ error: e.message ?? 'Payment initiation failed' }, { status: 502, headers: CORS })
  }

  // 5. Record payment attempt
  await admin.from('booking_payments').insert({
    booking_id: null,
    checkout_request_id: stkResult.checkoutRequestId,
    merchant_request_id: stkResult.merchantRequestId,
    phone,
    amount: customerAmount,
    payment_type: 'deposit',
    status: 'pending',
    metadata: { experience_booking_id: booking.id },
  })

  return Response.json({
    bookingId: booking.id,
    confirmationCode,
    depositAmount: customerAmount,
    remainderAmount,
    checkoutRequestId: stkResult.checkoutRequestId,
  }, { status: 201, headers: CORS })
})

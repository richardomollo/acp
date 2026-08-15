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
  throw new Error('Phone number must be a valid Safaricom M-Pesa number (e.g. 07XX XXX XXX).')
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { sessionId?: unknown; phone?: unknown; manual?: unknown; platform?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  const isManual = body.manual === true
  if (typeof body.sessionId !== 'string') return Response.json({ error: 'sessionId required' }, { status: 400, headers: CORS })

  // 1. Fetch session + gym
  const { data: session, error: sessionErr } = await admin
    .from('sessions')
    .select('*, gyms!gym_id(*)')
    .eq('id', body.sessionId)
    .single()

  if (sessionErr || !session) return Response.json({ error: 'Session not found' }, { status: 404, headers: CORS })
  if ((session.spots_left ?? 0) <= 0) return Response.json({ error: 'No spots available' }, { status: 409, headers: CORS })

  const gym = Array.isArray(session.gyms) ? session.gyms[0] : session.gyms
  const depositPct: number = gym?.deposit_pct ?? 30
  const sessionPrice = Number(session.drop_in_price) || 0
  const depositAmount = Math.round(sessionPrice * depositPct / 100)
  const remainderAmount = sessionPrice - depositAmount
  const isFree = depositAmount <= 0

  let phone = '254000000000'
  if (!isFree && !isManual) {
    if (typeof body.phone !== 'string') return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })
    try { phone = normalisePhone(body.phone) }
    catch (e: any) { return Response.json({ error: e.message }, { status: 400, headers: CORS }) }
  } else if (typeof body.phone === 'string' && body.phone.length > 6) {
    try { phone = normalisePhone(body.phone) } catch { /* use default */ }
  }

  // 2. Prevent duplicate active bookings
  const { data: existing } = await admin
    .from('bookings')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('session_id', body.sessionId)
    .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
    .maybeSingle()

  if (existing) {
    if (existing.status === 'pending_payment') {
      // Stale unpaid booking — cancel it so this attempt can proceed
      await admin.from('bookings').update({
        status: 'cancelled',
        cancellation_reason: 'retried_by_user',
        cancelled_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      return Response.json(
        { error: 'You have already booked this session', bookingId: existing.id },
        { status: 409, headers: CORS }
      )
    }
  }

  // 3. Create booking in pending_payment state
  const sessionDate = session.date || new Date(session.start_time).toISOString().split('T')[0]
  const sessionTime = session.time || new Date(session.start_time).toTimeString().split(' ')[0]
  const confirmationCode = generateCode()

  const { data: booking, error: bookingErr } = await admin
    .from('bookings')
    .insert({
      session_id: body.sessionId,
      user_id: user.id,
      gym_id: session.gym_id,
      booking_date: sessionDate,
      booking_time: sessionTime,
      status: isFree ? 'confirmed' : 'pending_payment',
      confirmation_code: confirmationCode,
      session_price: sessionPrice,
      deposit_pct: depositPct,
      deposit_amount: depositAmount,
      remainder_amount: remainderAmount,
      payment_phone: isFree ? null : phone,
      platform: typeof body.platform === 'string' ? body.platform : null,
    })
    .select()
    .single()

  if (bookingErr || !booking) {
    console.error('booking insert error:', bookingErr)
    return Response.json({ error: bookingErr?.message ?? 'Failed to create booking' }, { status: 500, headers: CORS })
  }

  const qrPayload = `acp:booking:${booking.id}:${confirmationCode}`
  await admin.from('bookings').update({ qr_payload: qrPayload }).eq('id', booking.id)

  // Free session — booked immediately, no payment step needed
  if (isFree) {
    return Response.json({
      bookingId: booking.id,
      confirmationCode,
      qrPayload,
      sessionPrice,
      depositAmount: 0,
      remainderAmount: 0,
      confirmed: true,
    }, { status: 201, headers: CORS })
  }

  // 4. Manual Pay Bill — skip STK push, return booking details for user to pay via PayBill
  if (isManual) {
    return Response.json({
      bookingId: booking.id,
      confirmationCode,
      qrPayload,
      sessionPrice,
      depositAmount,
      remainderAmount,
      manual: true,
    }, { status: 201, headers: CORS })
  }

  // 4. Initiate M-Pesa STK push directly via Daraja
  let stkResult: { checkoutRequestId: string; merchantRequestId: string }
  try {
    stkResult = await initiateStkPush({
      phone,
      amount: depositAmount,
      accountRef: booking.id.slice(0, 12),
      description: 'Booking deposit',
    })
  } catch (e: any) {
    await admin.from('bookings').update({
      status: 'cancelled',
      cancellation_reason: 'stk_push_failed',
      cancelled_at: new Date().toISOString(),
    }).eq('id', booking.id)
    return Response.json({ error: e.message ?? 'Payment initiation failed' }, { status: 502, headers: CORS })
  }

  // 5. Record payment attempt
  await admin.from('booking_payments').insert({
    booking_id: booking.id,
    checkout_request_id: stkResult.checkoutRequestId,
    merchant_request_id: stkResult.merchantRequestId,
    phone,
    amount: depositAmount,
    payment_type: 'deposit',
    status: 'pending',
  })

  return Response.json({
    bookingId: booking.id,
    confirmationCode,
    qrPayload,
    sessionPrice,
    depositAmount,
    remainderAmount,
    checkoutRequestId: stkResult.checkoutRequestId,
  }, { status: 201, headers: CORS })
})

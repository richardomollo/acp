import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  let body: {
    sessionId?: unknown; experienceId?: unknown; balanceBookingId?: unknown;
    ptOfferingId?: unknown; ptId?: unknown; ptDate?: unknown; ptTime?: unknown;
    locationType?: unknown; clientAddress?: unknown;
    confirmationCode?: unknown; receipt?: unknown; phone?: unknown
  }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  if (typeof body.confirmationCode !== 'string') return Response.json({ error: 'confirmationCode required' }, { status: 400, headers: CORS })
  if (typeof body.receipt !== 'string' || body.receipt.trim().length < 6) {
    return Response.json({ error: 'Enter a valid M-Pesa receipt code (e.g. QHK1KUZS2T)' }, { status: 400, headers: CORS })
  }

  const confirmationCode = body.confirmationCode.trim().toUpperCase()
  const receipt = body.receipt.trim().toUpperCase()
  const userPhone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  const now = new Date().toISOString()

  // Validate receipt against real Safaricom C2B transactions
  const { data: c2bTx, error: c2bLookupErr } = await admin
    .from('mpesa_c2b_transactions')
    .select('id, trans_amount, bill_ref_number, used_at, msisdn')
    .eq('trans_id', receipt)
    .maybeSingle()

  if (c2bLookupErr) return Response.json({ error: 'Could not verify payment. Please try again.' }, { status: 500, headers: CORS })
  if (!c2bTx) return Response.json({ error: 'Receipt code not found. Make sure you entered the correct M-Pesa confirmation code.' }, { status: 422, headers: CORS })
  if (c2bTx.used_at) return Response.json({ error: 'This receipt has already been used for another booking.' }, { status: 422, headers: CORS })
  if (c2bTx.bill_ref_number !== confirmationCode) {
    return Response.json({ error: 'Receipt does not match this booking reference. Make sure you used the correct Account No. when paying.' }, { status: 422, headers: CORS })
  }

  // Balance payment — just confirm an existing booking
  if (typeof body.balanceBookingId === 'string') {
    const balanceBookingId = body.balanceBookingId.trim()

    const { data: booking } = await admin
      .from('bookings')
      .select('id, user_id, remainder_amount, status')
      .eq('id', balanceBookingId)
      .maybeSingle()

    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
    if (booking.user_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403, headers: CORS })

    const expected = Number(booking.remainder_amount ?? 0)
    if (Number(c2bTx.trans_amount) < expected) {
      return Response.json({ error: `Insufficient payment. Expected KES ${expected}, received KES ${c2bTx.trans_amount}.` }, { status: 422, headers: CORS })
    }

    const { error: updateErr } = await admin
      .from('bookings').update({ status: 'confirmed', updated_at: now }).eq('id', balanceBookingId)
    if (updateErr) return Response.json({ error: updateErr.message }, { status: 500, headers: CORS })

    await admin.from('mpesa_c2b_transactions')
      .update({ used_at: now, booking_id: balanceBookingId }).eq('id', c2bTx.id)

    return Response.json({ success: true }, { status: 200, headers: CORS })
  }

  // PT booking
  if (typeof body.ptOfferingId === 'string') {
    const ptOfferingId = body.ptOfferingId.trim()
    const ptId = typeof body.ptId === 'string' ? body.ptId.trim() : null
    const ptDate = typeof body.ptDate === 'string' ? body.ptDate.trim() : null
    const ptTime = typeof body.ptTime === 'string' ? body.ptTime.trim() : null
    const locationType = typeof body.locationType === 'string' ? body.locationType.trim() : null
    const clientAddress = typeof body.clientAddress === 'string' ? body.clientAddress.trim() : null

    if (!ptId || !ptDate || !ptTime) {
      return Response.json({ error: 'ptId, ptDate, and ptTime are required' }, { status: 400, headers: CORS })
    }

    const { data: offering, error: offeringErr } = await admin
      .from('pt_offerings').select('id, price_kes, title').eq('id', ptOfferingId).single()
    if (offeringErr || !offering) return Response.json({ error: 'Offering not found' }, { status: 404, headers: CORS })

    const price = Number(offering.price_kes ?? 0)
    if (price > 0 && Number(c2bTx.trans_amount) < price) {
      return Response.json({ error: `Insufficient payment. Expected KES ${price}, received KES ${c2bTx.trans_amount}.` }, { status: 422, headers: CORS })
    }

    const { data: existing } = await admin
      .from('pt_bookings').select('id')
      .eq('user_id', user.id).eq('offering_id', ptOfferingId)
      .eq('scheduled_date', ptDate).eq('scheduled_time', ptTime)
      .in('status', ['confirmed', 'completed']).maybeSingle()
    if (existing) return Response.json({ error: 'You have already booked this slot' }, { status: 409, headers: CORS })

    const { data: ptBooking, error: bookErr } = await admin.from('pt_bookings').insert({
      pt_id: ptId, user_id: user.id, offering_id: ptOfferingId,
      scheduled_date: ptDate, scheduled_time: ptTime,
      location_type: locationType, location_address: clientAddress,
      payment_method: 'mpesa', amount_kes: price,
      payment_status: 'paid', mpesa_reference: receipt,
      status: 'confirmed',
    }).select().single()
    if (bookErr || !ptBooking) return Response.json({ error: bookErr?.message ?? 'Failed to create booking' }, { status: 500, headers: CORS })

    await admin.from('mpesa_c2b_transactions')
      .update({ used_at: now, pt_booking_id: ptBooking.id }).eq('id', c2bTx.id)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    fetch(`${supabaseUrl}/functions/v1/notify-pt-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
      body: JSON.stringify({ record: ptBooking, phone: userPhone }),
    }).catch(e => console.error('notify-pt-booking error:', e))

    return Response.json({ bookingId: ptBooking.id, confirmationCode }, { status: 201, headers: CORS })
  }

  const isExperience = typeof body.experienceId === 'string'
  const itemId = isExperience ? body.experienceId as string : body.sessionId as string
  if (!itemId) return Response.json({ error: 'sessionId or experienceId required' }, { status: 400, headers: CORS })

  if (isExperience) {
    const { data: experience, error: expErr } = await admin
      .from('experiences').select('*, gyms!gym_id(*)').eq('id', itemId).single()
    if (expErr || !experience) return Response.json({ error: 'Experience not found' }, { status: 404, headers: CORS })
    if ((experience.spots_left ?? 0) <= 0) return Response.json({ error: 'No spots available' }, { status: 409, headers: CORS })

    const { data: existing } = await admin.from('experience_bookings').select('id, status')
      .eq('user_id', user.id).eq('experience_id', itemId)
      .in('status', ['deposit_paid', 'confirmed', 'checked_in']).maybeSingle()
    if (existing) return Response.json({ error: 'You have already booked this experience' }, { status: 409, headers: CORS })

    const gym = Array.isArray(experience.gyms) ? experience.gyms[0] : experience.gyms
    const depositPct: number = gym?.deposit_pct ?? 30
    const price = Number(experience.price_kes)
    const depositAmount = Math.round(price * depositPct / 100)
    const remainderAmount = price - depositAmount

    // Platform-funded discount: partner payout stays based on the full
    // deposit_amount above; only the amount the customer is expected to
    // actually pay via Paybill is reduced.
    const discountKes = Math.min(Number(experience.discount_kes ?? 0), depositAmount)
    const customerAmount = depositAmount - discountKes

    const { data: booking, error: bookErr } = await admin.from('experience_bookings').insert({
      experience_id: itemId, user_id: user.id, gym_id: experience.gym_id,
      email: user.email, status: 'confirmed',
      confirmation_code: confirmationCode,
      session_price: price, deposit_pct: depositPct,
      deposit_amount: depositAmount, remainder_amount: remainderAmount,
      discount_kes: discountKes,
      payment_phone: userPhone, payment_completed_at: now, updated_at: now,
    }).select().single()
    if (bookErr || !booking) return Response.json({ error: bookErr?.message ?? 'Failed to create booking' }, { status: 500, headers: CORS })

    const qrPayload = `acp:exp-booking:${booking.id}:${confirmationCode}`
    await admin.from('experience_bookings').update({ qr_payload: qrPayload }).eq('id', booking.id)

    if (Number(c2bTx.trans_amount) < customerAmount) {
      return Response.json({ error: `Insufficient payment. Expected KES ${customerAmount}, received KES ${c2bTx.trans_amount}.` }, { status: 422, headers: CORS })
    }

    if (experience.spots_left > 0) {
      await admin.from('experiences').update({ spots_left: experience.spots_left - 1 }).eq('id', itemId)
    }

    await admin.from('mpesa_c2b_transactions')
      .update({ used_at: now, experience_booking_id: booking.id }).eq('id', c2bTx.id)

    const supabaseUrlExp = Deno.env.get('SUPABASE_URL')!
    const serviceKeyExp = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    fetch(`${supabaseUrlExp}/functions/v1/notify-experience-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKeyExp}`, 'apikey': serviceKeyExp },
      body: JSON.stringify({ record: booking }),
    }).catch(e => console.error('notify-experience-booking error:', e))

    return Response.json({ bookingId: booking.id, confirmationCode, depositAmount: customerAmount, remainderAmount }, { status: 201, headers: CORS })
  }

  // Session booking
  const { data: session, error: sessionErr } = await admin
    .from('sessions').select('*, gyms!gym_id(*)').eq('id', itemId).single()
  if (sessionErr || !session) return Response.json({ error: 'Session not found' }, { status: 404, headers: CORS })
  if ((session.spots_left ?? 0) <= 0) return Response.json({ error: 'No spots available' }, { status: 409, headers: CORS })

  const { data: existing } = await admin.from('bookings').select('id, status')
    .eq('user_id', user.id).eq('session_id', itemId)
    .in('status', ['deposit_paid', 'confirmed', 'checked_in']).maybeSingle()
  if (existing) return Response.json({ error: 'You have already booked this session' }, { status: 409, headers: CORS })

  const gym = Array.isArray(session.gyms) ? session.gyms[0] : session.gyms
  const depositPct: number = gym?.deposit_pct ?? 30
  const sessionPrice = Number(session.drop_in_price) || 0
  const depositAmount = Math.round(sessionPrice * depositPct / 100)
  const remainderAmount = sessionPrice - depositAmount

  if (Number(c2bTx.trans_amount) < depositAmount) {
    return Response.json({ error: `Insufficient payment. Expected KES ${depositAmount}, received KES ${c2bTx.trans_amount}.` }, { status: 422, headers: CORS })
  }
  const sessionDate = session.date || new Date(session.start_time).toISOString().split('T')[0]
  const sessionTime = session.time || new Date(session.start_time).toTimeString().split(' ')[0]

  const { data: booking, error: bookErr } = await admin.from('bookings').insert({
    session_id: itemId, user_id: user.id, gym_id: session.gym_id,
    booking_date: sessionDate, booking_time: sessionTime,
    status: 'deposit_paid',
    confirmation_code: confirmationCode,
    session_price: sessionPrice,
    deposit_pct: depositPct, deposit_amount: depositAmount, remainder_amount: remainderAmount,
    payment_phone: userPhone, deposit_paid_at: now, deposit_payment_id: receipt, updated_at: now,
  }).select().single()
  if (bookErr || !booking) return Response.json({ error: bookErr?.message ?? 'Failed to create booking' }, { status: 500, headers: CORS })

  const qrPayload = `acp:booking:${booking.id}:${confirmationCode}`
  await admin.from('bookings').update({ qr_payload: qrPayload }).eq('id', booking.id)

  if (session.spots_left > 0) {
    await admin.from('sessions').update({ spots_left: session.spots_left - 1 }).eq('id', itemId)
  }

  await admin.from('mpesa_c2b_transactions')
    .update({ used_at: now, booking_id: booking.id }).eq('id', c2bTx.id)

  // Send WhatsApp notification + confirmation email
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  fetch(`${supabaseUrl}/functions/v1/notify-booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
    body: JSON.stringify({ record: booking }),
  }).catch(e => console.error('notify-booking error:', e))

  await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    body: JSON.stringify({
      type: 'guest_booking_confirmation',
      data: {
        email: user.email,
        customerName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'there',
        sessionName: session.name ?? 'Session',
        sessionDate, sessionTime,
        venueName: gym?.name ?? '',
        venueLocation: gym?.location ?? '',
        confirmationCode,
        remainderAmount,
        bookingId: booking.id,
      },
    }),
  }).catch(e => console.error('send-email error:', e))

  return Response.json({ bookingId: booking.id, confirmationCode, depositAmount, remainderAmount }, { status: 201, headers: CORS })
})

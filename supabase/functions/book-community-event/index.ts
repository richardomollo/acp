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

// Paid community events only — free and partner_session RSVPs are handled by
// a plain client-side insert under RLS (see 20260812000001_communities_schema.sql).
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
  if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: { eventId?: unknown; phone?: unknown; platform?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }
  if (typeof body.eventId !== 'string') return Response.json({ error: 'eventId required' }, { status: 400, headers: CORS })
  if (typeof body.phone !== 'string') return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })

  const { data: event, error: eventErr } = await admin
    .from('community_events')
    .select('id, title, event_type, price_kes, capacity, status, community_id')
    .eq('id', body.eventId)
    .single()

  if (eventErr || !event) return Response.json({ error: 'Event not found' }, { status: 404, headers: CORS })
  if (event.event_type !== 'paid') return Response.json({ error: 'This event is not paid — RSVP directly instead' }, { status: 400, headers: CORS })
  if (event.status !== 'active') return Response.json({ error: 'This event has been cancelled' }, { status: 409, headers: CORS })

  const price = Number(event.price_kes)

  let phone: string
  try { phone = normalisePhone(body.phone) }
  catch (e: any) { return Response.json({ error: e.message }, { status: 400, headers: CORS }) }

  // Prevent duplicate active RSVPs
  const { data: existing } = await admin
    .from('community_event_attendees')
    .select('id, status')
    .eq('event_id', body.eventId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'pending_payment') {
      await admin.from('community_event_attendees').delete().eq('id', existing.id)
    } else {
      return Response.json({ error: 'You have already booked this event', attendeeId: existing.id }, { status: 409, headers: CORS })
    }
  }

  if (event.capacity != null) {
    const { count: goingCount } = await admin
      .from('community_event_attendees').select('id', { count: 'exact', head: true })
      .eq('event_id', body.eventId).eq('status', 'going')
    if ((goingCount ?? 0) >= event.capacity) {
      return Response.json({ error: 'This event is full' }, { status: 409, headers: CORS })
    }
  }

  const confirmationCode = generateCode()
  const { data: attendee, error: insertErr } = await admin
    .from('community_event_attendees')
    .insert({
      event_id: body.eventId,
      user_id: user.id,
      status: 'pending_payment',
      confirmation_code: confirmationCode,
      session_price: price,
      deposit_pct: 100,
      deposit_amount: price,
      remainder_amount: 0,
      payment_phone: phone,
      platform: typeof body.platform === 'string' ? body.platform : null,
    })
    .select()
    .single()

  if (insertErr || !attendee) {
    console.error('community_event_attendees insert error:', insertErr)
    return Response.json({ error: 'Failed to create RSVP' }, { status: 500, headers: CORS })
  }

  const qrPayload = `acp:community-event:${attendee.id}:${confirmationCode}`
  await admin.from('community_event_attendees').update({ qr_payload: qrPayload }).eq('id', attendee.id)

  let stkResult: { checkoutRequestId: string; merchantRequestId: string }
  try {
    stkResult = await initiateStkPush({
      phone,
      amount: price,
      accountRef: attendee.id.slice(0, 12),
      description: event.title.slice(0, 12),
    })
  } catch (e: any) {
    await admin.from('community_event_attendees').delete().eq('id', attendee.id)
    return Response.json({ error: e.message ?? 'Payment initiation failed' }, { status: 502, headers: CORS })
  }

  await admin.from('booking_payments').insert({
    booking_id: null,
    checkout_request_id: stkResult.checkoutRequestId,
    merchant_request_id: stkResult.merchantRequestId,
    phone,
    amount: price,
    payment_type: 'deposit',
    status: 'pending',
    metadata: { community_event_attendee_id: attendee.id },
  })

  return Response.json({
    attendeeId: attendee.id,
    confirmationCode,
    qrPayload,
    price,
    checkoutRequestId: stkResult.checkoutRequestId,
  }, { status: 201, headers: CORS })
})

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
  if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { bookingId?: unknown; bookingType?: unknown; checkoutRequestId?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  if (typeof body.bookingId !== 'string') return Response.json({ error: 'bookingId required' }, { status: 400, headers: CORS })

  // Balance payment polling — check booking_payments directly so we don't confuse
  // deposit_paid (already paid deposit) with "payment succeeded just now"
  if (typeof body.checkoutRequestId === 'string') {
    const { data: payment } = await admin
      .from('booking_payments')
      .select('status, cancellation_reason')
      .eq('checkout_request_id', body.checkoutRequestId)
      .maybeSingle()

    if (!payment || payment.status === 'pending') {
      return Response.json({ status: 'pending', confirmationCode: null, cancellationReason: null }, { headers: CORS })
    }
    if (payment.status === 'success') {
      const table = body.bookingType === 'community_event' ? 'community_event_attendees' : 'bookings'
      const { data: booking } = await admin.from(table).select('confirmation_code').eq('id', body.bookingId).single()
      return Response.json({ status: 'confirmed', confirmationCode: booking?.confirmation_code ?? null, cancellationReason: null }, { headers: CORS })
    }
    // failed
    return Response.json({ status: 'cancelled', confirmationCode: null, cancellationReason: payment.cancellation_reason ?? 'mpesa_failed' }, { headers: CORS })
  }

  if (body.bookingType === 'community_event') {
    const { data, error } = await admin
      .from('community_event_attendees')
      .select('status, confirmation_code')
      .eq('id', body.bookingId)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      console.error('booking-status error:', error)
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
    }

    // community_event_attendees uses going/waitlisted/cancelled/pending_payment —
    // normalise to the confirmed/cancelled/pending vocabulary checkout.tsx polls for.
    const status = data.status === 'going' || data.status === 'waitlisted' ? 'confirmed'
      : data.status === 'cancelled' ? 'cancelled'
      : data.status

    return Response.json({
      status,
      confirmationCode: data.confirmation_code,
      cancellationReason: null,
    }, { headers: CORS })
  }

  const isExperience = body.bookingType === 'experience'
  const table = isExperience ? 'experience_bookings' : 'bookings'

  const { data, error } = await admin
    .from(table)
    .select('status, confirmation_code, cancellation_reason')
    .eq('id', body.bookingId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    console.error('booking-status error:', error)
    return Response.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
  }

  return Response.json({
    status: data.status,
    confirmationCode: data.confirmation_code,
    cancellationReason: data.cancellation_reason ?? null,
  }, { headers: CORS })
})

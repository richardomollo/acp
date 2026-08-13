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

  let body: { bookingId?: unknown; receipt?: unknown; bookingType?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  if (typeof body.bookingId !== 'string') return Response.json({ error: 'bookingId required' }, { status: 400, headers: CORS })
  if (typeof body.receipt !== 'string' || body.receipt.trim().length < 6) {
    return Response.json({ error: 'Enter a valid M-Pesa receipt code (e.g. QHK1KUZS2T)' }, { status: 400, headers: CORS })
  }

  const bookingId = body.bookingId
  const receipt = body.receipt.trim().toUpperCase()
  const isExperience = body.bookingType === 'experience'
  const now = new Date().toISOString()

  if (isExperience) {
    const { data: booking, error } = await admin
      .from('experience_bookings')
      .select('id, status, experience_id, user_id')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single()

    if (error || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
    if (booking.status !== 'pending_payment') {
      return Response.json({ error: 'Booking is not awaiting payment' }, { status: 409, headers: CORS })
    }

    await admin.from('experience_bookings').update({
      status: 'confirmed',
      deposit_paid_at: now,
      deposit_payment_id: receipt,
      updated_at: now,
    }).eq('id', bookingId)

    const { data: exp } = await admin.from('experiences').select('spots_left').eq('id', booking.experience_id).single()
    if (exp && exp.spots_left > 0) {
      await admin.from('experiences').update({ spots_left: exp.spots_left - 1 }).eq('id', booking.experience_id)
    }
  } else {
    const { data: booking, error } = await admin
      .from('bookings')
      .select('id, status, session_id, user_id')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single()

    if (error || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
    if (booking.status !== 'pending_payment') {
      return Response.json({ error: 'Booking is not awaiting payment' }, { status: 409, headers: CORS })
    }

    await admin.from('bookings').update({
      status: 'deposit_paid',
      deposit_paid_at: now,
      deposit_payment_id: receipt,
      updated_at: now,
    }).eq('id', bookingId)

    const { data: sess } = await admin.from('sessions').select('spots_left').eq('id', booking.session_id).single()
    if (sess && sess.spots_left > 0) {
      await admin.from('sessions').update({ spots_left: sess.spots_left - 1 }).eq('id', booking.session_id)
    }

    // Send confirmation email
    const { data: fullBooking } = await admin
      .from('bookings')
      .select('confirmation_code, remainder_amount, guest_email, guest_name, sessions(name, date, time, gyms(name, location))')
      .eq('id', bookingId)
      .single()

    const emailTo = fullBooking?.guest_email ?? user.email
    if (emailTo && fullBooking) {
      const session = fullBooking.sessions as any
      const gym = Array.isArray(session?.gyms) ? session.gyms[0] : session?.gyms
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({
          type: 'guest_booking_confirmation',
          data: {
            email: emailTo,
            customerName: fullBooking.guest_name ?? user.email?.split('@')[0] ?? 'there',
            sessionName: session?.name ?? 'Session',
            sessionDate: session?.date ?? '',
            sessionTime: session?.time ?? '',
            venueName: gym?.name ?? '',
            venueLocation: gym?.location ?? '',
            confirmationCode: fullBooking.confirmation_code ?? '',
            remainderAmount: fullBooking.remainder_amount ?? 0,
            bookingId,
          },
        }),
      }).catch(e => console.error('send-email error:', e))
    }
  }

  return Response.json({ confirmed: true, receipt }, { status: 200, headers: CORS })
})

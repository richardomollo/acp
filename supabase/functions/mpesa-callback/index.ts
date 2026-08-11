import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  // M-Pesa standard callback wraps in Body.stkCallback; wallet service may unwrap it
  const cb = body?.Body?.stkCallback ?? body?.stkCallback ?? body
  const checkoutRequestId: string | undefined =
    cb?.CheckoutRequestID ?? cb?.checkoutRequestId ?? cb?.checkout_request_id
  const resultCode = Number(cb?.ResultCode ?? cb?.resultCode ?? -1)
  const resultDesc: string = cb?.ResultDesc ?? cb?.resultDesc ?? ''
  const items: any[] = cb?.CallbackMetadata?.Item ?? []
  const receiptNumber = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value ?? null

  if (!checkoutRequestId) {
    console.error('mpesa-callback: missing CheckoutRequestID', JSON.stringify(body))
    return Response.json({ error: 'Missing CheckoutRequestID' }, { status: 400, headers: CORS })
  }

  const { data: payment, error: payErr } = await admin
    .from('booking_payments')
    .select('id, booking_id, amount, metadata')
    .eq('checkout_request_id', checkoutRequestId)
    .single()

  if (payErr || !payment) {
    console.error('mpesa-callback: payment not found for', checkoutRequestId)
    // Acknowledge so M-Pesa doesn't retry
    return Response.json({ received: true, warning: 'payment_not_found' }, { status: 200, headers: CORS })
  }

  const success = resultCode === 0
  // 1032 = cancelled by user, 1037 = DS timeout (no response)
  let cancellationReason: string
  if (resultCode === 1032) {
    cancellationReason = 'mpesa_failed: You cancelled the M-Pesa request. Please try again and accept the prompt on your phone.'
  } else if (resultCode === 1037) {
    cancellationReason = 'mpesa_failed: No response received. Please check your phone for the M-Pesa prompt and try again.'
  } else if (resultCode === 2001) {
    cancellationReason = 'mpesa_failed: Wrong PIN entered. Please try again.'
  } else if (resultCode !== 0) {
    cancellationReason = `mpesa_failed: ${resultDesc}`
  } else {
    cancellationReason = ''
  }

  console.log('[mpesa-callback]', JSON.stringify({ checkoutRequestId, resultCode, resultDesc, success }))
  // experience bookings store null in booking_id and use metadata.experience_booking_id
  const experienceBookingId: string | null = (payment.metadata as any)?.experience_booking_id ?? null
  const ptBookingId: string | null = (payment.metadata as any)?.pt_booking_id ?? null
  const communityEventAttendeeId: string | null = (payment.metadata as any)?.community_event_attendee_id ?? null
  const isExperienceBooking = !payment.booking_id && !!experienceBookingId
  const isPtBooking = !payment.booking_id && !!ptBookingId
  const isCommunityEventAttendee = !payment.booking_id && !!communityEventAttendeeId
  const isBalancePayment = !!(payment.metadata as any)?.is_balance_payment

  if (success) {
    await admin.from('booking_payments').update({
      status: 'success',
      mpesa_receipt: receiptNumber,
      raw_callback: body,
      cancellation_reason: null,
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id)
  } else {
    // Only mark failed if still pending — don't overwrite a prior success
    await admin.from('booking_payments').update({
      status: 'failed',
      raw_callback: body,
      cancellation_reason: cancellationReason,
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id).eq('status', 'pending')
  }

  if (success) {
    if (isPtBooking) {
      await admin.from('pt_bookings').update({
        payment_status: 'paid',
        status: 'confirmed',
        mpesa_reference: receiptNumber ?? checkoutRequestId,
        updated_at: new Date().toISOString(),
      }).eq('id', ptBookingId)
      console.log('mpesa-callback: PT booking confirmed', ptBookingId)
      const { data: ptRow } = await admin.from('pt_bookings').select('*').eq('id', ptBookingId).single()
      if (ptRow) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        fetch(`${supabaseUrl}/functions/v1/notify-pt-booking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
          body: JSON.stringify({ record: ptRow }),
        }).catch(e => console.error('notify-pt-booking error:', e))
      }
      return Response.json({ received: true }, { headers: CORS })
    } else if (isCommunityEventAttendee) {
      // Guard: only flip if still pending_payment. The capacity trigger
      // (enforce_event_capacity, fires on UPDATE OF status too) auto-downgrades
      // to 'waitlisted' if the event filled up while payment was in flight.
      await admin.from('community_event_attendees').update({
        status: 'going',
        deposit_paid_at: new Date().toISOString(),
        deposit_payment_id: receiptNumber ?? checkoutRequestId,
        updated_at: new Date().toISOString(),
      }).eq('id', communityEventAttendeeId).eq('status', 'pending_payment')

      console.log('mpesa-callback: community event attendee confirmed', communityEventAttendeeId)
      return Response.json({ received: true }, { headers: CORS })
    } else if (isBalancePayment) {
      // Balance payment succeeded — mark booking as fully confirmed
      await admin.from('bookings').update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      }).eq('id', payment.booking_id)
      console.log('mpesa-callback: balance payment confirmed for booking', payment.booking_id)
      return Response.json({ received: true }, { headers: CORS })
    } else if (isExperienceBooking) {
      // Guard: only update and decrement if still pending_payment (C2B may have already confirmed)
      const { data: confirmedExp } = await admin.from('experience_bookings').update({
        status: 'confirmed',
        payment_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', experienceBookingId).eq('status', 'pending_payment').select('id')

      const { data: expBooking } = await admin
        .from('experience_bookings')
        .select('*')
        .eq('id', experienceBookingId)
        .single()

      if (confirmedExp?.length && expBooking?.experience_id) {
        const { data: exp } = await admin
          .from('experiences')
          .select('spots_left')
          .eq('id', expBooking.experience_id)
          .single()
        if (exp && exp.spots_left > 0) {
          await admin
            .from('experiences')
            .update({ spots_left: exp.spots_left - 1 })
            .eq('id', expBooking.experience_id)
        }
      }

      if (expBooking) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        fetch(`${supabaseUrl}/functions/v1/notify-experience-booking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
          body: JSON.stringify({ record: expBooking }),
        }).catch(e => console.error('notify-experience-booking error:', e))

        // Guest confirmation email with sign-up CTA
        const guestEmail = expBooking.email ?? null
        if (guestEmail) {
          const { data: expDetail } = await admin
            .from('experiences').select('title, date, gyms!gym_id(name, location)').eq('id', expBooking.experience_id).single()
          const gym = Array.isArray(expDetail?.gyms) ? (expDetail.gyms as any[])[0] : expDetail?.gyms as any
          fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
            body: JSON.stringify({
              type: 'guest_experience_confirmation',
              data: {
                email: guestEmail,
                customerName: expBooking.guest_name || 'there',
                experienceName: expDetail?.title ?? 'Experience',
                experienceDate: expDetail?.date ?? null,
                venueName: gym?.name ?? '',
                venueLocation: gym?.location ?? '',
                confirmationCode: expBooking.confirmation_code ?? '',
                remainderAmount: expBooking.remainder_amount ?? 0,
              },
            }),
          }).catch(e => console.error('exp guest email error:', e))
        }
      }
    } else {
      // Guard: only update and decrement if still pending_payment (C2B may have already confirmed)
      const { data: confirmedSession } = await admin.from('bookings').update({
        status: 'deposit_paid',
        deposit_paid_at: new Date().toISOString(),
        deposit_payment_id: receiptNumber ?? checkoutRequestId,
        updated_at: new Date().toISOString(),
      }).eq('id', payment.booking_id).eq('status', 'pending_payment').select('id')

      // Fetch booking with session + gym for email
      const { data: booking } = await admin
        .from('bookings')
        .select('session_id, guest_email, guest_name, confirmation_code, remainder_amount, sessions(name, date, time, gyms(name, location))')
        .eq('id', payment.booking_id)
        .single()

      if (confirmedSession?.length && booking?.session_id) {
        const { data: sess } = await admin
          .from('sessions')
          .select('spots_left')
          .eq('id', booking.session_id)
          .single()
        if (sess && sess.spots_left > 0) {
          await admin
            .from('sessions')
            .update({ spots_left: sess.spots_left - 1 })
            .eq('id', booking.session_id)
        }
      }

      // Send WhatsApp notification
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const { data: fullBooking } = await admin.from('bookings').select('*').eq('id', payment.booking_id).single()
      if (fullBooking) {
        fetch(`${supabaseUrl}/functions/v1/notify-booking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
          body: JSON.stringify({ record: fullBooking }),
        }).catch(e => console.error('notify-booking error:', e))
      }

      // Send confirmation email for guest bookings
      if (booking?.guest_email) {
        const session = (booking.sessions as any)
        const gym = Array.isArray(session?.gyms) ? session.gyms[0] : session?.gyms
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
          body: JSON.stringify({
            type: 'guest_booking_confirmation',
            data: {
              email: booking.guest_email,
              customerName: booking.guest_name || 'there',
              sessionName: session?.name ?? 'Session',
              sessionDate: session?.date ?? '',
              sessionTime: session?.time ?? '',
              venueName: gym?.name ?? '',
              venueLocation: gym?.location ?? '',
              confirmationCode: booking.confirmation_code ?? '',
              remainderAmount: booking.remainder_amount ?? 0,
              bookingId: payment.booking_id,
            },
          }),
        }).catch(e => console.error('send-email error:', e))
      }
    }
  } else {
    if (isPtBooking) {
      // Only cancel if still pending — don't overwrite a confirmed PT booking
      await admin.from('pt_bookings').update({
        payment_status: 'failed',
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', ptBookingId).eq('payment_status', 'pending')
      console.log('mpesa-callback: PT booking payment failed', ptBookingId, cancellationReason)
    } else if (isBalancePayment) {
      // Don't cancel the booking — the deposit is still valid.
      // Failure is already recorded in booking_payments.cancellation_reason above.
      console.log('mpesa-callback: balance STK failed for booking', payment.booking_id, cancellationReason)
    } else if (isExperienceBooking) {
      // Only cancel if still pending_payment — don't overwrite a confirmed experience booking
      await admin.from('experience_bookings').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', experienceBookingId).eq('status', 'pending_payment')
    } else if (isCommunityEventAttendee) {
      // Only cancel if still pending_payment — don't overwrite a confirmed RSVP
      await admin.from('community_event_attendees').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', communityEventAttendeeId).eq('status', 'pending_payment')
      console.log('mpesa-callback: community event attendee payment failed', communityEventAttendeeId, cancellationReason)
    } else {
      // Only cancel if still pending_payment — a late success callback may have already confirmed it
      await admin.from('bookings').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellationReason,
        updated_at: new Date().toISOString(),
      }).eq('id', payment.booking_id).eq('status', 'pending_payment')
    }
  }

  return Response.json({ received: true }, { headers: CORS })
})

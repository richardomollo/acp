import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Safaricom C2B confirmation — fires every time a customer pays to our PayBill number.
// We store the transaction for book-paybill receipt validation, and also reconcile any
// pending STK booking whose accountRef matches the bill_ref_number (STK callback fallback).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' }) }

  console.log('[c2b] incoming:', JSON.stringify(body))

  const transId      = (body.TransID as string ?? '').trim()
  const transAmount  = parseFloat(body.TransAmount as string)
  const billRefNumber = (body.BillRefNumber as string ?? '').toUpperCase().trim()

  if (!transId || isNaN(transAmount)) {
    console.error('[c2b] missing TransID or TransAmount — ignoring')
    return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  // 1. Store the transaction
  const { data: c2bRow, error: upsertErr } = await admin.from('mpesa_c2b_transactions').upsert({
    trans_id: transId,
    trans_amount: transAmount,
    bill_ref_number: billRefNumber,
    msisdn: (body.MSISDN as string ?? null),
    trans_time: (body.TransTime as string ?? null),
    first_name: (body.FirstName as string ?? null),
    middle_name: (body.MiddleName as string ?? null),
    last_name: (body.LastName as string ?? null),
    business_short_code: (body.BusinessShortCode as string ?? null),
  }, { onConflict: 'trans_id', ignoreDuplicates: true }).select('id').single()

  if (upsertErr) {
    console.error('[c2b] DB error:', upsertErr.message)
  } else {
    console.log('[c2b] stored:', transId, 'KES', transAmount, 'ref:', billRefNumber)
  }

  // 2. Reconcile with a pending STK booking (fallback for missed STK result callbacks)
  //    accountRef in the STK push = booking_id.slice(0, 12), which Safaricom echoes as BillRefNumber
  if (billRefNumber.length >= 8) {
    await reconcileStk(admin, billRefNumber, transId, transAmount, c2bRow?.id ?? null)
  }

  // Always acknowledge — Safaricom will retry on non-200
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
})

async function reconcileStk(
  admin: ReturnType<typeof createClient>,
  billRef: string,
  receipt: string,
  amount: number,
  c2bId: string | null,
) {
  const now = new Date().toISOString()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // ── Session booking ─────────────────────────────────────────────────────────
  const { data: booking } = await admin.from('bookings')
    .select('id, session_id, gym_id, confirmation_code, deposit_amount, remainder_amount, guest_email, guest_name')
    .ilike('id', `${billRef}%`)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (booking) {
    const { data: payment } = await admin.from('booking_payments')
      .select('id, amount')
      .eq('booking_id', booking.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (payment && amount >= Number(payment.amount) - 1) {
      console.log('[c2b] reconciling session booking:', booking.id)

      await admin.from('booking_payments').update({
        status: 'success', mpesa_receipt: receipt,
        raw_callback: { source: 'c2b_reconciliation', trans_id: receipt },
        updated_at: now,
      }).eq('id', payment.id).eq('status', 'pending')

      // Guard: only update (and decrement spots) if booking is still pending_payment
      const { data: confirmed } = await admin.from('bookings').update({
        status: 'deposit_paid', deposit_paid_at: now, deposit_payment_id: receipt, updated_at: now,
      }).eq('id', booking.id).eq('status', 'pending_payment').select('id')

      if (confirmed?.length) {
        if (booking.session_id) {
          const { data: sess } = await admin.from('sessions').select('spots_left').eq('id', booking.session_id).single()
          if (sess && sess.spots_left > 0) {
            await admin.from('sessions').update({ spots_left: sess.spots_left - 1 }).eq('id', booking.session_id)
          }
        }
        if (c2bId) {
          await admin.from('mpesa_c2b_transactions').update({ used_at: now, booking_id: booking.id }).eq('id', c2bId)
        }
        fetch(`${supabaseUrl}/functions/v1/notify-booking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ record: { ...booking, status: 'deposit_paid', deposit_payment_id: receipt } }),
        }).catch(e => console.error('[c2b] notify-booking:', e))

        // Guest confirmation email with sign-up CTA
        if (booking.guest_email) {
          const { data: sessDetail } = await admin
            .from('sessions').select('name, date, time, gyms!gym_id(name, location)').eq('id', booking.session_id).single()
          const gym = Array.isArray(sessDetail?.gyms) ? (sessDetail.gyms as any[])[0] : sessDetail?.gyms as any
          fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({
              type: 'guest_booking_confirmation',
              data: {
                email: booking.guest_email,
                customerName: booking.guest_name || 'there',
                sessionName: sessDetail?.name ?? 'Session',
                sessionDate: sessDetail?.date ?? '',
                sessionTime: sessDetail?.time ?? '',
                venueName: gym?.name ?? '',
                venueLocation: gym?.location ?? '',
                confirmationCode: booking.confirmation_code ?? '',
                remainderAmount: booking.remainder_amount ?? 0,
                bookingId: booking.id,
              },
            }),
          }).catch(e => console.error('[c2b] session guest email:', e))
        }
        console.log('[c2b] session booking confirmed via C2B:', booking.id)
      }
      return
    }
  }

  // ── Experience booking ──────────────────────────────────────────────────────
  const { data: expBooking } = await admin.from('experience_bookings')
    .select('id, experience_id, deposit_amount, remainder_amount, email, guest_name, confirmation_code')
    .ilike('id', `${billRef}%`)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (expBooking) {
    const { data: expPayment } = await admin.from('booking_payments')
      .select('id, amount')
      .eq('metadata->>experience_booking_id', expBooking.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (expPayment && amount >= Number(expPayment.amount) - 1) {
      console.log('[c2b] reconciling experience booking:', expBooking.id)

      await admin.from('booking_payments').update({
        status: 'success', mpesa_receipt: receipt,
        raw_callback: { source: 'c2b_reconciliation', trans_id: receipt },
        updated_at: now,
      }).eq('id', expPayment.id).eq('status', 'pending')

      const { data: confirmedExp } = await admin.from('experience_bookings').update({
        status: 'confirmed', deposit_paid_at: now, deposit_payment_id: receipt, updated_at: now,
      }).eq('id', expBooking.id).eq('status', 'pending_payment').select('id')

      if (confirmedExp?.length) {
        if (expBooking.experience_id) {
          const { data: exp } = await admin.from('experiences').select('spots_left').eq('id', expBooking.experience_id).single()
          if (exp && exp.spots_left > 0) {
            await admin.from('experiences').update({ spots_left: exp.spots_left - 1 }).eq('id', expBooking.experience_id)
          }
        }
        if (c2bId) {
          await admin.from('mpesa_c2b_transactions').update({ used_at: now, experience_booking_id: expBooking.id }).eq('id', c2bId)
        }
        fetch(`${supabaseUrl}/functions/v1/notify-experience-booking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ record: { ...expBooking, status: 'confirmed' } }),
        }).catch(e => console.error('[c2b] notify-experience-booking:', e))

        // Guest confirmation email with sign-up CTA
        if (expBooking.email) {
          const { data: expDetail } = await admin
            .from('experiences').select('title, date, gyms!gym_id(name, location)').eq('id', expBooking.experience_id).single()
          const gym = Array.isArray(expDetail?.gyms) ? (expDetail.gyms as any[])[0] : expDetail?.gyms as any
          fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({
              type: 'guest_experience_confirmation',
              data: {
                email: expBooking.email,
                customerName: expBooking.guest_name || 'there',
                experienceName: expDetail?.title ?? 'Experience',
                experienceDate: expDetail?.date ?? null,
                venueName: gym?.name ?? '',
                venueLocation: gym?.location ?? '',
                confirmationCode: expBooking.confirmation_code ?? '',
                remainderAmount: expBooking.remainder_amount ?? 0,
              },
            }),
          }).catch(e => console.error('[c2b] exp guest email:', e))
        }
        console.log('[c2b] experience booking confirmed via C2B:', expBooking.id)
      }
      return
    }
  }

  // ── PT booking ──────────────────────────────────────────────────────────────
  const { data: ptBooking } = await admin.from('pt_bookings')
    .select('id, pt_id, offering_id, amount_kes')
    .ilike('id', `${billRef}%`)
    .eq('payment_status', 'pending')
    .maybeSingle()

  if (ptBooking) {
    const { data: ptPayment } = await admin.from('booking_payments')
      .select('id, amount')
      .eq('metadata->>pt_booking_id', ptBooking.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (ptPayment && amount >= Number(ptPayment.amount) - 1) {
      console.log('[c2b] reconciling PT booking:', ptBooking.id)

      await admin.from('booking_payments').update({
        status: 'success', mpesa_receipt: receipt,
        raw_callback: { source: 'c2b_reconciliation', trans_id: receipt },
        updated_at: now,
      }).eq('id', ptPayment.id).eq('status', 'pending')

      const { data: confirmedPt } = await admin.from('pt_bookings').update({
        payment_status: 'paid', status: 'confirmed', mpesa_reference: receipt, updated_at: now,
      }).eq('id', ptBooking.id).eq('payment_status', 'pending').select('id')

      if (confirmedPt?.length) {
        if (c2bId) {
          await admin.from('mpesa_c2b_transactions').update({ used_at: now, pt_booking_id: ptBooking.id }).eq('id', c2bId)
        }
        const { data: ptRow } = await admin.from('pt_bookings').select('*').eq('id', ptBooking.id).single()
        if (ptRow) {
          fetch(`${supabaseUrl}/functions/v1/notify-pt-booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({ record: ptRow }),
          }).catch(e => console.error('[c2b] notify-pt-booking:', e))
        }
        console.log('[c2b] PT booking confirmed via C2B:', ptBooking.id)
      }
      return
    }
  }

  console.log('[c2b] no pending booking matched bill_ref:', billRef)
}

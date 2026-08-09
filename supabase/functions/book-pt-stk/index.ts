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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { ptBookingId?: unknown; phone?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  if (typeof body.ptBookingId !== 'string') return Response.json({ error: 'ptBookingId required' }, { status: 400, headers: CORS })
  if (typeof body.phone !== 'string') return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })

  let phone: string
  try { phone = normalisePhone(body.phone) }
  catch (e: any) { return Response.json({ error: e.message }, { status: 400, headers: CORS }) }

  const { data: ptBooking, error: ptErr } = await admin
    .from('pt_bookings')
    .select('id, amount_kes, status, payment_status')
    .eq('id', body.ptBookingId)
    .single()

  if (ptErr || !ptBooking) return Response.json({ error: 'PT booking not found' }, { status: 404, headers: CORS })
  if (ptBooking.payment_status === 'paid') return Response.json({ error: 'Already paid' }, { status: 409, headers: CORS })

  const amount = Number(ptBooking.amount_kes)
  if (!amount || amount <= 0) return Response.json({ error: 'Invalid booking amount' }, { status: 400, headers: CORS })

  let stkResult: { checkoutRequestId: string; merchantRequestId: string }
  try {
    stkResult = await initiateStkPush({
      phone,
      amount,
      accountRef: body.ptBookingId.slice(0, 12),
      description: 'PT session',
    })
  } catch (e: any) {
    await admin.from('pt_bookings').update({
      payment_status: 'failed',
      status: 'cancelled',
    }).eq('id', body.ptBookingId)
    return Response.json({ error: e.message ?? 'STK push failed' }, { status: 502, headers: CORS })
  }

  await admin.from('booking_payments').insert({
    booking_id: null,
    checkout_request_id: stkResult.checkoutRequestId,
    merchant_request_id: stkResult.merchantRequestId,
    phone,
    amount,
    payment_type: 'full',
    status: 'pending',
    metadata: { pt_booking_id: body.ptBookingId },
  })

  return Response.json({ checkoutRequestId: stkResult.checkoutRequestId }, { status: 201, headers: CORS })
})

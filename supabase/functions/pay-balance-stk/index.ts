import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { initiateStkPush } from '../_shared/daraja.ts'

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

  let body: { bookingId?: unknown; phone?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : null
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null
  if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400, headers: CORS })
  if (!phone) return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })

  const { data: booking, error: bookErr } = await admin
    .from('bookings')
    .select('id, user_id, status, remainder_amount, confirmation_code')
    .eq('id', bookingId)
    .single()

  if (bookErr || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
  if (booking.user_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403, headers: CORS })
  if (booking.status !== 'deposit_paid') {
    return Response.json({ error: `Balance already paid or booking is ${booking.status}` }, { status: 409, headers: CORS })
  }

  const amount = Number(booking.remainder_amount)
  if (!amount || amount <= 0) return Response.json({ error: 'No balance due on this booking' }, { status: 409, headers: CORS })

  const { checkoutRequestId, merchantRequestId } = await initiateStkPush({
    phone,
    amount,
    accountRef: booking.confirmation_code ?? bookingId.slice(0, 12),
    description: 'Balance payment',
  })

  await admin.from('booking_payments').insert({
    checkout_request_id: checkoutRequestId,
    merchant_request_id: merchantRequestId,
    booking_id: bookingId,
    phone,
    amount,
    payment_type: 'remainder',
    status: 'pending',
    metadata: { is_balance_payment: true },
  })

  console.log('[pay-balance-stk] STK sent for booking', bookingId, 'KES', amount)
  return Response.json({ checkoutRequestId, bookingId }, { status: 200, headers: CORS })
})

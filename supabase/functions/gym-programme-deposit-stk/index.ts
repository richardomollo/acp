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

  let body: { phone?: unknown; amount?: unknown; enrollmentId?: unknown; programmeId?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  if (typeof body.phone !== 'string') return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })
  if (!body.amount || isNaN(Number(body.amount))) return Response.json({ error: 'amount required' }, { status: 400, headers: CORS })
  if (typeof body.enrollmentId !== 'string') return Response.json({ error: 'enrollmentId required' }, { status: 400, headers: CORS })

  let phone: string
  try { phone = normalisePhone(body.phone) }
  catch (e: any) { return Response.json({ error: e.message }, { status: 400, headers: CORS }) }

  const amount = Number(body.amount)
  if (amount <= 0) return Response.json({ error: 'Invalid amount' }, { status: 400, headers: CORS })

  const enrollmentId = body.enrollmentId as string
  const programmeId = typeof body.programmeId === 'string' ? body.programmeId : null

  let stkResult: { checkoutRequestId: string; merchantRequestId: string }
  try {
    stkResult = await initiateStkPush({
      phone,
      amount,
      accountRef: enrollmentId.slice(0, 12),
      description: 'Programme deposit',
    })
  } catch (e: any) {
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
    metadata: { source: 'gym-programme-deposit', enrollment_id: enrollmentId, programme_id: programmeId },
  })

  return Response.json({ checkoutRequestId: stkResult.checkoutRequestId }, { status: 201, headers: CORS })
})

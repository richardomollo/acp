import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Safaricom C2B confirmation — fires every time a customer pays to our PayBill number.
// We store the transaction so book-paybill can validate receipts before confirming bookings.
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

  const transId = (body.TransID as string ?? '').trim()
  const transAmount = parseFloat(body.TransAmount as string)
  const billRefNumber = (body.BillRefNumber as string ?? '').toUpperCase().trim()

  if (!transId || isNaN(transAmount)) {
    console.error('[c2b] missing TransID or TransAmount — ignoring')
    return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const { error } = await admin.from('mpesa_c2b_transactions').upsert({
    trans_id: transId,
    trans_amount: transAmount,
    bill_ref_number: billRefNumber,
    msisdn: (body.MSISDN as string ?? null),
    trans_time: (body.TransTime as string ?? null),
    first_name: (body.FirstName as string ?? null),
    middle_name: (body.MiddleName as string ?? null),
    last_name: (body.LastName as string ?? null),
    business_short_code: (body.BusinessShortCode as string ?? null),
  }, { onConflict: 'trans_id', ignoreDuplicates: true })

  if (error) {
    console.error('[c2b] DB error:', error.message)
  } else {
    console.log('[c2b] stored:', transId, 'KES', transAmount, 'ref:', billRefNumber)
  }

  // Always acknowledge — Safaricom will retry on non-200 responses
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: any
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  console.log('[b2b-callback] received:', JSON.stringify(body))

  // Daraja B2B result envelope (same shape as B2C)
  const result = body?.Result
  if (!result) return new Response('OK', { status: 200 })

  const originatorConversationId = result.OriginatorConversationID
  const resultCode               = result.ResultCode       // 0 = success
  const resultDesc               = result.ResultDesc ?? ''
  const conversationId           = result.ConversationID

  // Extract receipt number from ResultParameters
  let receiptNumber: string | null = null
  const params: any[] = result.ResultParameters?.ResultParameter ?? []
  for (const p of params) {
    if (p.Key === 'TransactionReceipt') receiptNumber = p.Value
  }

  const succeeded = resultCode === 0

  // Try venue withdrawal first
  const { data: venueWithdrawal } = await admin
    .from('partner_withdrawals')
    .select('id')
    .eq('originator_conversation_id', originatorConversationId)
    .single()

  if (venueWithdrawal) {
    await admin.from('partner_withdrawals').update({
      status:        succeeded ? 'completed' : 'failed',
      receipt_number: receiptNumber,
      failure_reason: succeeded ? null : resultDesc,
      completed_at:  succeeded ? new Date().toISOString() : null,
      updated_at:    new Date().toISOString(),
    }).eq('id', venueWithdrawal.id)

    console.log(`[b2b-callback] venue withdrawal ${venueWithdrawal.id}: ${succeeded ? 'completed' : 'failed'}`)
    return new Response('OK', { status: 200 })
  }

  // Try PT payout request
  const { data: ptPayout } = await admin
    .from('pt_payout_requests')
    .select('id')
    .eq('originator_conversation_id', originatorConversationId)
    .single()

  if (ptPayout) {
    await admin.from('pt_payout_requests').update({
      status:        succeeded ? 'completed' : 'failed',
      receipt_number: receiptNumber,
      failure_reason: succeeded ? null : resultDesc,
      completed_at:  succeeded ? new Date().toISOString() : null,
      updated_at:    new Date().toISOString(),
    }).eq('id', ptPayout.id)

    console.log(`[b2b-callback] PT payout ${ptPayout.id}: ${succeeded ? 'completed' : 'failed'}`)
    return new Response('OK', { status: 200 })
  }

  console.warn('[b2b-callback] no withdrawal found for originatorConversationId:', originatorConversationId, conversationId)
  return new Response('OK', { status: 200 })
})

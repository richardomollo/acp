import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { initiateB2B } from '../_shared/daraja.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  const { type, gymId, ptId, amount, destinationType, phone, businessNumber, accountNumber, bankName, accountName } = body

  if (!type || !['venue', 'pt'].includes(type)) {
    return Response.json({ error: 'type must be "venue" or "pt"' }, { status: 400, headers: CORS })
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return Response.json({ error: 'amount must be a positive number' }, { status: 400, headers: CORS })
  }

  const destType: string = destinationType || 'MPESA_NUMBER'
  if (!['MPESA_NUMBER', 'MPESA_PAYBILL', 'BANK'].includes(destType)) {
    return Response.json({ error: 'Invalid destinationType' }, { status: 400, headers: CORS })
  }

  // Validate required fields per destination type
  if (destType === 'MPESA_NUMBER') {
    if (!phone || !/^2547\d{8}$/.test(phone)) {
      return Response.json({ error: 'Phone must be in format 2547XXXXXXXX' }, { status: 400, headers: CORS })
    }
  } else if (destType === 'MPESA_PAYBILL') {
    if (!businessNumber || !accountNumber) {
      return Response.json({ error: 'businessNumber and accountNumber are required for Paybill' }, { status: 400, headers: CORS })
    }
  } else if (destType === 'BANK') {
    if (!bankName || !accountNumber) {
      return Response.json({ error: 'bankName and accountNumber are required for Bank transfer' }, { status: 400, headers: CORS })
    }
  }

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    console.error('[process-withdrawal] auth error:', authError?.message)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  console.log('[process-withdrawal] user:', user.id, 'type:', type, 'gymId:', gymId, 'dest:', destType)

  async function sendNotificationEmail(venueName: string) {
    const destLabel = destType === 'MPESA_NUMBER' ? phone
      : destType === 'MPESA_PAYBILL' ? `Paybill ${businessNumber} / ${accountNumber}`
      : `${bankName} / ${accountNumber}`
    try {
      await admin.functions.invoke('send-email', {
        body: {
          type: 'withdrawal_request',
          data: {
            email: 'info@activecitypass.com',
            partnerEmail: user.email,
            venueName,
            amount,
            destinationType: destType,
            phone: phone || null,
            businessNumber: businessNumber || null,
            accountNumber: accountNumber || null,
            bankName: bankName || null,
            accountName: accountName || null,
            requestedAt: new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
          },
        },
      })
    } catch (e) {
      console.error('[process-withdrawal] email notification failed:', e)
    }
  }

  // Paybill-to-paybill payouts are automated via Daraja B2B. Phone-number and
  // bank destinations stay on the manual/email flow for now.
  async function disburseB2B(table: 'partner_withdrawals' | 'pt_payout_requests', withdrawalId: string, recipientName: string) {
    const originatorConversationId = crypto.randomUUID()
    try {
      const result = await initiateB2B({
        destinationShortCode: businessNumber,
        accountReference: accountNumber,
        amount,
        remarks: `Payout to ${recipientName}`.slice(0, 100),
        originatorConversationId,
      })
      const { data } = await admin.from(table).update({
        originator_conversation_id: result.originatorConversationId,
        conversation_id: result.conversationId,
        updated_at: new Date().toISOString(),
      }).eq('id', withdrawalId).select().single()
      console.log(`[process-withdrawal] B2B initiated for ${table} ${withdrawalId}:`, result.conversationId)
      return data
    } catch (e: any) {
      console.error(`[process-withdrawal] B2B failed for ${table} ${withdrawalId}:`, e)
      const { data } = await admin.from(table).update({
        status: 'failed',
        failure_reason: e.message ?? 'B2B request failed',
        updated_at: new Date().toISOString(),
      }).eq('id', withdrawalId).select().single()
      return data
    }
  }

  try {
    if (type === 'venue') {
      if (!gymId) return Response.json({ error: 'gymId required for venue withdrawal' }, { status: 400, headers: CORS })

      const { data: partner, error: partnerErr } = await admin
        .from('partners').select('id').eq('user_id', user.id).maybeSingle()
      console.log('[process-withdrawal] partner:', partner?.id, partnerErr?.message)
      if (!partner) return Response.json({ error: 'Partner account not found' }, { status: 403, headers: CORS })

      const { data: pg, error: pgErr } = await admin
        .from('partner_gyms').select('gym_id').eq('partner_id', partner.id).eq('gym_id', gymId).maybeSingle()
      console.log('[process-withdrawal] partner_gym:', pg?.gym_id, pgErr?.message)
      if (!pg) return Response.json({ error: 'Venue not found for this account' }, { status: 403, headers: CORS })

      const { data: gym } = await admin
        .from('gyms').select('name, rate_floor_percentage').eq('id', gymId).single()
      const defaultCommission = gym?.rate_floor_percentage ?? 15

      // Session earnings
      const { data: gymSessions } = await admin
        .from('sessions').select('id').eq('gym_id', gymId)
      const sessionIds = (gymSessions || []).map((s: any) => s.id)

      let sessionEarned = 0
      if (sessionIds.length > 0) {
        const { data: bookingData } = await admin
          .from('bookings')
          .select('sessions(drop_in_price, gyms(rate_floor_percentage))')
          .in('session_id', sessionIds)
          .eq('checked_in', true)
        sessionEarned = (bookingData || []).reduce((sum: number, b: any) => {
          const price = b.sessions?.drop_in_price || 0
          const pct = (b.sessions?.gyms as any)?.rate_floor_percentage ?? defaultCommission
          return sum + Math.round(price * (1 - pct / 100))
        }, 0)
      }

      // Experience earnings
      const { data: expData } = await admin
        .from('experience_bookings').select('deposit_amount')
        .eq('gym_id', gymId).in('status', ['deposit_paid', 'confirmed', 'checked_in'])
      const expEarned = (expData || []).reduce((sum: number, b: any) =>
        sum + Math.round(Number(b.deposit_amount || 0) * (1 - defaultCommission / 100)), 0)

      const totalEarned = sessionEarned + expEarned

      const { data: prevWithdrawals } = await admin
        .from('partner_withdrawals').select('amount')
        .eq('gym_id', gymId).in('status', ['processing', 'completed'])
      const totalWithdrawn = (prevWithdrawals || []).reduce((s: number, w: any) => s + Number(w.amount), 0)
      const available = totalEarned - totalWithdrawn

      console.log('[process-withdrawal] sessionEarned:', sessionEarned, 'expEarned:', expEarned, 'totalWithdrawn:', totalWithdrawn, 'available:', available, 'requested:', amount)
      if (amount > available) {
        return Response.json({ error: `Amount exceeds available balance of KES ${available}` }, { status: 422, headers: CORS })
      }

      const { data: inFlight } = await admin
        .from('partner_withdrawals').select('id').eq('gym_id', gymId).eq('status', 'processing').limit(1)
      console.log('[process-withdrawal] inFlight:', inFlight?.length)
      if (inFlight && inFlight.length > 0) {
        return Response.json({ error: 'A withdrawal is already being processed. Please wait.' }, { status: 422, headers: CORS })
      }

      const { data: withdrawal, error: insErr } = await admin
        .from('partner_withdrawals')
        .insert({
          gym_id: gymId,
          partner_email: user.email,
          amount,
          method: destType === 'BANK' ? 'bank' : 'mpesa',
          phone: phone || null,
          business_number: businessNumber || null,
          account_number: accountNumber || null,
          bank_name: bankName || null,
          account_name: accountName || null,
          status: 'processing',
          destination_type: destType,
        })
        .select().single()

      console.log('[process-withdrawal] insert error:', insErr?.message, 'withdrawal id:', withdrawal?.id)
      if (insErr) return Response.json({ error: insErr.message }, { status: 500, headers: CORS })

      if (destType === 'MPESA_PAYBILL') {
        const updated = await disburseB2B('partner_withdrawals', withdrawal.id, gym?.name || gymId)
        return Response.json({ withdrawal: updated ?? withdrawal }, { headers: CORS })
      }
      sendNotificationEmail(gym?.name || gymId) // fire-and-forget to keep response fast
      return Response.json({ withdrawal }, { headers: CORS })

    } else {
      if (!ptId) return Response.json({ error: 'ptId required for PT withdrawal' }, { status: 400, headers: CORS })

      const { data: pt, error: ptErr } = await admin
        .from('personal_trainers').select('id, user_id, full_name').eq('id', ptId).single()
      if (ptErr || !pt || pt.user_id !== user.id) {
        return Response.json({ error: 'PT not found for this account' }, { status: 403, headers: CORS })
      }

      const { data: bookingData } = await admin
        .from('pt_bookings').select('amount_kes').eq('pt_id', ptId).eq('status', 'completed')
      const totalEarned = (bookingData || []).reduce((s: number, b: any) => s + Number(b.amount_kes || 0), 0)

      const { data: prevWithdrawals } = await admin
        .from('pt_payout_requests').select('amount').eq('pt_id', ptId).in('status', ['processing', 'completed'])
      const totalWithdrawn = (prevWithdrawals || []).reduce((s: number, w: any) => s + Number(w.amount), 0)
      const available = totalEarned - totalWithdrawn

      if (amount > available) {
        return Response.json({ error: `Amount exceeds available balance of KES ${available}` }, { status: 422, headers: CORS })
      }

      const { data: inFlight } = await admin
        .from('pt_payout_requests').select('id').eq('pt_id', ptId).eq('status', 'processing').limit(1)
      if (inFlight && inFlight.length > 0) {
        return Response.json({ error: 'A withdrawal is already being processed. Please wait.' }, { status: 422, headers: CORS })
      }

      const { data: payout, error: insErr } = await admin
        .from('pt_payout_requests')
        .insert({
          pt_id: ptId,
          amount,
          method: destType === 'BANK' ? 'bank' : 'mpesa',
          phone: phone || null,
          business_number: businessNumber || null,
          account_number: accountNumber || null,
          bank_name: bankName || null,
          account_name: accountName || null,
          status: 'processing',
          destination_type: destType,
        })
        .select().single()

      if (insErr) return Response.json({ error: insErr.message }, { status: 500, headers: CORS })

      if (destType === 'MPESA_PAYBILL') {
        const updated = await disburseB2B('pt_payout_requests', payout.id, pt.full_name || ptId)
        return Response.json({ withdrawal: updated ?? payout }, { headers: CORS })
      }
      await sendNotificationEmail(pt.full_name || ptId)
      return Response.json({ withdrawal: payout }, { headers: CORS })
    }
  } catch (err: any) {
    console.error('[process-withdrawal] error:', err)
    return Response.json({ error: err.message ?? 'Internal error' }, { status: 500, headers: CORS })
  }
})

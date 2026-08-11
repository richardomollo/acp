import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalisePhone, sendWhatsAppTemplate } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const PARTNERS_APP_ONBOARDING_URL = 'https://activecitypass.com/partner-onboarding'

async function sendEmail(type: string, data: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ type, data }),
  })
  const json = await res.json()
  if (!res.ok) console.error(`send-email (${type}) error:`, JSON.stringify(json))
  return json
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const community = payload.record as {
      id: string; name: string; owner_user_id: string; review_status: string; rejection_reason: string | null;
    }

    console.log('notify-community-status:', community.id, '| review_status:', community.review_status)

    const { data: owner } = await supabase
      .from('users')
      .select('name, email, phone')
      .eq('id', community.owner_user_id)
      .single()

    if (!owner?.email) {
      console.warn('No owner email found for community', community.id)
      return new Response('no email', { status: 200 })
    }

    const ownerName = owner.name ?? 'there'

    if (community.review_status === 'approved') {
      await sendEmail('partner_approved', {
        email: owner.email,
        name: ownerName,
        onboardingUrl: PARTNERS_APP_ONBOARDING_URL,
        remainingTasks: [],
        partnerType: 'Community Organiser',
      })
      if (owner.phone) {
        await sendWhatsAppTemplate(normalisePhone(owner.phone), 'partner_approved', [ownerName, PARTNERS_APP_ONBOARDING_URL])
      }
    } else if (community.review_status === 'rejected') {
      await sendEmail('partner_rejected', {
        email: owner.email,
        name: ownerName,
        rejectionReason: community.rejection_reason ?? null,
      })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('notify-community-status error:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

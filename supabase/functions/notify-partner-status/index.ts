import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ONBOARDING_URL = 'https://activecitypass.com/partner-onboarding'

function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-]/g, '')
  if (cleaned.startsWith('+')) return cleaned.slice(1)
  if (cleaned.startsWith('0')) return '254' + cleaned.slice(1)
  return cleaned
}

async function sendEmail(type: string, data: Record<string, unknown>) {
  const res = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ type, data }),
    }
  )
  const json = await res.json()
  if (!res.ok) console.error(`send-email (${type}) error:`, JSON.stringify(json))
  else console.log(`send-email (${type}) ok`)
  return json
}

async function sendWhatsApp(to: string, templateName: string, variables: string[]) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${Deno.env.get('WA_PHONE_NUMBER_ID')}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('WA_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [{ type: 'body', parameters: variables.map(v => ({ type: 'text', text: v })) }],
        },
      }),
    }
  )
  const json = await res.json()
  console.log('WhatsApp response:', JSON.stringify(json))
  return json
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const { type, record, old_record } = payload

    console.log('notify-partner-status called:', type)

    // ── PT status change ──────────────────────────────────────────────
    if (type === 'pt_status_change') {
      const pt = record as {
        id: string; full_name: string; email: string; phone: string | null; status: string;
        professional_name: string | null; rejection_reason: string | null; photo_url: string | null;
      }

      if (pt.status === 'approved') {
        const name = pt.professional_name ?? pt.full_name

        const [{ count: offeringsCount }, { count: availabilityCount }] = await Promise.all([
          supabase.from('pt_offerings').select('id', { count: 'exact', head: true }).eq('pt_id', pt.id),
          supabase.from('pt_availability').select('id', { count: 'exact', head: true }).eq('pt_id', pt.id),
        ])

        const remainingTasks = [
          !pt.photo_url && 'Add a profile photo',
          !offeringsCount && 'Create your first offering',
          !availabilityCount && 'Set your availability',
        ].filter(Boolean) as string[]

        await sendEmail('partner_approved', {
          email: pt.email,
          name,
          onboardingUrl: ONBOARDING_URL,
          remainingTasks,
          partnerType: 'Trainer / Coach / Nutritionist',
        })

        if (pt.phone) {
          await sendWhatsApp(normalisePhone(pt.phone), 'partner_approved', [name, ONBOARDING_URL])
        }

      } else if (pt.status === 'rejected') {
        await sendEmail('partner_rejected', {
          email: pt.email,
          name: pt.professional_name ?? pt.full_name,
          rejectionReason: pt.rejection_reason ?? null,
        })
        // No WhatsApp for rejections — keep it professional via email only
      }
    }

    // ── Gym / venue approval ──────────────────────────────────────────
    if (type === 'gym_approved') {
      const gym = record as {
        id: string; name: string; contact_email: string | null; contact_phone: string | null;
        image_url: string | null; rejection_reason: string | null;
      }

      if (!gym.contact_email) {
        console.warn('Gym has no contact_email — skipping notification')
        return new Response('no email', { status: 200 })
      }

      const { count: sessionsCount } = await supabase
        .from('sessions').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id)

      const remainingTasks = [
        !gym.image_url && 'Add a photo',
        !sessionsCount && 'Create your first session',
      ].filter(Boolean) as string[]

      await sendEmail('partner_approved', {
        email: gym.contact_email,
        name: gym.name,
        onboardingUrl: ONBOARDING_URL,
        remainingTasks,
        partnerType: 'Venue',
      })

      if (gym.contact_phone) {
        await sendWhatsApp(normalisePhone(gym.contact_phone), 'partner_approved', [gym.name, ONBOARDING_URL])
      }
    }

    // ── Gym rejection ─────────────────────────────────────────────────
    if (type === 'gym_rejected') {
      const gym = record as {
        name: string; contact_email: string | null; rejection_reason: string | null;
      }

      if (gym.contact_email) {
        await sendEmail('partner_rejected', {
          email: gym.contact_email,
          name: gym.name,
          rejectionReason: gym.rejection_reason ?? null,
        })
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-partner-status error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

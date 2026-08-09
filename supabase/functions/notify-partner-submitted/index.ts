import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ACP_TEAM_EMAIL = 'info@activecitypass.com'

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
    const { name, email, phone, businessName, partnerTypes } = await req.json()

    const typeLabel = (partnerTypes as string[])
      .map(t => t === 'pt' ? 'Trainer / Coach / Nutritionist' : t === 'venue' ? 'Venue' : 'Wellness & Fitness Experiences')
      .join(', ')

    // Email → partner
    await sendEmail('partner_application_received', { email, name, businessName, partnerType: typeLabel })

    // Email → ACP team
    await sendEmail('partner_application_alert', {
      email: ACP_TEAM_EMAIL,
      applicantName: name,
      applicantEmail: email,
      applicantPhone: phone,
      businessName,
      partnerType: typeLabel,
    })

    // WhatsApp → partner
    if (phone) {
      await sendWhatsApp(normalisePhone(phone), 'partner_application_received', [name, typeLabel])
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-partner-submitted error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

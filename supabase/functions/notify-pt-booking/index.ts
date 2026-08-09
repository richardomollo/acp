import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-]/g, '')
  if (cleaned.startsWith('+')) return cleaned.slice(1)
  if (cleaned.startsWith('0')) return '254' + cleaned.slice(1)
  return cleaned
}

async function resolvePhone(guestPhone: string | null, userId: string | null): Promise<string | null> {
  if (guestPhone) return normalisePhone(guestPhone)
  if (!userId) return null
  const { data } = await supabase
    .from('users')
    .select('phone')
    .eq('id', userId)
    .single()
  return data?.phone ? normalisePhone(data.phone) : null
}

async function sendWhatsApp(to: string, variables: string[]) {
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
          name: 'pt_booking_confirmation',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: v }))
          }]
        }
      })
    }
  )
  const json = await res.json()
  console.log('WhatsApp API response:', JSON.stringify(json))
  return json
}

async function notifyPartnerByEmail(d: {
  email: string; businessName: string; sessionName: string; customerName: string; sessionDate: string; sessionTime: string
}) {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ type: 'new_booking', data: d }),
    })
    console.log('Partner email response:', res.status, await res.text())
  } catch (err) {
    console.error('Partner email failed (non-fatal):', (err as Error).message)
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const booking = payload.record
    const phoneOverride: string | null = payload.phone ?? null

    console.log('PT booking received:', booking.id, '| status:', booking.status)

    if (booking.status !== 'confirmed') {
      console.log('Skipping — status is not confirmed')
      return new Response('skipped', { status: 200 })
    }

    // Fetch trainer — using explicit FK hint for multiple FK paths
    const { data: trainer } = await supabase
      .from('personal_trainers')
      .select('full_name, professional_name, email')
      .eq('id', booking.pt_id)
      .single()

    // Fetch offering title
    const { data: offering } = await supabase
      .from('pt_offerings')
      .select('title')
      .eq('id', booking.offering_id)
      .single()

    const trainerName = trainer?.professional_name ?? trainer?.full_name ?? 'your trainer'
    const offeringTitle = offering?.title ?? 'your session'

    console.log('Trainer:', trainerName, '| Offering:', offeringTitle)

    const recipientName = booking.guest_name ?? 'there'
    const date = new Date(booking.scheduled_date).toLocaleDateString('en-KE', {
      weekday: 'short', day: 'numeric', month: 'short'
    })
    const time = booking.scheduled_time?.slice(0, 5) ?? ''

    // Partner notification — independent of whether the customer has a phone
    // number, so this runs before the early-return below.
    if (trainer?.email) {
      await notifyPartnerByEmail({
        email: trainer.email,
        businessName: trainerName,
        sessionName: offeringTitle,
        customerName: recipientName,
        sessionDate: date,
        sessionTime: time,
      })
    } else {
      console.log('No email for trainer', booking.pt_id, '— skipping partner notification')
    }

    const phone = phoneOverride ?? await resolvePhone(booking.guest_phone, booking.user_id)

    if (!phone) {
      console.error('No phone number found for pt_booking', booking.id)
      return new Response('no phone', { status: 200 })
    }

    console.log('Sending to:', phone)

    const result = await sendWhatsApp(phone, [
      recipientName,
      trainerName,
      date,
      time,
      offeringTitle,
      String(booking.amount_kes),
    ])

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Unhandled error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
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

async function resolvePhone(guestPhone: string | null, paymentPhone: string | null, userId: string | null): Promise<string | null> {
  if (guestPhone) return normalisePhone(guestPhone)
  if (paymentPhone) return normalisePhone(paymentPhone)
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
          name: 'booking_confirmation',
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

    console.log('Booking received:', booking.id, '| status:', booking.status)

    if (!['confirmed', 'deposit_paid'].includes(booking.status)) {
      console.log('Skipping — status is not confirmed or deposit_paid')
      return new Response('skipped', { status: 200 })
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('name')
      .eq('id', booking.session_id)
      .single()

    const { data: gym } = await supabase
      .from('gyms')
      .select('name, contact_email')
      .eq('id', booking.gym_id)
      .single()

    console.log('Session:', session?.name, '| Gym:', gym?.name)

    const recipientName = booking.guest_name ?? 'there'
    const date = new Date(booking.booking_date).toLocaleDateString('en-KE', {
      weekday: 'short', day: 'numeric', month: 'short'
    })
    const time = booking.booking_time?.slice(0, 5) ?? ''

    // Partner notification — independent of whether the customer has a phone
    // number, so this runs before the early-return below.
    if (gym?.contact_email) {
      await notifyPartnerByEmail({
        email: gym.contact_email,
        businessName: gym.name ?? 'there',
        sessionName: session?.name ?? 'a session',
        customerName: recipientName,
        sessionDate: date,
        sessionTime: time,
      })
    } else {
      console.log('No contact_email for gym', booking.gym_id, '— skipping partner notification')
    }

    const phone = await resolvePhone(booking.guest_phone, booking.payment_phone, booking.user_id)

    if (!phone) {
      console.error('No phone number found for booking', booking.id)
      return new Response('no phone', { status: 200 })
    }

    console.log('Sending to:', phone)

    const result = await sendWhatsApp(phone, [
      recipientName,
      session?.name ?? 'your session',
      gym?.name ?? 'the venue',
      date,
      time,
      String(booking.deposit_amount),
      String(booking.remainder_amount),
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
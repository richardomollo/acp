// Shared WhatsApp Cloud API (Meta Graph API) helper. Extracted from the
// near-identical logic duplicated across notify-booking, notify-experience-booking,
// notify-pt-booking and notify-pt-client-event — new call sites should use this;
// existing ones are left as-is (out of scope to refactor).

export function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-]/g, '')
  if (cleaned.startsWith('+')) return cleaned.slice(1)
  if (cleaned.startsWith('0')) return '254' + cleaned.slice(1)
  return cleaned
}

export async function sendWhatsAppTemplate(to: string, templateName: string, variables: string[]) {
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
          components: [{
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: v })),
          }],
        },
      }),
    }
  )
  const json = await res.json()
  console.log('WhatsApp API response:', JSON.stringify(json))
  return json
}

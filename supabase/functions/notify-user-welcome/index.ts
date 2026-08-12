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
    const user = payload.record as { id: string; email: string; name: string | null }

    console.log('notify-user-welcome:', user?.id)

    if (!user?.email) {
      return new Response('no email', { status: 200 })
    }

    await sendEmail('customer_welcome', {
      email: user.email,
      name: user.name ?? 'there',
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('notify-user-welcome error:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

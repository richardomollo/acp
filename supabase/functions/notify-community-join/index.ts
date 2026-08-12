import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

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
    const member = payload.record as { community_id: string; user_id: string; role: string; status: string }

    console.log('notify-community-join:', member?.community_id, member?.user_id, '| role:', member?.role)

    // Only welcome members joining — the owner's own membership row is
    // created atomically at community-creation time, not a "join".
    if (member.role !== 'member' || member.status !== 'active') {
      return new Response('not a member join', { status: 200 })
    }

    const [{ data: user }, { data: community }] = await Promise.all([
      supabase.from('users').select('name, email').eq('id', member.user_id).single(),
      supabase.from('communities').select('name, slug').eq('id', member.community_id).single(),
    ])

    if (!user?.email || !community) {
      console.warn('Missing user email or community for join notification', member)
      return new Response('missing data', { status: 200 })
    }

    await sendEmail('community_welcome', {
      email: user.email,
      name: user.name ?? 'there',
      communityName: community.name,
      communityUrl: `https://activecitypass.com/community/${community.slug ?? member.community_id}`,
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('notify-community-join error:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

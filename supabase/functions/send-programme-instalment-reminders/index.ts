import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called daily by a pg_cron job (see 20260828000003_programme_instalment_reminders_cron.sql).
// Finds gym_programme_instalments due within REMINDER_WINDOW_DAYS with no
// reminder sent yet, emails + pushes once, tracked via reminder_sent_at —
// same "requested once, tracked separately from paid" shape as
// bookings.feedback_requested_at.

const REMINDER_WINDOW_DAYS = 3

async function sendEmail(type: string, data: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ type, data }),
  })
  if (!res.ok) console.error(`send-email (${type}) error:`, JSON.stringify(await res.json()))
}

async function sendExpoPush(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) return
  const messages = tokens.map(to => ({ to, title, body, sound: 'default', data: { type: 'programme_instalment_reminder' } }))
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  if (!res.ok) console.error('Expo push error:', JSON.stringify(await res.json()))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const secret = req.headers.get('x-cron-secret')
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const todayStr = new Date().toISOString().slice(0, 10)
  const windowEndStr = new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: instalments, error: instErr } = await admin
    .from('gym_programme_instalments')
    .select(`
      id, amount_kes, due_date, enrollment_id,
      gym_programme_enrollments!enrollment_id(id, user_id, guest_name, guest_email, programme_id,
        gym_programmes!programme_id(title, gyms!gym_id(name)))
    `)
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .gte('due_date', todayStr)
    .lte('due_date', windowEndStr)

  if (instErr) {
    console.error('instalments query error:', instErr.message)
    return Response.json({ error: instErr.message }, { status: 500, headers: CORS })
  }

  let requested = 0

  const userIds = [...new Set(
    (instalments ?? [])
      .map(i => (Array.isArray(i.gym_programme_enrollments) ? i.gym_programme_enrollments[0] : i.gym_programme_enrollments)?.user_id)
      .filter(Boolean)
  )]
  const usersById = new Map<string, { name: string | null; email: string | null }>()
  if (userIds.length > 0) {
    const { data: users } = await admin.from('users').select('id, name, email').in('id', userIds)
    for (const u of users ?? []) usersById.set(u.id, u)
  }

  for (const inst of instalments ?? []) {
    const enrollment = Array.isArray(inst.gym_programme_enrollments) ? inst.gym_programme_enrollments[0] : inst.gym_programme_enrollments
    if (!enrollment) continue
    const programme = Array.isArray(enrollment.gym_programmes) ? enrollment.gym_programmes[0] : enrollment.gym_programmes
    const gym = programme ? (Array.isArray(programme.gyms) ? programme.gyms[0] : programme.gyms) : null
    const user = enrollment.user_id ? usersById.get(enrollment.user_id) : null
    const email = enrollment.guest_email ?? user?.email ?? null
    const name = enrollment.guest_name ?? user?.name ?? 'there'

    if (email) {
      await sendEmail('programme_instalment_reminder', {
        email, name,
        programmeName: programme?.title ?? 'your programme',
        venueName: gym?.name ?? 'the venue',
        amount: Number(inst.amount_kes),
        dueDate: inst.due_date,
      })
    }

    if (enrollment.user_id) {
      const { data: tokenRows } = await admin
        .from('user_push_tokens')
        .select('expo_push_token')
        .eq('user_id', enrollment.user_id)
        .eq('active', true)
      const tokens = (tokenRows ?? []).map(r => r.expo_push_token)
      await sendExpoPush(
        tokens,
        'Programme instalment due soon',
        `KES ${Number(inst.amount_kes).toLocaleString()} for ${programme?.title ?? 'your programme'} is due ${inst.due_date}.`
      )
    }

    await admin.from('gym_programme_instalments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', inst.id)
    requested++
  }

  return Response.json({ requested }, { headers: CORS })
})

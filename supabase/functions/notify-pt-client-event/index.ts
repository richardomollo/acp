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
  console.log(`WhatsApp (${templateName}) response:`, JSON.stringify(json))
  return json
}

async function getUserPhoneAndName(userId: string): Promise<{ phone: string | null; name: string }> {
  const { data } = await supabase.from('users').select('phone, name').eq('id', userId).single()
  return { phone: data?.phone ?? null, name: data?.name ?? 'there' }
}

async function getPushTokens(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .eq('active', true)
  return (data ?? []).map(r => r.expo_push_token)
}

async function sendExpoPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  if (tokens.length === 0) return
  const messages = tokens.map(to => ({ to, title, body, sound: 'default', data }))
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  const json = await res.json()
  console.log('Expo push response:', JSON.stringify(json))
  return json
}

async function getTrainer(ptId: string): Promise<{ phone: string | null; name: string }> {
  const { data } = await supabase
    .from('personal_trainers')
    .select('phone, full_name, professional_name')
    .eq('id', ptId)
    .single()
  return { phone: data?.phone ?? null, name: data?.professional_name ?? data?.full_name ?? 'Your trainer' }
}

// Phase 4.6 — an employed professional (gym_trainers). No public/professional
// name, just their full name; fall back to a neutral label.
async function getGymTrainer(gymTrainerId: string): Promise<{ phone: string | null; name: string }> {
  const { data } = await supabase
    .from('gym_trainers')
    .select('phone, full_name')
    .eq('id', gymTrainerId)
    .single()
  return { phone: data?.phone ?? null, name: data?.full_name ?? 'Your coach' }
}

function formatDueDate(due: string | null): string {
  if (!due) return 'No due date'
  return new Date(due + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const { type, record } = payload
    console.log('notify-pt-client-event called:', type)

    // ── A trainer invited this client (only fires when the invited person
    // already has an account — code-based invites for brand-new clients have
    // no contact info on file, since the PT shares that code out of band) ──
    if (type === 'invite_received') {
      const row = record as { pt_id: string; client_user_id: string }
      const [client, trainer] = await Promise.all([
        getUserPhoneAndName(row.client_user_id),
        getTrainer(row.pt_id),
      ])
      if (!client.phone) { console.warn('No client phone — skipping'); return new Response('no phone', { status: 200 }) }
      await sendWhatsApp(normalisePhone(client.phone), 'client_invite_received', [client.name, trainer.name])
    }

    // ── The client accepted a pending invite ──────────────────────────
    if (type === 'invite_accepted') {
      const row = record as { pt_id: string; client_user_id: string }
      const [client, trainer] = await Promise.all([
        getUserPhoneAndName(row.client_user_id),
        getTrainer(row.pt_id),
      ])
      if (!trainer.phone) { console.warn('No trainer phone — skipping'); return new Response('no phone', { status: 200 }) }
      await sendWhatsApp(normalisePhone(trainer.phone), 'client_invite_accepted', [trainer.name, client.name])
    }

    // ── A trainer assigned this client a task ─────────────────────────
    if (type === 'task_assigned') {
      const row = record as { pt_id: string; client_user_id: string; title: string; due_date: string | null }
      const [client, trainer, pushTokens] = await Promise.all([
        getUserPhoneAndName(row.client_user_id),
        getTrainer(row.pt_id),
        getPushTokens(row.client_user_id),
      ])
      await sendExpoPush(
        pushTokens,
        `New task from ${trainer.name}`,
        row.title,
        { type: 'task_assigned', clientUserId: row.client_user_id },
      )
      if (client.phone) {
        await sendWhatsApp(normalisePhone(client.phone), 'client_task_assigned', [trainer.name, row.title, formatDueDate(row.due_date)])
      } else {
        console.warn('No client phone — skipped WhatsApp')
      }
    }

    // ── A trainer assigned this client a workout ───────────────────────
    if (type === 'workout_assigned') {
      const row = record as { assigned_by: string; user_id: string; title: string }
      const [client, trainer, pushTokens] = await Promise.all([
        getUserPhoneAndName(row.user_id),
        getTrainer(row.assigned_by),
        getPushTokens(row.user_id),
      ])
      await sendExpoPush(
        pushTokens,
        `New workout from ${trainer.name}`,
        row.title,
        { type: 'workout_assigned', userId: row.user_id },
      )
      if (client.phone) {
        await sendWhatsApp(normalisePhone(client.phone), 'client_workout_assigned', [trainer.name, row.title])
      } else {
        console.warn('No client phone — skipped WhatsApp')
      }
    }

    // ── Phase 4.5: a professional COMPLETED a session ─────────────────
    // ONE notification per session (the DB trigger sets notified_at as the
    // idempotency guard and never re-fires). Session-attributed client_tasks
    // are suppressed at the trigger, so this replaces N task_assigned pushes.
    if (type === 'session_completed') {
      const row = record as {
        personal_trainer_id: string | null
        gym_trainer_id: string | null
        client_user_id: string
        focus: string | null
      }
      const resolveAuthor = row.personal_trainer_id
        ? getTrainer(row.personal_trainer_id)
        : row.gym_trainer_id
          ? getGymTrainer(row.gym_trainer_id)
          : Promise.resolve({ phone: null, name: 'Your coach' })
      const [trainer, pushTokens] = await Promise.all([
        resolveAuthor,
        getPushTokens(row.client_user_id),
      ])
      await sendExpoPush(
        pushTokens,
        `${trainer.name} added notes from today's session`,
        row.focus ? `Focus: ${row.focus}` : 'Tap to see your summary and next steps.',
        { type: 'session_completed', clientUserId: row.client_user_id },
      )
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-pt-client-event error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

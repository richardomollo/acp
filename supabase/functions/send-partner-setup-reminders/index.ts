import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called daily by a pg_cron job (see 20260823000001_partner_setup_reminders.sql).
// Finds active gyms with no cover photo and/or no sessions/experiences,
// approved at least 3 days ago, that haven't been reminded in the last 14
// days, and sends a setup-nudge email. Keeps firing every 14 days until the
// gym is complete — there's no "read" state, so recurrence is just "still
// incomplete at the next eligible check".

const GRACE_DAYS = 3
const REMINDER_INTERVAL_DAYS = 14

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

  const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const reminderCutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error: candidatesErr } = await admin
    .from('gyms')
    .select('id, name, image_url, contact_email')
    .eq('is_active', true)
    .lte('created_at', graceCutoff)
    .or(`setup_reminder_sent_at.is.null,setup_reminder_sent_at.lte.${reminderCutoff}`)

  if (candidatesErr) {
    console.error('candidates query error:', candidatesErr.message)
    return Response.json({ error: candidatesErr.message }, { status: 500, headers: CORS })
  }

  let checked = 0
  let emailed = 0

  for (const gym of candidates ?? []) {
    checked++

    const [{ count: sessionCount }, { count: experienceCount }] = await Promise.all([
      admin.from('sessions').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
      admin.from('experiences').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
    ])

    const missingPhoto = !gym.image_url
    const missingOfferings = (sessionCount ?? 0) === 0 && (experienceCount ?? 0) === 0

    if (!missingPhoto && !missingOfferings) continue // fully set up, nothing to nag about
    if (!gym.contact_email) continue

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        type: 'partner_setup_incomplete',
        data: {
          email: gym.contact_email,
          businessName: gym.name,
          missingPhoto,
          missingOfferings,
          dashboardUrl: 'https://activecitypass.com/partner-dashboard',
        },
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      console.error(`send-email error for gym ${gym.id}:`, JSON.stringify(json))
      continue
    }

    await admin.from('gyms').update({ setup_reminder_sent_at: new Date().toISOString() }).eq('id', gym.id)
    emailed++
  }

  return Response.json({ checked, emailed }, { headers: CORS })
})

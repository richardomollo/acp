import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called by a Supabase cron job every 15 minutes.
// Marks deposit_paid bookings as no_show when session end time + grace period has passed.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // Require internal secret to prevent unauthorised triggering
  const secret = req.headers.get('x-cron-secret')
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()

  // Find deposit_paid bookings whose session ended + grace period has elapsed
  // session end = booking_date + booking_time + duration_minutes + no_show_grace_mins
  const { data: bookings, error } = await admin
    .from('bookings')
    .select(`
      id,
      booking_date,
      booking_time,
      sessions!session_id(duration_minutes),
      gyms!gym_id(no_show_grace_mins)
    `)
    .eq('status', 'deposit_paid')

  if (error) {
    console.error('mark-no-shows fetch error:', error)
    return Response.json({ error: error.message }, { status: 500, headers: CORS })
  }

  const toMark: string[] = []

  for (const b of bookings ?? []) {
    const session = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions
    const gym = Array.isArray(b.gyms) ? b.gyms[0] : b.gyms
    const durationMins: number = session?.duration_minutes ?? 60
    const graceMins: number = gym?.no_show_grace_mins ?? 15

    // Parse session start from booking_date + booking_time
    const startStr = `${b.booking_date}T${b.booking_time}`
    const start = new Date(startStr)
    if (isNaN(start.getTime())) continue

    const cutoff = new Date(start.getTime() + (durationMins + graceMins) * 60 * 1000)
    if (now > cutoff) {
      toMark.push(b.id)
    }
  }

  if (toMark.length > 0) {
    const { error: upErr } = await admin
      .from('bookings')
      .update({ status: 'no_show', updated_at: now.toISOString() })
      .in('id', toMark)

    if (upErr) {
      console.error('mark-no-shows update error:', upErr)
      return Response.json({ error: upErr.message }, { status: 500, headers: CORS })
    }
  }

  return Response.json({ marked: toMark.length, checked: (bookings ?? []).length }, { headers: CORS })
})

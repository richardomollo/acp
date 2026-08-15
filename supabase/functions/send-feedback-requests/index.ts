import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called daily by a pg_cron job (see 20260827000002_feedback_requests_cron.sql).
// A few hours after a session/experience/community event ends, sends a
// one-time feedback request (email + push) to anyone confirmed/checked-in/
// completed (or 'going' for community events), tracked via
// feedback_requested_at so nobody is prompted twice. Bounded to events that
// ended within the last LOOKBACK_HOURS so the first run of this job doesn't
// mass-email every past booking that predates this feature.
//
// Session/experience/event times are stored as Nairobi wall-clock time with
// no timezone column, so they're interpreted as Africa/Nairobi (UTC+3) here.

const MIN_HOURS_AFTER_END = 3
const LOOKBACK_HOURS = 72
const NAIROBI_OFFSET = '+03:00'

export function eventInstant(dateStr: string, timeStr: string): number {
  return new Date(`${dateStr}T${timeStr.slice(0, 8)}${NAIROBI_OFFSET}`).getTime()
}

export function isDue(dateStr: string, timeStr: string, now: number): boolean {
  const hoursSince = (now - eventInstant(dateStr, timeStr)) / (1000 * 60 * 60)
  return hoursSince >= MIN_HOURS_AFTER_END && hoursSince <= LOOKBACK_HOURS
}

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
  const messages = tokens.map(to => ({ to, title, body, sound: 'default', data: { type: 'feedback_request' } }))
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  if (!res.ok) console.error('Expo push error:', JSON.stringify(await res.json()))
}

async function pushFeedbackRequest(admin: SupabaseClient, userId: string, activityName: string) {
  const { data: tokenRows } = await admin
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .eq('active', true)
  const tokens = (tokenRows ?? []).map(r => r.expo_push_token)
  await sendExpoPush(tokens, 'How was it?', `Tell us about ${activityName} — takes 30 seconds.`)
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

  const now = Date.now()
  const todayStr = new Date(now).toISOString().slice(0, 10)
  const earliestDateStr = new Date(now - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10)

  let requested = 0

  // ── Sessions ──
  const { data: bookings, error: bookingsErr } = await admin
    .from('bookings')
    .select(`
      id, booking_date, booking_time, confirmation_code, guest_name, guest_email, user_id,
      sessions!session_id(name), users!user_id(name, email)
    `)
    .in('status', ['confirmed', 'checked_in', 'completed'])
    .is('feedback_requested_at', null)
    .gte('booking_date', earliestDateStr)
    .lte('booking_date', todayStr)

  if (bookingsErr) console.error('bookings query error:', bookingsErr.message)

  for (const b of bookings ?? []) {
    if (!isDue(b.booking_date, b.booking_time, now)) continue
    const session = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions
    const user = Array.isArray(b.users) ? b.users[0] : b.users
    const activityName = session?.name ?? 'your session'
    const email = b.guest_email ?? user?.email ?? null
    const link = `https://activecitypass.com/feedback/session/${b.id}?code=${b.confirmation_code}`

    if (email) await sendEmail('feedback_request', { email, name: b.guest_name ?? user?.name ?? 'there', activityName, link })
    if (b.user_id) await pushFeedbackRequest(admin, b.user_id, activityName)
    await admin.from('bookings').update({ feedback_requested_at: new Date().toISOString() }).eq('id', b.id)
    requested++
  }

  // ── Experiences (date lives on the parent experiences row) ──
  const { data: experiences, error: expErr } = await admin
    .from('experiences')
    .select('id, name, date, start_time, end_time')
    .gte('date', earliestDateStr)
    .lte('date', todayStr)

  if (expErr) console.error('experiences query error:', expErr.message)

  const expIds = (experiences ?? []).map(e => e.id)
  if (expIds.length > 0) {
    const expById = new Map((experiences ?? []).map(e => [e.id, e]))

    const { data: expBookings, error: expBookingsErr } = await admin
      .from('experience_bookings')
      .select('id, experience_id, confirmation_code, guest_name, email, user_id')
      .in('experience_id', expIds)
      .in('status', ['confirmed', 'checked_in', 'completed'])
      .is('feedback_requested_at', null)

    if (expBookingsErr) console.error('experience_bookings query error:', expBookingsErr.message)

    const expUserIds = [...new Set((expBookings ?? []).map(b => b.user_id).filter(Boolean))]
    const expUsersById = new Map<string, { name: string | null; email: string | null }>()
    if (expUserIds.length > 0) {
      const { data: expUsers } = await admin.from('users').select('id, name, email').in('id', expUserIds)
      for (const u of expUsers ?? []) expUsersById.set(u.id, u)
    }

    for (const b of expBookings ?? []) {
      const exp = expById.get(b.experience_id)
      if (!exp) continue
      if (!isDue(exp.date, exp.end_time ?? exp.start_time, now)) continue
      const user = b.user_id ? expUsersById.get(b.user_id) : null
      const activityName = exp.name
      const email = b.email ?? user?.email ?? null
      const link = `https://activecitypass.com/feedback/experience/${b.id}?code=${b.confirmation_code}`

      if (email) await sendEmail('feedback_request', { email, name: b.guest_name ?? user?.name ?? 'there', activityName, link })
      if (b.user_id) await pushFeedbackRequest(admin, b.user_id, activityName)
      await admin.from('experience_bookings').update({ feedback_requested_at: new Date().toISOString() }).eq('id', b.id)
      requested++
    }
  }

  // ── Community events (date lives on the parent community_events row) ──
  const { data: events, error: eventsErr } = await admin
    .from('community_events')
    .select('id, title, date, start_time, end_time')
    .gte('date', earliestDateStr)
    .lte('date', todayStr)

  if (eventsErr) console.error('community_events query error:', eventsErr.message)

  const eventIds = (events ?? []).map(e => e.id)
  if (eventIds.length > 0) {
    const eventById = new Map((events ?? []).map(e => [e.id, e]))

    const { data: attendees, error: attendeesErr } = await admin
      .from('community_event_attendees')
      .select('id, event_id, confirmation_code, user_id')
      .in('event_id', eventIds)
      .eq('status', 'going')
      .is('feedback_requested_at', null)

    if (attendeesErr) console.error('community_event_attendees query error:', attendeesErr.message)

    const attUserIds = [...new Set((attendees ?? []).map(a => a.user_id).filter(Boolean))]
    const attUsersById = new Map<string, { name: string | null; email: string | null }>()
    if (attUserIds.length > 0) {
      const { data: attUsers } = await admin.from('users').select('id, name, email').in('id', attUserIds)
      for (const u of attUsers ?? []) attUsersById.set(u.id, u)
    }

    for (const a of attendees ?? []) {
      const event = eventById.get(a.event_id)
      if (!event) continue
      if (!isDue(event.date, event.end_time ?? event.start_time, now)) continue
      const user = attUsersById.get(a.user_id)
      const activityName = event.title
      const link = `https://activecitypass.com/feedback/community_event/${a.id}?code=${a.confirmation_code}`

      if (user?.email) await sendEmail('feedback_request', { email: user.email, name: user.name ?? 'there', activityName, link })
      await pushFeedbackRequest(admin, a.user_id, activityName)
      await admin.from('community_event_attendees').update({ feedback_requested_at: new Date().toISOString() }).eq('id', a.id)
      requested++
    }
  }

  return Response.json({ requested }, { headers: CORS })
})

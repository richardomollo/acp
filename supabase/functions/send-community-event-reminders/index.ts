import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called daily by a pg_cron job (see 20260812000004_community_event_reminders.sql).
// Finds community_event_attendees 3 or 1 day(s) out and sends an email reminder.
// Mirrors send-booking-reminders' structure/idempotency pattern, simplified:
// community events are free or pay-in-full (no deposit/balance concept).

export function targetDateStr(daysOut: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysOut)
  return d.toISOString().slice(0, 10)
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatTime(timeStr: string | null | undefined): string {
  return timeStr ? timeStr.slice(0, 5) : ''
}

const WINDOWS: { daysOut: number; column: 'reminder_3d_sent_at' | 'reminder_1d_sent_at' }[] = [
  { daysOut: 3, column: 'reminder_3d_sent_at' },
  { daysOut: 1, column: 'reminder_1d_sent_at' },
]

if (import.meta.main) {
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const secret = req.headers.get('x-cron-secret')
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let processed = 0
  let emailed = 0

  for (const { daysOut, column } of WINDOWS) {
    const date = targetDateStr(daysOut)

    const { data: events, error: eventsErr } = await admin
      .from('community_events')
      .select('id, title, date, start_time, location, communities(name)')
      .eq('date', date)
      .eq('status', 'active')

    if (eventsErr) console.error('community_events query error:', eventsErr.message)

    const eventIds = (events ?? []).map(e => e.id)
    if (eventIds.length === 0) continue
    const eventById = new Map((events ?? []).map(e => [e.id, e]))

    const { data: attendees, error: attendeesErr } = await admin
      .from('community_event_attendees')
      .select('id, event_id, user_id, confirmation_code')
      .in('event_id', eventIds)
      .eq('status', 'going')
      .is(column, null)

    if (attendeesErr) console.error('community_event_attendees query error:', attendeesErr.message)

    const userIds = [...new Set((attendees ?? []).map(a => a.user_id))]
    const emailById = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: users } = await admin.from('users').select('id, name, email').in('id', userIds)
      for (const u of users ?? []) if (u.email) emailById.set(u.id, u.email)
    }

    for (const a of attendees ?? []) {
      const event = eventById.get(a.event_id) as any
      const community = Array.isArray(event?.communities) ? event.communities[0] : event?.communities
      const email = emailById.get(a.user_id)

      if (email) {
        try {
          const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({
              type: 'booking_reminder',
              data: {
                bookingId: a.id,
                email,
                customerName: 'there',
                activityName: `${event?.title ?? 'your event'} (${community?.name ?? 'Community'})`,
                venueName: event?.location ?? 'the venue',
                venueLocation: null,
                activityDate: formatDate(event?.date ?? date),
                activityTime: formatTime(event?.start_time),
                confirmationCode: a.confirmation_code,
                daysOut,
                isDepositOnly: false,
                remainderAmount: null,
                isGuest: true,
              },
            }),
          })
          if (res.ok) emailed++
          else console.error('Reminder email failed:', a.id, res.status, await res.text())
        } catch (err) {
          console.error('Reminder email threw (non-fatal):', a.id, (err as Error).message)
        }
      }

      await admin.from('community_event_attendees').update({ [column]: new Date().toISOString() }).eq('id', a.id)
      processed++
    }
  }

  return Response.json({ processed, emailed }, { headers: CORS })
})
}

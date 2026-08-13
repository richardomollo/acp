import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called daily by a pg_cron job (see 20260825000001_community_engagement_reminders.sql).
// For each active community member not reminded in the last 4 days, finds
// upcoming events they haven't RSVP'd to and active challenges they haven't
// engaged with (no matching activity yet — same logic as challenges.tsx's
// live progress calc), and sends one combined digest (email + push) if
// there's anything to remind about. Keeps firing every 4 days until the
// member has caught up on everything.

const REMINDER_INTERVAL_DAYS = 4

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })

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

async function sendExpoPush(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) return
  const messages = tokens.map(to => ({ to, title, body, sound: 'default', data: { type: 'community_engagement_reminder' } }))
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  const json = await res.json()
  if (!res.ok) console.error('Expo push error:', JSON.stringify(json))
  return json
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
  const cadenceCutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 1. Active memberships in approved/active communities, grouped by user.
  const { data: memberships, error: memErr } = await admin
    .from('community_members')
    .select('user_id, community_id, communities!inner(name, slug, review_status, is_active)')
    .eq('status', 'active')
    .eq('communities.review_status', 'approved')
    .eq('communities.is_active', true)

  if (memErr) {
    console.error('memberships query error:', memErr.message)
    return Response.json({ error: memErr.message }, { status: 500, headers: CORS })
  }

  const communitiesByUser = new Map<string, { id: string; name: string; slug: string | null }[]>()
  for (const m of memberships ?? []) {
    const c = m.communities as any
    const list = communitiesByUser.get(m.user_id) ?? []
    list.push({ id: m.community_id, name: c.name, slug: c.slug })
    communitiesByUser.set(m.user_id, list)
  }

  if (communitiesByUser.size === 0) {
    return Response.json({ checked: 0, emailed: 0 }, { headers: CORS })
  }

  // 2. Of those users, which are cadence-eligible (never reminded, or >=4 days ago)?
  const { data: users, error: usersErr } = await admin
    .from('users')
    .select('id, name, email')
    .in('id', [...communitiesByUser.keys()])
    .or(`community_reminder_sent_at.is.null,community_reminder_sent_at.lte.${cadenceCutoff}`)

  if (usersErr) {
    console.error('users query error:', usersErr.message)
    return Response.json({ error: usersErr.message }, { status: 500, headers: CORS })
  }

  let checked = 0
  let emailed = 0

  for (const user of users ?? []) {
    checked++
    const communities = communitiesByUser.get(user.id) ?? []
    const communityIds = communities.map(c => c.id)
    const communityById = new Map(communities.map(c => [c.id, c]))

    // ── Upcoming events not RSVP'd to ──
    const { data: events } = await admin
      .from('community_events')
      .select('id, slug, title, date, start_time, community_id')
      .in('community_id', communityIds)
      .eq('status', 'active')
      .gte('date', todayStr)
      .order('date', { ascending: true })

    let missingEvents: { title: string; communityName: string; dateLabel: string; url: string }[] = []
    if (events && events.length > 0) {
      const { data: attendeeRows } = await admin
        .from('community_event_attendees')
        .select('event_id, status')
        .eq('user_id', user.id)
        .in('event_id', events.map(e => e.id))
      const engaged = new Set((attendeeRows ?? []).filter(a => a.status !== 'cancelled').map(a => a.event_id))
      missingEvents = events
        .filter(e => !engaged.has(e.id))
        .slice(0, 5)
        .map(e => {
          const community = communityById.get(e.community_id)!
          return {
            title: e.title,
            communityName: community.name,
            dateLabel: fmtDate(e.date),
            url: `https://activecitypass.com/community/${community.slug ?? community.id}/event/${e.slug ?? e.id}`,
          }
        })
    }

    // ── Active challenges with no matching activity yet ──
    const { data: challenges } = await admin
      .from('challenges')
      .select('id, title, activity_types, period_start, period_end, community_id')
      .in('community_id', communityIds)
      .eq('is_active', true)

    let missingChallenges: { title: string; communityName: string; url: string }[] = []
    if (challenges && challenges.length > 0) {
      const { data: activities } = await admin
        .from('activities')
        .select('activity_type, start_time')
        .eq('user_id', user.id)
      missingChallenges = challenges
        .filter(c => !(activities ?? []).some(a =>
          (c.activity_types ?? []).includes(a.activity_type) &&
          a.start_time.slice(0, 10) >= c.period_start &&
          a.start_time.slice(0, 10) <= c.period_end
        ))
        .slice(0, 5)
        .map(c => {
          const community = communityById.get(c.community_id)!
          return {
            title: c.title,
            communityName: community.name,
            url: `https://activecitypass.com/community/${community.slug ?? community.id}/challenge/${c.id}`,
          }
        })
    }

    if (missingEvents.length === 0 && missingChallenges.length === 0) continue // fully caught up, nothing to nag about

    if (user.email) {
      await sendEmail('community_engagement_reminder', {
        email: user.email,
        name: user.name ?? 'there',
        events: missingEvents,
        challenges: missingChallenges,
      })
    }

    const { data: tokenRows } = await admin
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', user.id)
      .eq('active', true)
    const tokens = (tokenRows ?? []).map(r => r.expo_push_token)
    if (tokens.length > 0) {
      const parts: string[] = []
      if (missingEvents.length) parts.push(`${missingEvents.length} event${missingEvents.length > 1 ? 's' : ''}`)
      if (missingChallenges.length) parts.push(`${missingChallenges.length} challenge${missingChallenges.length > 1 ? 's' : ''}`)
      await sendExpoPush(tokens, 'Your communities are moving without you', `You have ${parts.join(' and ')} waiting for you.`)
    }

    await admin.from('users').update({ community_reminder_sent_at: new Date().toISOString() }).eq('id', user.id)
    emailed++
  }

  return Response.json({ checked, emailed }, { headers: CORS })
})

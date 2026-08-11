import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OAUTH_BASE = 'https://www.strava.com/oauth'
const API_BASE = 'https://www.strava.com/api/v3'

// Activities older than this are never imported by an initial backfill.
const BACKFILL_DAYS = 30
// Refresh the access token if it expires within this many seconds.
const EXPIRY_BUFFER_SECONDS = 300

function getClientCredentials() {
  const clientId = Deno.env.get('STRAVA_CLIENT_ID')
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Missing Strava env vars (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET)')
  }
  return { clientId, clientSecret }
}

// ─── Sport type mapping ─────────────────────────────────────────────────────
// Strava's `type` field is deprecated in favour of `sport_type` (more granular
// values, e.g. TrailRun/VirtualRun vs just "Run"). We map the current field
// and collapse variants into ACP's three prioritised outdoor activity types.
// Anything outside run/walk/cycle is intentionally not imported (MVP scope —
// "avoid storing unnecessary Strava data").
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun'])
const WALK_TYPES = new Set(['Walk', 'Hike'])
const CYCLE_TYPES = new Set(['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide', 'Velomobile'])

export type AcpActivityType = 'run' | 'walk' | 'cycle'

export function mapSportType(sportType: string | null | undefined): AcpActivityType | null {
  if (!sportType) return null
  if (RUN_TYPES.has(sportType)) return 'run'
  if (WALK_TYPES.has(sportType)) return 'walk'
  if (CYCLE_TYPES.has(sportType)) return 'cycle'
  return null
}

// ─── Fetch wrapper with 429 backoff ────────────────────────────────────────
// Mirrors the retry-on-429/403 pattern already used for ExerciseDB calls
// elsewhere in this codebase, for consistency.
async function stravaFetch(url: string, init: RequestInit, retried = false): Promise<Response> {
  const res = await fetch(url, init)
  if ((res.status === 429 || res.status === 403) && !retried) {
    await new Promise((r) => setTimeout(r, 800))
    return stravaFetch(url, init, true)
  }
  return res
}

// ─── OAuth token exchange / refresh ────────────────────────────────────────

export interface StravaTokenResult {
  accessToken: string
  refreshToken: string
  expiresAt: number // unix seconds
  athleteId: number
  scope?: string
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResult> {
  const { clientId, clientSecret } = getClientCredentials()
  const res = await stravaFetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json().catch(() => ({})) as any
  if (!res.ok) {
    throw new Error(data?.message ?? `Strava token exchange failed (${res.status})`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id,
  }
}

async function refreshAccessToken(refreshToken: string): Promise<StravaTokenResult> {
  const { clientId, clientSecret } = getClientCredentials()
  const res = await stravaFetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json().catch(() => ({})) as any
  if (!res.ok) {
    throw new Error(data?.message ?? `Strava token refresh failed (${res.status})`)
  }
  // Strava issues a NEW refresh_token on every refresh — the old one stops working.
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: 0, // not returned on refresh; caller already knows the athlete
  }
}

export async function deauthorize(accessToken: string): Promise<void> {
  try {
    await stravaFetch(`${OAUTH_BASE}/deauthorize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (e) {
    // Best-effort — disconnect must succeed locally even if Strava's side fails.
    console.error('[strava] deauthorize failed:', e)
  }
}

/**
 * Returns a valid (non-expired) access token for the user, refreshing and
 * persisting a new one first if needed. Returns null if the user has no
 * Strava connection.
 */
export async function getValidAccessToken(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: conn, error } = await admin
    .from('strava_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !conn) return null

  const expiresAtSeconds = Math.floor(new Date(conn.expires_at).getTime() / 1000)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (expiresAtSeconds - nowSeconds > EXPIRY_BUFFER_SECONDS) {
    return conn.access_token
  }

  const refreshed = await refreshAccessToken(conn.refresh_token)
  await admin
    .from('strava_connections')
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      expires_at: new Date(refreshed.expiresAt * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return refreshed.accessToken
}

// ─── Activity fetch + mapping ───────────────────────────────────────────────

interface StravaActivity {
  id: number
  name: string
  sport_type: string
  start_date: string
  elapsed_time: number
  moving_time: number
  distance: number
  average_speed: number
  total_elevation_gain: number
  calories?: number
}

export async function fetchStravaActivities(accessToken: string, afterEpochSeconds: number): Promise<StravaActivity[]> {
  const url = `${API_BASE}/athlete/activities?after=${afterEpochSeconds}&per_page=50`
  const res = await stravaFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava activities fetch failed (${res.status}): ${body}`)
  }
  return res.json()
}

export async function fetchStravaActivity(accessToken: string, activityId: number): Promise<StravaActivity | null> {
  const res = await stravaFetch(`${API_BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava activity fetch failed (${res.status}): ${body}`)
  }
  return res.json()
}

export function toActivityRow(userId: string, activity: StravaActivity, acpType: AcpActivityType) {
  return {
    user_id: userId,
    source: 'strava',
    external_id: String(activity.id),
    activity_type: acpType,
    name: activity.name ?? null,
    start_time: activity.start_date,
    duration_seconds: Math.round(activity.elapsed_time ?? 0),
    moving_time_seconds: Math.round(activity.moving_time ?? 0),
    distance_meters: activity.distance ?? null,
    avg_speed_mps: activity.average_speed ?? null,
    elevation_gain_meters: activity.total_elevation_gain ?? null,
    calories: activity.calories ?? null,
    updated_at: new Date().toISOString(),
  }
}

// ─── Community event auto-linkage (Phase 2) ────────────────────────────────
// After an activity lands in `activities`, try to match it to an RSVP'd
// community event of the same user so `community_event_attendees.activity_id`
// gets populated automatically — no explicit "verify attendance" step needed.
const EVENT_MATCH_WINDOW_MS = 4 * 60 * 60 * 1000 // ±4 hours

export async function linkActivityToCommunityEvent(
  admin: SupabaseClient,
  activityRow: { id: string; user_id: string; start_time: string },
): Promise<void> {
  const { data: candidates, error } = await admin
    .from('community_event_attendees')
    .select('id, event_id, community_events!inner(date, start_time)')
    .eq('user_id', activityRow.user_id)
    .eq('status', 'going')
    .is('activity_id', null)

  if (error || !candidates?.length) return

  const activityTime = new Date(activityRow.start_time).getTime()
  let best: { id: string; diffMs: number } | null = null

  for (const c of candidates as any[]) {
    const event = c.community_events
    if (!event?.date || !event?.start_time) continue
    const eventTime = new Date(`${event.date}T${event.start_time}`).getTime()
    const diffMs = Math.abs(activityTime - eventTime)
    if (diffMs <= EVENT_MATCH_WINDOW_MS && (!best || diffMs < best.diffMs)) {
      best = { id: c.id, diffMs }
    }
  }

  if (!best) return

  const { error: updateErr } = await admin
    .from('community_event_attendees')
    .update({ activity_id: activityRow.id })
    .eq('id', best.id)
  if (updateErr) console.error('[strava] community event linking failed:', updateErr.message)
}

/**
 * Fetches recent activities for a user and idempotently upserts the
 * prioritised types (run/walk/cycle) into `activities`. Used for both the
 * initial post-connect backfill and the "Sync now" button.
 */
export async function syncActivitiesForUser(
  admin: SupabaseClient,
  userId: string,
  opts: { sinceDays?: number } = {},
): Promise<{ imported: number; skipped: number }> {
  const accessToken = await getValidAccessToken(admin, userId)
  if (!accessToken) return { imported: 0, skipped: 0 }

  const sinceDays = opts.sinceDays ?? BACKFILL_DAYS
  const after = Math.floor(Date.now() / 1000) - sinceDays * 86400
  const activities = await fetchStravaActivities(accessToken, after)

  let imported = 0
  let skipped = 0
  for (const activity of activities) {
    const acpType = mapSportType(activity.sport_type)
    if (!acpType) { skipped++; continue }

    const { data: row, error } = await admin
      .from('activities')
      .upsert(toActivityRow(userId, activity, acpType), { onConflict: 'source,external_id' })
      .select('id, user_id, start_time')
      .single()
    if (error || !row) {
      console.error('[strava] upsert failed for activity', activity.id, error?.message)
      continue
    }
    imported++
    await linkActivityToCommunityEvent(admin, row)
  }

  return { imported, skipped }
}

/** Re-fetches and upserts a single activity (used by webhook create/update events). */
export async function syncSingleActivity(admin: SupabaseClient, userId: string, activityId: number): Promise<void> {
  const accessToken = await getValidAccessToken(admin, userId)
  if (!accessToken) return

  const activity = await fetchStravaActivity(accessToken, activityId)
  if (!activity) return

  const acpType = mapSportType(activity.sport_type)
  if (!acpType) return

  const { data: row, error } = await admin
    .from('activities')
    .upsert(toActivityRow(userId, activity, acpType), { onConflict: 'source,external_id' })
    .select('id, user_id, start_time')
    .single()
  if (error || !row) {
    console.error('[strava] webhook upsert failed for activity', activityId, error?.message)
    return
  }
  await linkActivityToCommunityEvent(admin, row)
}

export async function deleteActivity(admin: SupabaseClient, userId: string, externalId: string): Promise<void> {
  await admin
    .from('activities')
    .delete()
    .eq('source', 'strava')
    .eq('external_id', externalId)
    .eq('user_id', userId)
}

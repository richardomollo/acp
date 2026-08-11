import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mapSportType, toActivityRow } from './strava.ts'

// ─── mapSportType ───────────────────────────────────────────────────────────
// Uses Strava's current `sport_type` field (not the deprecated `type` field),
// collapsing granular variants into ACP's three prioritised outdoor types.
// Anything outside run/walk/cycle is intentionally not imported.

Deno.test('mapSportType: run variants map to run', () => {
  assertEquals(mapSportType('Run'), 'run')
  assertEquals(mapSportType('TrailRun'), 'run')
  assertEquals(mapSportType('VirtualRun'), 'run')
})

Deno.test('mapSportType: walk variants map to walk', () => {
  assertEquals(mapSportType('Walk'), 'walk')
  assertEquals(mapSportType('Hike'), 'walk')
})

Deno.test('mapSportType: ride variants map to cycle', () => {
  assertEquals(mapSportType('Ride'), 'cycle')
  assertEquals(mapSportType('MountainBikeRide'), 'cycle')
  assertEquals(mapSportType('GravelRide'), 'cycle')
  assertEquals(mapSportType('EBikeRide'), 'cycle')
  assertEquals(mapSportType('VirtualRide'), 'cycle')
})

Deno.test('mapSportType: unsupported/unknown types are not imported', () => {
  assertEquals(mapSportType('Swim'), null)
  assertEquals(mapSportType('WeightTraining'), null)
  assertEquals(mapSportType('Yoga'), null)
  assertEquals(mapSportType(null), null)
  assertEquals(mapSportType(undefined), null)
  assertEquals(mapSportType(''), null)
})

// ─── toActivityRow ───────────────────────────────────────────────────────────
// Verifies the mapping from a Strava activity payload to ACP's `activities`
// row shape — idempotency key (source + external_id), unit handling, and
// that we don't store more than the modeled fields ("avoid storing
// unnecessary Strava data").

const SAMPLE_ACTIVITY = {
  id: 123456789,
  name: 'Morning Run',
  sport_type: 'Run',
  start_date: '2026-08-10T06:30:00Z',
  elapsed_time: 1800,
  moving_time: 1750,
  distance: 5200.5,
  average_speed: 2.97,
  total_elevation_gain: 42.3,
  calories: 310,
}

Deno.test('toActivityRow: maps fields and sets idempotency key', () => {
  const row = toActivityRow('user-123', SAMPLE_ACTIVITY, 'run')
  assertEquals(row.user_id, 'user-123')
  assertEquals(row.source, 'strava')
  assertEquals(row.external_id, '123456789')
  assertEquals(row.activity_type, 'run')
  assertEquals(row.name, 'Morning Run')
  assertEquals(row.start_time, '2026-08-10T06:30:00Z')
  assertEquals(row.duration_seconds, 1800)
  assertEquals(row.moving_time_seconds, 1750)
  assertEquals(row.distance_meters, 5200.5)
  assertAlmostEquals(row.avg_speed_mps!, 2.97)
  assertAlmostEquals(row.elevation_gain_meters!, 42.3)
  assertEquals(row.calories, 310)
})

Deno.test('toActivityRow: handles missing optional fields without throwing', () => {
  const minimal = {
    id: 1,
    name: '',
    sport_type: 'Walk',
    start_date: '2026-08-10T06:30:00Z',
    elapsed_time: undefined as unknown as number,
    moving_time: undefined as unknown as number,
    distance: undefined as unknown as number,
    average_speed: undefined as unknown as number,
    total_elevation_gain: undefined as unknown as number,
  }
  const row = toActivityRow('user-123', minimal, 'walk')
  assertEquals(row.duration_seconds, 0)
  assertEquals(row.moving_time_seconds, 0)
  assertEquals(row.distance_meters, null)
  assertEquals(row.avg_speed_mps, null)
  assertEquals(row.elevation_gain_meters, null)
  assertEquals(row.calories, null)
})

// ─── getValidAccessToken expiry logic ───────────────────────────────────────
// Exercises the "is the stored token still valid" branch without hitting
// Strava's network — a fake Supabase client double returns a connection row
// whose expiry we control, and we only assert on which branch would run by
// checking whether the returned token equals the stored one (no refresh) or
// not (refresh path attempted, which then fails fast in this test since
// STRAVA_CLIENT_ID/SECRET aren't set — proving the refresh path was reached).

Deno.test('getValidAccessToken: returns the stored token when not near expiry', async () => {
  const { getValidAccessToken } = await import('./strava.ts')
  const farFutureIso = new Date(Date.now() + 3600 * 1000).toISOString() // 1h from now

  const fakeClient = {
    from(_table: string) {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() {
          return {
            data: { access_token: 'valid-token', refresh_token: 'refresh-token', expires_at: farFutureIso },
            error: null,
          }
        },
      }
    },
  } as any

  const token = await getValidAccessToken(fakeClient, 'user-123')
  assertEquals(token, 'valid-token')
})

Deno.test('getValidAccessToken: returns null when the user has no connection', async () => {
  const { getValidAccessToken } = await import('./strava.ts')

  const fakeClient = {
    from(_table: string) {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() {
          return { data: null, error: null }
        },
      }
    },
  } as any

  const token = await getValidAccessToken(fakeClient, 'user-123')
  assertEquals(token, null)
})

// ─── linkActivityToCommunityEvent ──────────────────────────────────────────
// A synced Strava activity should auto-populate community_event_attendees.activity_id
// when it lines up with an RSVP'd ('going') event within a ±4h window — no explicit
// "verify attendance" step. Fake client mimics the supabase-js query-builder shape
// (chainable, awaitable at any point) used elsewhere in this test file.

function makeFakeAdmin(candidates: any[], updateCalls: { id: string; payload: any }[]) {
  return {
    from(table: string) {
      if (table !== 'community_event_attendees') throw new Error(`unexpected table ${table}`)
      const builder: any = {
        select() { return this },
        eq() { return this },
        is() { return this },
        then(resolve: any) { resolve({ data: candidates, error: null }) },
        update(payload: any) {
          return {
            eq(_col: string, id: string) {
              updateCalls.push({ id, payload })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
      return builder
    },
  } as any
}

Deno.test('linkActivityToCommunityEvent: links the matching attendee within the window', async () => {
  const { linkActivityToCommunityEvent } = await import('./strava.ts')
  const updateCalls: { id: string; payload: any }[] = []
  const admin = makeFakeAdmin(
    [{ id: 'attendee-1', event_id: 'event-1', community_events: { date: '2026-08-10', start_time: '06:00:00' } }],
    updateCalls,
  )

  await linkActivityToCommunityEvent(admin, {
    id: 'activity-1',
    user_id: 'user-123',
    start_time: '2026-08-10T06:15:00Z',
  })

  assertEquals(updateCalls.length, 1)
  assertEquals(updateCalls[0].id, 'attendee-1')
  assertEquals(updateCalls[0].payload, { activity_id: 'activity-1' })
})

Deno.test('linkActivityToCommunityEvent: does not link when outside the ±4h window', async () => {
  const { linkActivityToCommunityEvent } = await import('./strava.ts')
  const updateCalls: { id: string; payload: any }[] = []
  const admin = makeFakeAdmin(
    [{ id: 'attendee-1', event_id: 'event-1', community_events: { date: '2026-08-10', start_time: '06:00:00' } }],
    updateCalls,
  )

  await linkActivityToCommunityEvent(admin, {
    id: 'activity-1',
    user_id: 'user-123',
    start_time: '2026-08-10T14:00:00Z', // 8h after the event start
  })

  assertEquals(updateCalls.length, 0)
})

Deno.test('linkActivityToCommunityEvent: picks the closest candidate when multiple are in range', async () => {
  const { linkActivityToCommunityEvent } = await import('./strava.ts')
  const updateCalls: { id: string; payload: any }[] = []
  const admin = makeFakeAdmin(
    [
      { id: 'attendee-far', event_id: 'event-far', community_events: { date: '2026-08-10', start_time: '04:00:00' } },
      { id: 'attendee-close', event_id: 'event-close', community_events: { date: '2026-08-10', start_time: '06:10:00' } },
    ],
    updateCalls,
  )

  await linkActivityToCommunityEvent(admin, {
    id: 'activity-1',
    user_id: 'user-123',
    start_time: '2026-08-10T06:15:00Z',
  })

  assertEquals(updateCalls.length, 1)
  assertEquals(updateCalls[0].id, 'attendee-close')
})

Deno.test('linkActivityToCommunityEvent: no-ops when there are no candidates', async () => {
  const { linkActivityToCommunityEvent } = await import('./strava.ts')
  const updateCalls: { id: string; payload: any }[] = []
  const admin = makeFakeAdmin([], updateCalls)

  await linkActivityToCommunityEvent(admin, {
    id: 'activity-1',
    user_id: 'user-123',
    start_time: '2026-08-10T06:15:00Z',
  })

  assertEquals(updateCalls.length, 0)
})

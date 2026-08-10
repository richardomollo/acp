import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeCodeForToken, syncActivitiesForUser } from '../_shared/strava.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-strava-callback-secret',
}

// Called server-to-server by apps/web's /api/strava/callback route (never
// directly by Strava, and never with a real user JWT — Strava's redirect
// lands in a browser with no ACP session). Protected by a shared secret
// header, mirroring the existing x-cron-secret pattern used by
// mark-no-shows. verify_jwt=false in config.toml since there is no user JWT
// to check here.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const secret = req.headers.get('x-strava-callback-secret')
  if (!secret || secret !== Deno.env.get('STRAVA_CALLBACK_SECRET')) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS })
  }

  let body: { code?: string; state?: string; error?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }) }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolve + consume the state row first (single-use), regardless of
  // whether the user approved or denied, so we know where to redirect to.
  let platform = 'mobile'
  let returnTo: string | null = null
  let userId: string | null = null

  if (body.state) {
    const { data: stateRow } = await admin
      .from('strava_oauth_states')
      .select('user_id, platform, return_to, created_at')
      .eq('state', body.state)
      .maybeSingle()

    if (stateRow) {
      platform = stateRow.platform
      returnTo = stateRow.return_to
      const ageMs = Date.now() - new Date(stateRow.created_at).getTime()
      // Single-use: delete immediately so a replayed callback can't reuse it.
      await admin.from('strava_oauth_states').delete().eq('state', body.state)
      if (ageMs <= 10 * 60 * 1000) userId = stateRow.user_id
    }
  }

  if (body.error) {
    // User denied permission, or Strava returned some other OAuth error —
    // this is an expected, graceful outcome, not a server error.
    console.log('strava-oauth-callback: user did not complete authorization:', body.error)
    return Response.json({ platform, returnTo, status: 'denied' }, { headers: CORS })
  }

  if (!userId || !body.code) {
    return Response.json({ platform, returnTo, status: 'error', error: 'invalid_or_expired_state' }, { headers: CORS })
  }

  try {
    const token = await exchangeCodeForToken(body.code)
    if (!token.athleteId) throw new Error('Strava did not return an athlete id')

    const { error: upsertErr } = await admin
      .from('strava_connections')
      .upsert({
        user_id: userId,
        strava_athlete_id: token.athleteId,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: new Date(token.expiresAt * 1000).toISOString(),
        scope: 'read,activity:read_all',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertErr) throw new Error(upsertErr.message)

    // Initial backfill, awaited so the user sees their activities immediately
    // on return to the app. Failure here doesn't undo the connection —
    // "Sync now" can retry — so it's logged, not thrown.
    try {
      await syncActivitiesForUser(admin, userId)
    } catch (e) {
      console.error('strava-oauth-callback: initial backfill failed:', e)
    }

    return Response.json({ platform, returnTo, status: 'connected' }, { headers: CORS })
  } catch (e: any) {
    console.error('strava-oauth-callback: token exchange failed:', e.message)
    return Response.json({ platform, returnTo, status: 'error', error: 'token_exchange_failed' }, { headers: CORS })
  }
})

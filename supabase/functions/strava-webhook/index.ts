import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncSingleActivity, deleteActivity } from '../_shared/strava.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Strava's webhook events carry no per-event signature (unlike a typical
// HMAC-signed webhook) — the only inbound verification Strava supports is
// the one-time GET handshake below, matching Strava's current documented
// subscription flow. As defense-in-depth (stronger than this codebase's
// existing mpesa-callback/c2b-confirm, which trust the body outright), we
// never trust the POST body's activity data directly — we only use it to
// know *what to re-fetch*, then call Strava's API back to get the
// authoritative record before writing anything (same pattern already used
// by apps/web/app/api/pesapal/ipn/route.ts).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN') && challenge) {
      return Response.json({ 'hub.challenge': challenge }, { headers: CORS })
    }
    return Response.json({ error: 'Verification failed' }, { status: 403, headers: CORS })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })
  }

  let body: {
    object_type?: string
    object_id?: number
    aspect_type?: string
    owner_id?: number
    updates?: Record<string, string>
  }
  try { body = await req.json() } catch { return Response.json({ received: true }, { headers: CORS }) }

  try {
    if (body.object_type === 'athlete' && body.updates?.authorized === 'false') {
      // User revoked ACP's access directly from Strava — mirror that locally.
      await admin.from('strava_connections').delete().eq('strava_athlete_id', body.owner_id ?? -1)
      return Response.json({ received: true }, { headers: CORS })
    }

    if (body.object_type === 'activity' && body.object_id && body.owner_id) {
      const { data: conn } = await admin
        .from('strava_connections')
        .select('user_id')
        .eq('strava_athlete_id', body.owner_id)
        .maybeSingle()

      if (conn) {
        if (body.aspect_type === 'delete') {
          await deleteActivity(admin, conn.user_id, String(body.object_id))
        } else {
          // 'create' or 'update' — re-fetch from Strava and upsert (idempotent).
          await syncSingleActivity(admin, conn.user_id, body.object_id)
        }
      }
    }
  } catch (e) {
    // Log and still acknowledge — Strava retries on non-2xx, and a transient
    // failure here will self-heal on the next webhook event or manual sync.
    console.error('strava-webhook: processing failed:', e)
  }

  return Response.json({ received: true }, { headers: CORS })
})

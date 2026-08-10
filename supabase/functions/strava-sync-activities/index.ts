import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncActivitiesForUser } from '../_shared/strava.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// User-triggered "Sync now". Looks back further than a typical webhook-driven
// update (90 days) so a manual sync can also catch up after a long gap
// (e.g. token expired and sat disconnected for a while).
const MANUAL_SYNC_LOOKBACK_DAYS = 90

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: conn } = await admin
    .from('strava_connections')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conn) {
    return Response.json({ error: 'Strava is not connected' }, { status: 409, headers: CORS })
  }

  try {
    const result = await syncActivitiesForUser(admin, user.id, { sinceDays: MANUAL_SYNC_LOOKBACK_DAYS })
    return Response.json(result, { headers: CORS })
  } catch (e: any) {
    console.error('strava-sync-activities failed for', user.id, ':', e.message)
    return Response.json({ error: 'Sync failed, please try again' }, { status: 502, headers: CORS })
  }
})

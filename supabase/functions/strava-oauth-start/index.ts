import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Starts the Strava OAuth flow for the calling ACP user: creates a single-use
// state row binding this authorization attempt to their user id, and returns
// the Strava authorize URL for the client to open (mobile: in-app browser via
// expo-web-browser, same pattern already used for Pesapal card checkout).
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

  let body: { platform?: string; returnTo?: string }
  try { body = await req.json() } catch { body = {} }
  const platform = body.platform === 'web' || body.platform === 'partners' ? body.platform : 'mobile'
  // Only used for platform='web' — must be a same-origin relative path, never
  // an absolute URL, so this can't be abused as an open redirect.
  const returnTo = platform === 'web' && body.returnTo?.startsWith('/') && !body.returnTo.startsWith('//')
    ? body.returnTo
    : null

  const clientId = Deno.env.get('STRAVA_CLIENT_ID')
  const redirectUri = Deno.env.get('STRAVA_REDIRECT_URI')
  if (!clientId || !redirectUri) {
    return Response.json({ error: 'Strava is not configured' }, { status: 500, headers: CORS })
  }

  const { data: stateRow, error: insertErr } = await admin
    .from('strava_oauth_states')
    .insert({ user_id: user.id, platform, return_to: returnTo })
    .select('state')
    .single()

  if (insertErr || !stateRow) {
    console.error('strava-oauth-start: failed to create state row:', insertErr?.message)
    return Response.json({ error: 'Failed to start Strava connection' }, { status: 500, headers: CORS })
  }

  const authorizeUrl = new URL('https://www.strava.com/oauth/authorize')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('approval_prompt', 'auto')
  authorizeUrl.searchParams.set('scope', 'read,activity:read_all')
  authorizeUrl.searchParams.set('state', stateRow.state)

  return Response.json({ url: authorizeUrl.toString() }, { headers: CORS })
})

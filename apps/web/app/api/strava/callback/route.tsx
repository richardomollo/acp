import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Strava's OAuth redirect lands here — this must be a fixed, public HTTPS URL
// (registered in the Strava API application settings as STRAVA_REDIRECT_URI).
// This route holds no Strava secrets itself: it forwards the code/state/error
// to the strava-oauth-callback edge function (which does the actual token
// exchange and holds STRAVA_CLIENT_SECRET), authenticated with a shared
// secret header rather than a user JWT, since this request arrives from
// Strava's redirect with no ACP session attached. The edge function tells us
// which platform initiated the connection so we know whether to redirect
// back into the mobile app via a custom URL scheme (matching the existing
// acitypass://pesapal-callback pattern) or, if a web Fitness Journey is ever
// added, back to a normal page.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const callbackSecret = process.env.STRAVA_CALLBACK_SECRET

  if (!supabaseUrl || !anonKey || !callbackSecret) {
    console.error('strava callback route: missing Supabase/Strava env vars')
    return NextResponse.redirect('acitypass://strava-callback?status=error')
  }

  let platform = 'mobile'
  let returnTo: string | null = null
  let status: 'connected' | 'denied' | 'error' = 'error'

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/strava-oauth-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        'x-strava-callback-secret': callbackSecret,
      },
      body: JSON.stringify({ code, state, error }),
    })
    const data = await res.json()
    platform = data.platform ?? 'mobile'
    returnTo = data.returnTo ?? null
    status = data.status ?? 'error'
  } catch (e) {
    console.error('strava callback route: forwarding to edge function failed:', e)
  }

  // Strava is used from the client app (apps/mobile) and the partner portal
  // on both web (apps/web trainer-dashboard/pt-dashboard) and app
  // (apps/partners) — each mobile-ish client has its own custom URL scheme,
  // web just does a normal same-tab redirect back to where it started.
  if (platform === 'web') {
    const path = returnTo && returnTo.startsWith('/') ? returnTo : '/pt-dashboard/profile'
    const separator = path.includes('?') ? '&' : '?'
    return NextResponse.redirect(new URL(`${path}${separator}strava=${status}`, request.url))
  }
  const scheme = platform === 'partners' ? 'partners' : 'acitypass'
  return NextResponse.redirect(`${scheme}://strava-callback?status=${status}`)
}

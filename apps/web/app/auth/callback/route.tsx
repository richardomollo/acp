import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '../../lib/supabase/server'

// Exchanges the PKCE code for a session right here, server-side. The code
// verifier cookie set when signInWithOAuth() was initiated only reliably
// survives the full Google -> Supabase -> app redirect chain when it's read
// by a server request's Cookie header (via @supabase/ssr's server client) —
// forwarding the code on to a client page and exchanging it there was
// intermittently losing the verifier ("PKCE code verifier not found").
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || ''
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : ''

  if (!code) return NextResponse.redirect(`${origin}/login`)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    const message = error?.message || 'Sign-in failed. Please try again.'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`)
  }

  if (safeNext) return NextResponse.redirect(`${origin}${safeNext}`)

  const email = data.session.user.email ?? ''
  const { data: gymData } = await supabase.from('gyms').select('id').ilike('contact_email', email).maybeSingle()
  return NextResponse.redirect(`${origin}${gymData ? '/partner-dashboard' : '/sessions'}`)
}

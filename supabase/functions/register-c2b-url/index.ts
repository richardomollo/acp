import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { registerC2bUrl } from '../_shared/daraja.ts'

// One-time setup: invoke via `supabase functions invoke register-c2b-url`
// Safe to call multiple times — Safaricom just overwrites the registered URL.
serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const confirmationUrl = `${supabaseUrl}/functions/v1/c2b-confirm`

  try {
    await registerC2bUrl({ confirmationUrl })
    console.log('[register-c2b] Registered:', confirmationUrl)
    return Response.json({ success: true, confirmationUrl })
  } catch (e: any) {
    console.error('[register-c2b] Error:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
})

/**
 * One-time script to register the M-Pesa C2B confirmation URL with Safaricom Daraja.
 * Run once after deploying mpesa-c2b-callback:
 *
 *   DARAJA_CONSUMER_KEY=xxx DARAJA_CONSUMER_SECRET=xxx DARAJA_SHORTCODE=4322745 \
 *   deno run --allow-net --allow-env scripts/register-c2b.ts
 */

const key = Deno.env.get('DARAJA_CONSUMER_KEY')
const secret = Deno.env.get('DARAJA_CONSUMER_SECRET')
const shortCode = Deno.env.get('DARAJA_SHORTCODE')

if (!key || !secret || !shortCode) {
  console.error('Missing env vars: DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE')
  Deno.exit(1)
}

const SUPABASE_URL = 'https://kdmhmkwzanqnwehcddvr.supabase.co'
const CONFIRMATION_URL = `${SUPABASE_URL}/functions/v1/mpesa-c2b-callback`

// Step 1: get OAuth token
const tokenRes = await fetch(
  'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
  { headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` } }
)
if (!tokenRes.ok) {
  console.error('OAuth failed:', await tokenRes.text())
  Deno.exit(1)
}
const { access_token } = await tokenRes.json()
console.log('Got Daraja token ✓')

// Step 2: register C2B URL
const regRes = await fetch('https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl', {
  method: 'POST',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ShortCode: shortCode,
    ResponseType: 'Completed',
    ConfirmationURL: CONFIRMATION_URL,
    ValidationURL: CONFIRMATION_URL,
  }),
})
const result = await regRes.json()
console.log('Registration result:', JSON.stringify(result, null, 2))

if (result.ResponseCode === '0' || result.ResponseDescription?.toLowerCase().includes('success')) {
  console.log('\n✓ C2B URL registered successfully.')
  console.log(`  ConfirmationURL: ${CONFIRMATION_URL}`)
} else {
  console.error('\n✗ Registration may have failed — check the result above.')
}

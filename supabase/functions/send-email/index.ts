import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend'
import { render } from 'npm:@react-email/render'
import {
  WelcomeEmail,
  VerificationEmail,
  VenueCreatedEmail,
  FirstSessionEmail,
  NewBookingEmail,
  PayoutProcessingEmail,
  PayoutReceivedEmail,
  FirstPayoutEmail,
} from '../_shared/email-templates.tsx'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

serve(async (req) => {
  try {
    const { type, data } = await req.json()

    let emailHtml = ''
    let subject = ''
    let to = data.email || ''

    // Generate email based on type
    switch (type) {
      case 'welcome':
        emailHtml = render(WelcomeEmail(data))
        subject = 'Welcome to FitPass Partner Platform! 🎉'
        break

      case 'verification':
        emailHtml = render(VerificationEmail(data))
        subject = 'Verify your FitPass Partner account'
        break

      case 'venue_created':
        emailHtml = render(VenueCreatedEmail(data))
        subject = `${data.venueName} is now live! 🏋️`
        break

      case 'first_session':
        emailHtml = render(FirstSessionEmail(data))
        subject = 'Your first session is live! 🚀'
        break

      case 'new_booking':
        emailHtml = render(NewBookingEmail(data))
        subject = `New booking for ${data.sessionName}!`
        break

      case 'payout_processing':
        emailHtml = render(PayoutProcessingEmail(data))
        subject = `Your payout is being processed - KES ${data.amount}`
        break

      case 'payout_received':
        emailHtml = render(PayoutReceivedEmail(data))
        subject = `Payout received - KES ${data.amount} ✅`
        break

      case 'first_payout':
        emailHtml = render(FirstPayoutEmail(data))
        subject = 'Congratulations on your first payout! 🎉'
        break

      default:
        throw new Error(`Unknown email type: ${type}`)
    }

    // Send email via Resend
    const result = await resend.emails.send({
      from: 'FitPass Partner <noreply@fitpass.co.ke>',
      to,
      subject,
      html: emailHtml,
    })

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend'
import {
  getWelcomeEmail,
  getVenueCreatedEmail,
  getFirstSessionEmail,
  getNewBookingEmail,
  getBookingConfirmationEmail,
  getTrialWelcomeEmail,
  getPayoutProcessingEmail,
  getPayoutReceivedEmail,
  getFirstPayoutEmail,
} from '../_shared/email-templates.tsx'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const FROM = 'Active CityPass <noreply@activecitypass.com>'

serve(async (req) => {
  try {
    const { type, data } = await req.json()

    let html = ''
    let subject = ''
    const to: string = data.email || ''

    switch (type) {
      case 'welcome':
        html = getWelcomeEmail(data)
        subject = 'Welcome to FitPass Partner Platform!'
        break
      case 'venue_created':
        html = getVenueCreatedEmail(data)
        subject = `${data.venueName} is now live!`
        break
      case 'first_session':
        html = getFirstSessionEmail(data)
        subject = 'Your first session is live!'
        break
      case 'new_booking':
        html = getNewBookingEmail(data)
        subject = `New booking for ${data.sessionName}`
        break
      case 'booking_confirmation':
        html = getBookingConfirmationEmail(data)
        subject = `You're booked! ${data.sessionName} on ${data.sessionDate}`
        break
      case 'trial_welcome':
        html = getTrialWelcomeEmail(data)
        subject = 'Your 14-day free trial has started!'
        break
      case 'payout_processing':
        html = getPayoutProcessingEmail(data)
        subject = `Your payout is being processed — KES ${data.amount}`
        break
      case 'payout_received':
        html = getPayoutReceivedEmail(data)
        subject = `Payout received — KES ${data.amount}`
        break
      case 'first_payout':
        html = getFirstPayoutEmail(data)
        subject = 'Congratulations on your first payout!'
        break
      default:
        throw new Error(`Unknown email type: ${type}`)
    }

    const result = await resend.emails.send({ from: FROM, to, subject, html })

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('send-email error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

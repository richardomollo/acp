import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const FROM = 'Active CityPass <noreply@activecitypass.com>'

const base = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#fff;`
const h1   = `font-size:26px;font-weight:700;color:#000;margin:0 0 20px;`
const p    = `font-size:15px;line-height:24px;color:#555;margin:12px 0;`
const btn  = `display:inline-block;background:#000;color:#fff;padding:13px 26px;border-radius:50px;text-decoration:none;font-weight:600;margin:18px 0;`
const foot = `color:#aaa;font-size:13px;text-align:center;margin-top:36px;padding-top:16px;border-top:1px solid #eee;`
const card = `background:#f9f9f9;border:1px solid #eee;border-radius:12px;padding:18px;margin:18px 0;`

function wrap(body: string) {
  return `<!DOCTYPE html><html><body style="background:#f5f5f5;margin:0;padding:20px;">
    <div style="${base}">${body}</div></body></html>`
}

function bookingConfirmation(d: any) {
  return wrap(`
    <h1 style="${h1}">You're booked! 🎉</h1>
    <p style="${p}">Hi ${d.customerName || 'there'},</p>
    <p style="${p}">Your booking is confirmed. See you at the session!</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;">${d.sessionName}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">📍 ${d.venueName}${d.venueLocation ? ', ' + d.venueLocation : ''}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">🗓️ ${d.sessionDate}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">⏰ ${d.sessionTime}</p>
      ${d.confirmationCode ? `<p style="margin:12px 0 0;font-size:14px;color:#333;">Check-in code: <strong style="font-family:monospace;font-size:20px;letter-spacing:3px;">${d.confirmationCode}</strong></p>` : ''}
    </div>
    <a href="https://activecitypass.com/bookings" style="${btn}">View My Bookings</a>
    <p style="${p}">Need to cancel? Do so anytime from your bookings page — credits are refunded immediately.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:support@activecitypass.com" style="color:#aaa;">support@activecitypass.com</a></div>
  `)
}

function trialWelcome(d: any) {
  return wrap(`
    <h1 style="${h1}">Your free trial has started! 🏃</h1>
    <p style="${p}">Welcome to Active CityPass!</p>
    <p style="${p}">You have <strong>50 credits</strong> and <strong>14 days</strong> to explore the best gyms, studios, and wellness spaces in Nairobi.</p>
    <div style="${card}">
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#333;">How it works</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ Browse classes across 100+ venues in Nairobi</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ Use your 50 credits to book sessions</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ Visit each partner venue once during your trial</p>
      <p style="margin:0;font-size:14px;color:#555;">✅ Cancel any booking to get your credits back instantly</p>
    </div>
    <a href="https://activecitypass.com/sessions" style="${btn}">Find a Class</a>
    <p style="${p}">Upgrade anytime to unlock unlimited bookings and access to all premium venues.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:support@activecitypass.com" style="color:#aaa;">support@activecitypass.com</a></div>
  `)
}

function newBooking(d: any) {
  return wrap(`
    <h1 style="${h1}">New Booking! 🎉</h1>
    <p style="${p}">Hi ${d.businessName},</p>
    <p style="${p}">You have a new booking for <strong>${d.sessionName}</strong>.</p>
    <div style="${card}">
      <p style="margin:0 0 5px;font-size:14px;color:#555;">👤 <strong>Customer:</strong> ${d.customerName}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📅 <strong>Date:</strong> ${d.sessionDate}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">⏰ <strong>Time:</strong> ${d.sessionTime}</p>
    </div>
    <a href="https://activecitypass.com/partner-dashboard" style="${btn}">View Dashboard</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function welcome(d: any) {
  return wrap(`
    <h1 style="${h1}">Welcome to FitPass Partner Platform! 🎉</h1>
    <p style="${p}">Hi ${d.businessName},</p>
    <p style="${p}">We're thrilled to have you join Kenya's fastest-growing fitness community.</p>
    <a href="https://activecitypass.com/partner-dashboard" style="${btn}">Go to Dashboard</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function payoutProcessing(d: any) {
  return wrap(`
    <h1 style="${h1}">Payout Processing 💰</h1>
    <p style="${p}">Hi ${d.businessName},</p>
    <p style="${p}">Your payout of <strong>KES ${d.amount}</strong> is being processed and will arrive within 1–3 business days.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function payoutReceived(d: any) {
  return wrap(`
    <h1 style="${h1}">Payout Received! ✅</h1>
    <p style="${p}">Hi ${d.businessName},</p>
    <p style="${p}">Your payout of <strong>KES ${d.amount}</strong> has been sent to your bank account.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function firstPayout(d: any) {
  return wrap(`
    <h1 style="${h1}">Your First Payout! 🎉</h1>
    <p style="${p}">Hi ${d.businessName},</p>
    <p style="${p}">Congratulations — you've just received your first payout of <strong>KES ${d.amount}</strong> from Active CityPass!</p>
    <a href="https://activecitypass.com/partner-dashboard" style="${btn}">View Dashboard</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

serve(async (req) => {
  try {
    const { type, data } = await req.json()

    let html = ''
    let subject = ''

    switch (type) {
      case 'booking_confirmation':
        html = bookingConfirmation(data)
        subject = `You're booked! ${data.sessionName} on ${data.sessionDate}`
        break
      case 'trial_welcome':
        html = trialWelcome(data)
        subject = 'Your 14-day free trial has started!'
        break
      case 'new_booking':
        html = newBooking(data)
        subject = `New booking for ${data.sessionName}`
        break
      case 'welcome':
        html = welcome(data)
        subject = 'Welcome to FitPass Partner Platform!'
        break
      case 'payout_processing':
        html = payoutProcessing(data)
        subject = `Your payout is being processed — KES ${data.amount}`
        break
      case 'payout_received':
        html = payoutReceived(data)
        subject = `Payout received — KES ${data.amount}`
        break
      case 'first_payout':
        html = firstPayout(data)
        subject = 'Congratulations on your first payout!'
        break
      default:
        throw new Error(`Unknown email type: ${type}`)
    }

    const result = await resend.emails.send({
      from: FROM,
      to: data.email,
      subject,
      html,
    })

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

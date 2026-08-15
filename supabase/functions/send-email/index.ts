import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const FROM = 'Active CityPass <noreply@activecitypass.com>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

const signupCta = (email: string) => `
  <div style="background:#f0f7ff;border:1px solid #c8e0ff;border-radius:12px;padding:20px;margin:24px 0;">
    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#000;">Save your bookings — create a free account</p>
    <p style="margin:0 0 14px;font-size:14px;color:#555;">Sign up with <strong>${email}</strong> to:</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="font-size:13px;color:#444;padding:3px 0;">✓ View and manage all your bookings in one place</td></tr>
      <tr><td style="font-size:13px;color:#444;padding:3px 0;">✓ Unlock member-only prices</td></tr>
      <tr><td style="font-size:13px;color:#444;padding:3px 0;">✓ Book faster — no details to fill in each time</td></tr>
      <tr><td style="font-size:13px;color:#444;padding:3px 0;">✓ Get personalised recommendations</td></tr>
    </table>
    <a href="https://activecitypass.com/signup?email=${encodeURIComponent(email)}" style="${btn};margin-top:16px;margin-bottom:0;display:inline-block;">Create Free Account →</a>
  </div>`

function guestBookingConfirmation(d: any) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`acp:booking:${d.bookingId}:${d.confirmationCode}`)}`
  return wrap(`
    <h1 style="${h1}">You're booked! 🎉</h1>
    <p style="${p}">Hi ${d.customerName},</p>
    <p style="${p}">Your session is confirmed. Show this QR code or your confirmation code at the venue.</p>
    <div style="${card}; text-align:center;">
      <img src="${qrUrl}" alt="QR Code" width="180" height="180" style="margin-bottom:12px;" />
      <p style="margin:0;font-size:13px;color:#666;">Check-in code</p>
      <p style="margin:4px 0 0;font-family:monospace;font-size:26px;font-weight:700;letter-spacing:4px;color:#000;">${d.confirmationCode}</p>
    </div>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;">${d.sessionName}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">📍 ${d.venueName}${d.venueLocation ? ', ' + d.venueLocation : ''}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">🗓️ ${d.sessionDate}</p>
      <p style="margin:0;font-size:14px;color:#666;">⏰ ${d.sessionTime}</p>
    </div>
    ${d.remainderAmount > 0 ? `<p style="${p}">Remember to bring <strong>KES ${Number(d.remainderAmount).toLocaleString()}</strong> to pay the balance at the venue.</p>` : ''}
    ${signupCta(d.email)}
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function guestExperienceConfirmation(d: any) {
  return wrap(`
    <h1 style="${h1}">You're booked! 🎉</h1>
    <p style="${p}">Hi ${d.customerName},</p>
    <p style="${p}">Your experience booking is confirmed. Show your confirmation code at check-in.</p>
    <div style="${card}; text-align:center;">
      <p style="margin:0;font-size:13px;color:#666;">Check-in code</p>
      <p style="margin:6px 0 0;font-family:monospace;font-size:32px;font-weight:700;letter-spacing:5px;color:#000;">${d.confirmationCode}</p>
    </div>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;">${d.experienceName}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">📍 ${d.venueName}${d.venueLocation ? ', ' + d.venueLocation : ''}</p>
      ${d.experienceDate ? `<p style="margin:0 0 4px;font-size:14px;color:#666;">🗓️ ${d.experienceDate}</p>` : ''}
    </div>
    ${d.remainderAmount > 0 ? `<p style="${p}">Remember to bring <strong>KES ${Number(d.remainderAmount).toLocaleString()}</strong> to pay the balance at the venue.</p>` : ''}
    ${signupCta(d.email)}
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function guestPtConfirmation(d: any) {
  const locationLine = d.locationType === 'home'
    ? `🏠 Home visit${d.clientAddress ? ': ' + d.clientAddress : ''}`
    : d.locationType === 'virtual'
    ? '💻 Virtual (online)'
    : '🏋️ In-gym'
  return wrap(`
    <h1 style="${h1}">Your PT session is confirmed! 🎉</h1>
    <p style="${p}">Hi ${d.customerName},</p>
    <p style="${p}">Your personal training session is booked. Here are the details:</p>
    <div style="${card}">
      <p style="margin:0 0 4px;font-size:14px;color:#666;">🗓️ ${d.scheduledDate}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">⏰ ${d.scheduledTime}</p>
      <p style="margin:0;font-size:14px;color:#666;">${locationLine}</p>
    </div>
    ${signupCta(d.email)}
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
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
    <p style="${p}">Need to cancel? Do so anytime from your bookings page — your deposit is refunded immediately.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
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

function customerWelcome(d: any) {
  return wrap(`
    <h1 style="${h1}">Welcome to Active CityPass! 🎉</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">Your account is ready. Active CityPass is Nairobi's flexible sports & wellness membership — one pass, 50+ venues, and a growing set of communities and clubs to move with.</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#333;">Here's where to start</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🏋️ Browse gyms, studios and classes</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🤝 Join a running crew, cycling club or yoga circle</p>
      <p style="margin:0;font-size:14px;color:#555;">📅 Book your first session in a couple of taps</p>
    </div>
    <a href="https://activecitypass.com/sessions" style="${btn}">Explore Active CityPass →</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function communityWelcome(d: any) {
  return wrap(`
    <h1 style="${h1}">Welcome to ${d.communityName}! 🎉</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">You're in! You've joined <strong>${d.communityName}</strong> on Active CityPass — get ready to meet your people and show up together.</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#333;">What you can do now</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📅 RSVP to upcoming community events</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🏆 Join community challenges and climb the leaderboard</p>
      <p style="margin:0;font-size:14px;color:#555;">👋 See who else is in the club</p>
    </div>
    <a href="${d.communityUrl}" style="${btn}">Go to ${d.communityName} →</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function communityEngagementReminder(d: any) {
  const events = (d.events ?? []) as { title: string; communityName: string; dateLabel: string; url: string }[]
  const challenges = (d.challenges ?? []) as { title: string; communityName: string; url: string }[]

  const eventsBlock = events.length ? `
    <div style="${card}">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#333;">📅 Events you haven't RSVP'd to</p>
      ${events.map(e => `
        <a href="${e.url}" style="display:block;text-decoration:none;margin:0 0 10px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#000;">${e.title}</p>
          <p style="margin:2px 0 0;font-size:13px;color:#777;">${e.communityName} · ${e.dateLabel}</p>
        </a>`).join('')}
    </div>` : ''

  const challengesBlock = challenges.length ? `
    <div style="${card}">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#333;">🏆 Challenges you haven't joined in on</p>
      ${challenges.map(c => `
        <a href="${c.url}" style="display:block;text-decoration:none;margin:0 0 10px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#000;">${c.title}</p>
          <p style="margin:2px 0 0;font-size:13px;color:#777;">${c.communityName}</p>
        </a>`).join('')}
    </div>` : ''

  return wrap(`
    <h1 style="${h1}">Your communities are moving without you 👀</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">Here's what's happening in your communities that you haven't jumped into yet.</p>
    ${eventsBlock}
    ${challengesBlock}
    <a href="https://activecitypass.com/community" style="${btn}">Open Communities →</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
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

function partnerSetupIncomplete(d: any) {
  const steps: string[] = []
  if (d.missingPhoto) {
    steps.push(`<p style="margin:0 0 5px;font-size:14px;color:#555;">📸 <strong>Add a cover photo</strong> — go to Dashboard → Venue → Edit, and upload a photo. Listings with no photo get skipped by customers.</p>`)
  }
  if (d.missingOfferings) {
    steps.push(`<p style="margin:0 0 5px;font-size:14px;color:#555;">🗓️ <strong>Add your first class or experience</strong> — go to Dashboard → Classes → Add Class (or Experiences → Add Experience). Customers can't book what isn't listed.</p>`)
  }
  return wrap(`
    <h1 style="${h1}">Your listing isn't finished yet</h1>
    <p style="${p}">Hi ${d.businessName},</p>
    <p style="${p}">Your Active CityPass listing has been live for a while, but it's still missing a couple of things that keep customers from booking with you.</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#333;">What's left</p>
      ${steps.join('')}
    </div>
    <a href="${d.dashboardUrl}" style="${btn}">Finish Your Listing →</a>
    <p style="${p}">Questions? Just reply to this email or reach us at <a href="mailto:info@activecitypass.com" style="color:#000;font-weight:600;">info@activecitypass.com</a>.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function partnerApplicationReceived(d: any) {
  return wrap(`
    <h1 style="${h1}">We've received your application!</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">Thanks for applying to join Active CityPass as a <strong>${d.partnerType}</strong>. We're excited to have you on board!</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#333;">What happens next</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ Our team will review your application within <strong>24–48 hours</strong></p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ We'll send you an email the moment you're approved</p>
      <p style="margin:0;font-size:14px;color:#555;">✅ Once approved, you'll get instant access to your partner dashboard</p>
    </div>
    <p style="${p}">In the meantime, if you have any questions feel free to reach out to us at <a href="mailto:info@activecitypass.com" style="color:#000;font-weight:600;">info@activecitypass.com</a>.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function partnerApplicationAlert(d: any) {
  return wrap(`
    <h1 style="${h1}">New Partner Application</h1>
    <p style="${p}">A new partner has submitted an application on Active CityPass.</p>
    <div style="${card}">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#333;">Applicant details</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">👤 <strong>Name:</strong> ${d.applicantName}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📧 <strong>Email:</strong> ${d.applicantEmail}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📞 <strong>Phone:</strong> ${d.applicantPhone || 'Not provided'}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🏢 <strong>Business:</strong> ${d.businessName || 'Not provided'}</p>
      <p style="margin:0;font-size:14px;color:#555;">🏷️ <strong>Type:</strong> ${d.partnerType}</p>
    </div>
    <a href="https://supabase.com/dashboard/project/kdmhmkwzanqnwehcddvr/editor" style="${btn}">Review in Supabase →</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function communityApplicationReceived(d: any) {
  return wrap(`
    <h1 style="${h1}">We've received your community application!</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">Thanks for submitting <strong>${d.communityName}</strong> to Active CityPass. We're excited to have you on board!</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#333;">What happens next</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ Our team will review your community within <strong>24–48 hours</strong></p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">✅ We'll send you an email the moment you're approved</p>
      <p style="margin:0;font-size:14px;color:#555;">✅ Once approved, you can create events and invite members</p>
    </div>
    <p style="${p}">In the meantime, if you have any questions feel free to reach out to us at <a href="mailto:info@activecitypass.com" style="color:#000;font-weight:600;">info@activecitypass.com</a>.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function communityApplicationAlert(d: any) {
  return wrap(`
    <h1 style="${h1}">New Community Application</h1>
    <p style="${p}">A new community has been submitted for review on Active CityPass.</p>
    <div style="${card}">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#333;">Community details</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🏷️ <strong>Name:</strong> ${d.communityName}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📂 <strong>Category:</strong> ${d.category}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📍 <strong>Location:</strong> ${d.location || 'Not provided'}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">👤 <strong>Owner:</strong> ${d.ownerName || 'Not provided'}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">📧 <strong>Email:</strong> ${d.ownerEmail}</p>
      <p style="margin:0;font-size:14px;color:#555;">📞 <strong>Phone:</strong> ${d.ownerPhone || 'Not provided'}</p>
    </div>
    <a href="https://supabase.com/dashboard/project/kdmhmkwzanqnwehcddvr/editor" style="${btn}">Review in Supabase →</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function partnerApproved(d: any) {
  const tasks: string[] = Array.isArray(d.remainingTasks) ? d.remainingTasks : []
  const taskListHtml = tasks.length
    ? tasks.map((t: string) => `<p style="margin:0 0 5px;font-size:14px;color:#555;">☐ ${t}</p>`).join('')
    : `<p style="margin:0;font-size:14px;color:#555;">✅ Nothing left to do — your profile is fully set up!</p>`

  return wrap(`
    <h1 style="${h1}">You're approved! Welcome to Active CityPass 🎉</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">Great news — your application as a <strong>${d.partnerType}</strong> has been approved. Your profile is now live on Active CityPass!</p>
    <div style="${card}">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#333;">A few more things to finish your profile</p>
      ${taskListHtml}
    </div>
    <a href="${d.onboardingUrl}" style="${btn}">Complete Your Profile →</a>
    <p style="${p}">Need help getting set up? Email us at <a href="mailto:info@activecitypass.com" style="color:#000;font-weight:600;">info@activecitypass.com</a> and we'll guide you through.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function trainerInvite(d: any) {
  return wrap(`
    <h1 style="${h1}">You've been added as a trainer 💪</h1>
    <p style="${p}">Hi ${d.trainerName},</p>
    <p style="${p}"><strong>${d.gymName}</strong> has added you as a trainer on Active CityPass. Set a password to finish setting up your account and start managing your assigned classes and students.</p>
    <a href="${d.signupUrl}" style="${btn}">Set Up Your Account →</a>
    <p style="${p}">Questions? Email us at <a href="mailto:info@activecitypass.com" style="color:#000;font-weight:600;">info@activecitypass.com</a>.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function partnerRejected(d: any) {
  return wrap(`
    <h1 style="${h1}">Update on your application</h1>
    <p style="${p}">Hi ${d.name},</p>
    <p style="${p}">Thank you for your interest in joining Active CityPass. After reviewing your application, we're unfortunately unable to approve it at this time.</p>
    ${d.rejectionReason ? `<div style="${card}"><p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#333;">Reason</p><p style="margin:0;font-size:14px;color:#555;">${d.rejectionReason}</p></div>` : ''}
    <p style="${p}">This doesn't mean the door is permanently closed — we encourage you to reach out to us at <a href="mailto:info@activecitypass.com" style="color:#000;font-weight:600;">info@activecitypass.com</a> if you have questions or would like to discuss your application further.</p>
    <p style="${p}">We appreciate your time and hope to work with you in the future.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function bookingCancellation(d: any) {
  const hasRefund = d.refundEligible && d.refundAmount > 0
  return wrap(`
    <h1 style="${h1}">Booking cancelled</h1>
    <p style="${p}">Hi ${d.customerName || 'there'},</p>
    <p style="${p}">Your booking for <strong>${d.sessionName}</strong> on ${d.sessionDate} at ${d.sessionTime} (${d.venueName}) has been cancelled.</p>
    ${hasRefund ? `
    <div style="${card};border-color:#c8f0c8;background:#f0fff0;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a6b1a;">Full refund initiated</p>
      <p style="margin:0;font-size:14px;color:#2d8a2d;">KES ${Number(d.refundAmount).toLocaleString()} will be returned to your M-Pesa within 3–5 business days.</p>
    </div>` : `
    <div style="${card};border-color:#ffd0c8;background:#fff4f2;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#8b1a0a;">No refund</p>
      <p style="margin:0;font-size:14px;color:#a03020;">This booking was cancelled within the 24-hour cancellation window, so no refund is available.</p>
    </div>`}
    <a href="https://activecitypass.com/sessions" style="${btn}">Book Another Class</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function partnerBookingCancelledByCustomer(d: any) {
  return wrap(`
    <h1 style="${h1}">Booking cancelled by customer</h1>
    <p style="${p}">Hi ${d.venueName},</p>
    <p style="${p}"><strong>${d.customerName}</strong> has cancelled their booking for <strong>${d.sessionName}</strong> on ${d.sessionDate} at ${d.sessionTime}.</p>
    <p style="${p}">The spot has been freed up and is available to other members.</p>
    <a href="https://activecitypass.com/partner-dashboard" style="${btn}">View Dashboard</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function partnerCancellation(d: any) {
  return wrap(`
    <h1 style="${h1}">Session cancelled by venue</h1>
    <p style="${p}">Hi ${d.customerName || 'there'},</p>
    <p style="${p}">We're sorry to let you know that <strong>${d.venueName}</strong> has cancelled your booking for <strong>${d.sessionName}</strong> on ${d.sessionDate} at ${d.sessionTime}.</p>
    ${d.refundAmount > 0 ? `
    <div style="${card};border-color:#c8f0c8;background:#f0fff0;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a6b1a;">Full refund initiated</p>
      <p style="margin:0;font-size:14px;color:#2d8a2d;">KES ${Number(d.refundAmount).toLocaleString()} will be returned to your M-Pesa within 3–5 business days.</p>
    </div>` : ''}
    <p style="${p}">We apologise for the inconvenience. Browse other available classes below.</p>
    <a href="https://activecitypass.com/sessions" style="${btn}">Find Another Class</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function withdrawalRequest(d: any) {
  const destLine = d.destinationType === 'MPESA_NUMBER'
    ? `📱 <strong>M-Pesa Number:</strong> ${d.phone}`
    : d.destinationType === 'MPESA_PAYBILL'
    ? `🏦 <strong>Paybill:</strong> ${d.businessNumber} &nbsp;·&nbsp; Account: ${d.accountNumber}`
    : `🏦 <strong>Bank:</strong> ${d.bankName} &nbsp;·&nbsp; Account: ${d.accountNumber}`
  return wrap(`
    <h1 style="${h1}">New Withdrawal Request 💰</h1>
    <p style="${p}">A partner has submitted a withdrawal request on Active CityPass.</p>
    <div style="${card}">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#333;">Request details</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🏢 <strong>Partner:</strong> ${d.partnerEmail}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">🏋️ <strong>Venue:</strong> ${d.venueName}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">💵 <strong>Amount:</strong> KES ${Number(d.amount).toLocaleString()}</p>
      <p style="margin:0 0 5px;font-size:14px;color:#555;">${destLine}</p>
      <p style="margin:0;font-size:14px;color:#555;">🕐 <strong>Requested:</strong> ${d.requestedAt}</p>
    </div>
    <a href="https://supabase.com/dashboard/project/kdmhmkwzanqnwehcddvr/editor" style="${btn}">Process in Supabase →</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya</div>
  `)
}

function bookingRescheduled(d: any) {
  return wrap(`
    <h1 style="${h1}">Booking rescheduled</h1>
    <p style="${p}">Hi ${d.customerName || 'there'},</p>
    <p style="${p}">Your booking for <strong>${d.sessionName}</strong> has been rescheduled.</p>
    <div style="${card}">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;">New date &amp; time</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#000;">🗓️ ${d.newSessionDate}</p>
      <p style="margin:0;font-size:15px;color:#555;">⏰ ${d.newSessionTime}</p>
    </div>
    <p style="font-size:13px;color:#aaa;margin:8px 0;">Previously: ${d.oldSessionDate} at ${d.oldSessionTime}</p>
    <a href="https://activecitypass.com/bookings" style="${btn}">View My Bookings</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function bookingReminder(d: any) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`acp:booking:${d.bookingId ?? ''}:${d.confirmationCode}`)}`
  const whenLabel = d.daysOut === 1 ? 'Tomorrow' : `In ${d.daysOut} days`
  return wrap(`
    <h1 style="${h1}">${whenLabel}: ${d.activityName} 👋</h1>
    <p style="${p}">Hi ${d.customerName || 'there'},</p>
    <p style="${p}">Just a reminder — your ${d.activityName} is coming up. Here are the details:</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;">${d.activityName}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">📍 ${d.venueName}${d.venueLocation ? ', ' + d.venueLocation : ''}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#666;">🗓️ ${d.activityDate}</p>
      <p style="margin:0;font-size:14px;color:#666;">⏰ ${d.activityTime}</p>
    </div>
    ${d.isDepositOnly ? `
    <div style="${card}background:#fff8e6;border-color:#ffe4a3;">
      <p style="margin:0;font-size:14px;color:#5a4a00;">💳 You still owe <strong>KES ${Number(d.remainderAmount).toLocaleString()}</strong> on this booking. Pay via the app or at the venue before check-in.</p>
    </div>` : ''}
    <p style="${p}"><strong>How to check in:</strong> open the app → My Bookings → tap this booking → show the QR code or your confirmation code at the venue.</p>
    ${d.isGuest ? `
    <div style="${card}text-align:center;">
      <img src="${qrUrl}" alt="QR Code" width="180" height="180" style="margin-bottom:12px;" />
      <p style="margin:0;font-size:13px;color:#666;">Check-in code</p>
      <p style="margin:4px 0 0;font-family:monospace;font-size:26px;font-weight:700;letter-spacing:4px;color:#000;">${d.confirmationCode}</p>
    </div>` : `<a href="https://activecitypass.com/bookings" style="${btn}">View My Bookings</a>`}
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function feedbackRequest(d: any) {
  return wrap(`
    <h1 style="${h1}">How was ${d.activityName}? 🙌</h1>
    <p style="${p}">Hi ${d.name || 'there'},</p>
    <p style="${p}">Thanks for joining ${d.activityName}. Got a minute to tell us how it went? It only takes 30 seconds and helps us make Active CityPass better.</p>
    <a href="${d.link}" style="${btn}">Leave Feedback</a>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

function programmeInstalmentReminder(d: any) {
  return wrap(`
    <h1 style="${h1}">Instalment due soon 💳</h1>
    <p style="${p}">Hi ${d.name || 'there'},</p>
    <p style="${p}">A payment for ${d.programmeName} at ${d.venueName} is coming up:</p>
    <div style="${card}">
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;">KES ${Number(d.amount).toLocaleString()}</p>
      <p style="margin:0;font-size:14px;color:#666;">Due ${d.dueDate}</p>
    </div>
    <p style="${p}">Pay via the app or at the venue before the due date to keep your programme active.</p>
    <div style="${foot}">Active CityPass | Nairobi, Kenya<br>
      <a href="mailto:info@activecitypass.com" style="color:#aaa;">info@activecitypass.com</a></div>
  `)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, data } = await req.json()

    let html = ''
    let subject = ''

    switch (type) {
      case 'guest_booking_confirmation':
        html = guestBookingConfirmation(data)
        subject = `You're booked! ${data.sessionName} on ${data.sessionDate}`
        break
      case 'guest_experience_confirmation':
        html = guestExperienceConfirmation(data)
        subject = `You're booked! ${data.experienceName}`
        break
      case 'guest_pt_confirmation':
        html = guestPtConfirmation(data)
        subject = `Your PT session is confirmed — ${data.scheduledDate}`
        break
      case 'booking_confirmation':
        html = bookingConfirmation(data)
        subject = `You're booked! ${data.sessionName} on ${data.sessionDate}`
        break
      case 'new_booking':
        html = newBooking(data)
        subject = `New booking for ${data.sessionName}`
        break
      case 'welcome':
        html = welcome(data)
        subject = 'Welcome to FitPass Partner Platform!'
        break
      case 'customer_welcome':
        html = customerWelcome(data)
        subject = 'Welcome to Active CityPass! 🎉'
        break
      case 'community_welcome':
        html = communityWelcome(data)
        subject = `Welcome to ${data.communityName}!`
        break
      case 'community_engagement_reminder':
        html = communityEngagementReminder(data)
        subject = 'Your communities are moving without you 👀'
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
      case 'partner_setup_incomplete':
        html = partnerSetupIncomplete(data)
        subject = `${data.businessName}, your Active CityPass listing isn't finished yet`
        break
      case 'partner_application_received':
        html = partnerApplicationReceived(data)
        subject = 'We\'ve received your Active CityPass partner application'
        break
      case 'partner_application_alert':
        html = partnerApplicationAlert(data)
        subject = `New partner application — ${data.applicantName} (${data.partnerType})`
        break
      case 'community_application_received':
        html = communityApplicationReceived(data)
        subject = 'We\'ve received your community application'
        break
      case 'community_application_alert':
        html = communityApplicationAlert(data)
        subject = `New community application — ${data.communityName}`
        break
      case 'partner_approved':
        html = partnerApproved(data)
        subject = 'You\'re approved! Welcome to Active CityPass 🎉'
        break
      case 'partner_rejected':
        html = partnerRejected(data)
        subject = 'Update on your Active CityPass partner application'
        break
      case 'trainer_invite':
        html = trainerInvite(data)
        subject = `You've been added as a trainer at ${data.gymName}`
        break
      case 'booking_cancellation':
        html = bookingCancellation(data)
        subject = `Booking cancelled — ${data.sessionName}`
        break
      case 'partner_booking_cancelled_by_customer':
        html = partnerBookingCancelledByCustomer(data)
        subject = `Booking cancelled — ${data.sessionName} on ${data.sessionDate}`
        break
      case 'partner_cancellation':
        html = partnerCancellation(data)
        subject = `Session cancelled by ${data.venueName}`
        break
      case 'booking_rescheduled':
        html = bookingRescheduled(data)
        subject = `Booking rescheduled — ${data.sessionName}`
        break
      case 'withdrawal_request':
        html = withdrawalRequest(data)
        subject = `Withdrawal request — KES ${Number(data.amount).toLocaleString()} from ${data.partnerEmail}`
        break
      case 'booking_reminder':
        html = bookingReminder(data)
        subject = data.daysOut === 1
          ? `Tomorrow: ${data.activityName}`
          : `Reminder: ${data.activityName} in ${data.daysOut} days`
        break
      case 'feedback_request':
        html = feedbackRequest(data)
        subject = `How was ${data.activityName}?`
        break
      case 'programme_instalment_reminder':
        html = programmeInstalmentReminder(data)
        subject = `Instalment due ${data.dueDate} — ${data.programmeName}`
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('send-email error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

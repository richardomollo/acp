// Simple email templates using plain HTML (no React Email dependencies)

interface EmailData {
  businessName: string;
  email: string;
  [key: string]: any;
}

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 20px;
  background: #ffffff;
`;

const headingStyle = `
  font-size: 28px;
  font-weight: 700;
  color: #000;
  margin: 0 0 20px 0;
`;

const paragraphStyle = `
  font-size: 16px;
  line-height: 26px;
  color: #666;
  margin: 15px 0;
`;

const buttonStyle = `
  display: inline-block;
  background: #002fff;
  color: white;
  padding: 14px 28px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 600;
  margin: 20px 0;
`;

const footerStyle = `
  color: #999;
  font-size: 14px;
  text-align: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #eee;
`;

export function getWelcomeEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">Welcome to FitPass! 🎉</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          We're thrilled to have you join the FitPass Partner Platform! You're now part of
          Kenya's fastest-growing fitness community.
        </p>
        <p style="${paragraphStyle}">
          <strong>Here's what you can do next:</strong>
        </p>
        <p style="${paragraphStyle}">
          ✅ Add your first venue<br>
          ✅ Create your first session<br>
          ✅ Set up your payout information<br>
          ✅ Start accepting bookings
        </p>
        <a href="https://partners.fitpass.co.ke/partner/venue-setup" style="${buttonStyle}">
          Add Your First Venue
        </a>
        <p style="${paragraphStyle}">
          Need help? Check out our Partner Guide or reply to this email.
        </p>
        <p style="${paragraphStyle}">
          Welcome aboard!<br>
          The FitPass Team
        </p>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya<br>
          You received this email at ${data.email}
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getVenueCreatedEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">Venue Created Successfully! 🏋️</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          Great news! Your venue <strong>${data.venueName}</strong> is now live on FitPass.
        </p>
        <p style="${paragraphStyle}">
          📍 <strong>Location:</strong> ${data.venueAddress}
        </p>
        <p style="${paragraphStyle}">
          <strong>What's next?</strong>
        </p>
        <p style="${paragraphStyle}">
          1️⃣ Create your first session<br>
          2️⃣ Set up SmartRate pricing (optional)<br>
          3️⃣ Add photos to showcase your space<br>
          4️⃣ Start accepting bookings!
        </p>
        <a href="https://partners.fitpass.co.ke/partner/venue-details/${data.venueId}" style="${buttonStyle}">
          View Venue Dashboard
        </a>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getFirstSessionEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">First Session Created! 🚀</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          Congratulations! Your first session is now live and ready for bookings.
        </p>
        <p style="${paragraphStyle}">
          📅 <strong>Session:</strong> ${data.sessionName}<br>
          🗓️ <strong>Date:</strong> ${data.sessionDate}<br>
          ⏰ <strong>Time:</strong> ${data.sessionTime}
        </p>
        <p style="${paragraphStyle}">
          Share your session with your community on social media to get your first bookings!
        </p>
        <a href="https://partners.fitpass.co.ke/partner/session-details/${data.sessionId}" style="${buttonStyle}">
          View Session Details
        </a>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getNewBookingEmail(data: EmailData): string {
  const percentFilled = Math.round((data.totalBookings / data.capacity) * 100);
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">New Booking! 🎉</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          Great news! You have a new booking for <strong>${data.sessionName}</strong>.
        </p>
        <p style="${paragraphStyle}">
          👤 <strong>Customer:</strong> ${data.customerName}<br>
          📅 <strong>Session:</strong> ${data.sessionName}<br>
          🗓️ <strong>Date:</strong> ${data.sessionDate}<br>
          ⏰ <strong>Time:</strong> ${data.sessionTime}
        </p>
        <p style="${paragraphStyle}">
          📊 <strong>Session Status:</strong> ${data.totalBookings}/${data.capacity} spots filled (${percentFilled}%)
        </p>
        <a href="https://partners.fitpass.co.ke/partner/session-details/${data.sessionId}" style="${buttonStyle}">
          View Session Details
        </a>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getPayoutProcessingEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">Payout Processing 💰</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          Your payout is being processed and will arrive in your bank account within 1-3
          business days.
        </p>
        <p style="${paragraphStyle}">
          💵 <strong>Amount:</strong> KES ${data.amount}<br>
          🏦 <strong>Bank:</strong> ${data.bankName}<br>
          🔢 <strong>Account:</strong> ${data.accountNumber}<br>
          📅 <strong>Expected:</strong> ${data.payoutDate}
        </p>
        <a href="https://partners.fitpass.co.ke/partner/payout-information" style="${buttonStyle}">
          View Payout Details
        </a>
        <p style="${paragraphStyle}">
          You'll receive a confirmation email once the payout is completed.
        </p>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getPayoutReceivedEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">Payout Received! ✅</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          Great news! Your payout has been successfully sent to your bank account.
        </p>
        <p style="${paragraphStyle}">
          💵 <strong>Amount:</strong> KES ${data.amount}<br>
          🏦 <strong>Bank:</strong> ${data.bankName}<br>
          📅 <strong>Date:</strong> ${data.payoutDate}
        </p>
        <p style="${paragraphStyle}">
          The funds should appear in your account within a few hours. If you don't see it
          within 24 hours, please contact your bank.
        </p>
        <a href="https://partners.fitpass.co.ke/partner/payout-information" style="${buttonStyle}">
          View Payout History
        </a>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getFirstPayoutEmail(data: EmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="${baseStyle}">
        <h1 style="${headingStyle}">Your First Payout! 🎉💰</h1>
        <p style="${paragraphStyle}">Hi ${data.businessName},</p>
        <p style="${paragraphStyle}">
          <strong>Congratulations!</strong> You've just received your first payout from FitPass.
          This is a huge milestone!
        </p>
        <p style="${paragraphStyle}">
          💵 <strong>First Payout:</strong> KES ${data.amount}<br>
          📊 <strong>Total Bookings:</strong> ${data.totalBookings}<br>
          📅 <strong>Days Active:</strong> ${data.daysActive}
        </p>
        <p style="${paragraphStyle}">
          You're officially earning through the FitPass platform. Here's to many more
          successful sessions and payouts!
        </p>
        <a href="https://partners.fitpass.co.ke" style="${buttonStyle}">
          View Dashboard
        </a>
        <p style="${paragraphStyle}">
          Keep up the amazing work. Your fitness community is growing! 💪
        </p>
        <div style="${footerStyle}">
          FitPass Partner Platform | Nairobi, Kenya
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getEmailTemplate(type: string, data: EmailData): string {
  switch (type) {
    case 'welcome':
      return getWelcomeEmail(data);
    case 'venue_created':
      return getVenueCreatedEmail(data);
    case 'first_session':
      return getFirstSessionEmail(data);
    case 'new_booking':
      return getNewBookingEmail(data);
    case 'payout_processing':
      return getPayoutProcessingEmail(data);
    case 'payout_received':
      return getPayoutReceivedEmail(data);
    case 'first_payout':
      return getFirstPayoutEmail(data);
    default:
      return `
        <!DOCTYPE html>
        <html>
        <body style="background: #f5f5f5; margin: 0; padding: 20px;">
          <div style="${baseStyle}">
            <p style="${paragraphStyle}">You have a new notification from FitPass.</p>
          </div>
        </body>
        </html>
      `;
  }
}

export function getEmailSubject(type: string, data: EmailData): string {
  switch (type) {
    case 'welcome':
      return 'Welcome to FitPass Partner Platform! 🎉';
    case 'venue_created':
      return `${data.venueName} is now live! 🏋️`;
    case 'first_session':
      return 'Your first session is live! 🚀';
    case 'new_booking':
      return `New booking for ${data.sessionName}!`;
    case 'payout_processing':
      return `Your payout is being processed - KES ${data.amount}`;
    case 'payout_received':
      return `Payout received - KES ${data.amount} ✅`;
    case 'first_payout':
      return 'Congratulations on your first payout! 🎉';
    default:
      return 'FitPass Partner Notification';
  }
}
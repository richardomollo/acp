import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WALLET_BASE = (Deno.env.get('WALLET_API_URL') ?? 'https://wallet.activecitypass.com').replace(/\/+$/, '')
const BASE_URL = Deno.env.get('NEXT_PUBLIC_BASE_URL') ?? 'https://activecitypass.com'
const PESAPAL_BASE =
  Deno.env.get('PESAPAL_ENV') === 'live'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BookingType = 'session' | 'experience'
type PaymentMethod = 'mpesa' | 'pesapal'

function walletHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const bearer = Deno.env.get('WALLET_API_BEARER_TOKEN')
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  const key = Deno.env.get('WALLET_API_KEY')
  if (key) headers[Deno.env.get('WALLET_API_KEY_HEADER') ?? 'x-api-key'] = key
  return headers
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return `254${digits}`
  throw new Error('Phone number must be a valid Safaricom M-Pesa number.')
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

function getText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getBookingType(body: Record<string, unknown>): BookingType {
  const raw = getText(body.type) || getText(body.itemType)
  if (raw === 'experience' || body.experienceId) return 'experience'
  return 'session'
}

function getPaymentMethod(body: Record<string, unknown>): PaymentMethod {
  return getText(body.paymentMethod) === 'pesapal' ? 'pesapal' : 'mpesa'
}

async function getPesapalToken(): Promise<string> {
  const res = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      consumer_key: Deno.env.get('PESAPAL_CONSUMER_KEY'),
      consumer_secret: Deno.env.get('PESAPAL_CONSUMER_SECRET'),
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`PesaPal auth failed: ${await res.text()}`)
  }

  const data = await res.json()
  return data.token as string
}

async function submitPesapalOrder(order: {
  id: string
  currency: string
  amount: number
  description: string
  callback_url: string
  notification_id: string
  billing_address: {
    email_address: string
    phone_number?: string
    first_name?: string
    last_name?: string
    country_code?: string
  }
}) {
  const token = await getPesapalToken()
  const res = await fetch(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(order),
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`PesaPal submit order failed: ${await res.text()}`)
  }

  return res.json() as Promise<{
    order_tracking_id: string
    merchant_reference: string
    redirect_url: string
  }>
}

async function getAuthUser(authHeader: string | null) {
  if (!authHeader) return null

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await client.auth.getUser()
  if (error || !data.user?.email) return null
  return data.user
}

async function createBooking(
  admin: ReturnType<typeof createClient>,
  type: BookingType,
  itemId: string,
  user: { id: string; email: string } | null,
  name: string | null,
  email: string,
  phone: string,
) {
  if (type === 'session') {
    const { data: session, error } = await admin
      .from('sessions')
      .select('*, gyms!gym_id(*)')
      .eq('id', itemId)
      .single()

    if (error || !session) throw new Error('Session not found')
    if ((session.spots_left ?? 0) <= 0) throw new Error('No spots available')

    const gym = Array.isArray(session.gyms) ? session.gyms[0] : session.gyms
    const depositPct = Number(gym?.deposit_pct ?? 30)
    const sessionPrice = Number(session.drop_in_price) || 0
    const depositAmount = Math.round((sessionPrice * depositPct) / 100)
    const remainderAmount = sessionPrice - depositAmount
    const confirmationCode = generateCode()
    const sessionDate = session.date || new Date(session.start_time).toISOString().split('T')[0]
    const sessionTime = session.time || new Date(session.start_time).toTimeString().split(' ')[0]

    const { data: existing } = await admin
      .from('bookings')
      .select('id, status')
      .eq(user ? 'user_id' : 'guest_email', user ? user.id : email)
      .eq('session_id', itemId)
      .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
      .maybeSingle()

    if (existing) {
      if (existing.status === 'pending_payment') {
        await admin.from('bookings').update({
          status: 'cancelled',
          cancellation_reason: 'retried_by_user',
          cancelled_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        throw new Error(user ? 'You have already booked this session' : 'A booking already exists for this email and session')
      }
    }

    const payload: Record<string, unknown> = {
      session_id: itemId,
      gym_id: session.gym_id,
      booking_date: sessionDate,
      booking_time: sessionTime,
      status: 'pending_payment',
      confirmation_code: confirmationCode,
      session_price: sessionPrice,
      deposit_pct: depositPct,
      deposit_amount: depositAmount,
      remainder_amount: remainderAmount,
      payment_phone: phone,
    }

    if (user) {
      payload.user_id = user.id
    } else {
      payload.guest_name = name
      payload.guest_email = email
      payload.guest_phone = phone
    }

    const { data: booking, error: bookingError } = await admin.from('bookings').insert(payload).select().single()
    if (bookingError || !booking) throw new Error(`Failed to create booking: ${bookingError?.message ?? bookingError?.code ?? 'unknown'}`)


    const qrPayload = `acp:booking:${booking.id}:${confirmationCode}`
    await admin.from('bookings').update({ qr_payload: qrPayload }).eq('id', booking.id)

    return {
      bookingId: booking.id as string,
      qrPayload,
      sessionPrice,
      depositAmount,
      remainderAmount,
      depositPct,
      confirmationCode,
    }
  }

  const { data: experience, error } = await admin
    .from('experiences')
    .select('*, gyms!gym_id(*)')
    .eq('id', itemId)
    .single()

  if (error || !experience) throw new Error('Experience not found')
  if ((experience.spots_left ?? 0) <= 0) throw new Error('No spots available')

  const gym = Array.isArray(experience.gyms) ? experience.gyms[0] : experience.gyms
  const experiencePrice = Number(experience.price_kes)
  const cutoffHours: number | null = experience.cancellation_cutoff_hours ?? null
  const expDepositPct: number | null = experience.deposit_pct ?? null
  const isNonRefundable = cutoffHours === 0
  const isFullPayment = isNonRefundable && !expDepositPct
  const depositPct = isFullPayment ? 100 : Number(expDepositPct ?? gym?.deposit_pct ?? 30)
  const depositAmount = isFullPayment ? experiencePrice : Math.round((experiencePrice * depositPct) / 100)
  const remainderAmount = experiencePrice - depositAmount
  const confirmationCode = generateCode()

  // Platform-funded discount: partner payout stays based on the full price
  // above (deposit_amount stored on the booking); only the amount actually
  // charged to the customer is reduced.
  const discountKes = Math.min(Number(experience.discount_kes ?? 0), depositAmount)
  const customerAmount = depositAmount - discountKes

  const { data: existing } = await admin
    .from('experience_bookings')
    .select('id, status')
    .eq(user ? 'user_id' : 'email', user ? user.id : email)
    .eq('experience_id', itemId)
    .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
    .maybeSingle()

  if (existing) {
    if (existing.status === 'pending_payment') {
      await admin.from('experience_bookings').update({
        status: 'cancelled',
        cancellation_reason: 'retried_by_user',
        cancelled_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      throw new Error(user ? 'You have already booked this experience' : 'A booking already exists for this email')
    }
  }

  const payload: Record<string, unknown> = {
    experience_id: itemId,
    gym_id: experience.gym_id,
    email: user?.email ?? email,
    guest_name: user ? name : name,
    guest_phone: phone,
    status: 'pending_payment',
    confirmation_code: confirmationCode,
    session_price: experiencePrice,
    deposit_pct: depositPct,
    deposit_amount: depositAmount,
    remainder_amount: remainderAmount,
    discount_kes: discountKes,
    payment_phone: phone,
  }

  if (user) payload.user_id = user.id

  const { data: booking, error: bookingError } = await admin.from('experience_bookings').insert(payload).select().single()
  if (bookingError || !booking) throw new Error('Failed to create booking')

  const qrPayload = `acp:exp-booking:${booking.id}:${confirmationCode}`
  await admin.from('experience_bookings').update({ qr_payload: qrPayload }).eq('id', booking.id)

  return {
    bookingId: booking.id as string,
    qrPayload,
    sessionPrice: experiencePrice,
    depositAmount: customerAmount,
    remainderAmount,
    depositPct,
    confirmationCode,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS })
  }

  const type = getBookingType(body)
  const paymentMethod = getPaymentMethod(body)
  const itemId = getText(body.sessionId) || getText(body.experienceId) || getText(body.itemId)
  console.log('[checkout-booking] POST', {
    type,
    paymentMethod,
    itemId,
    hasEmail: !!getText(body.email),
    hasPhone: !!getText(body.phone),
    hasAuth: !!req.headers.get('Authorization'),
  })
  if (!itemId) return Response.json({ error: 'sessionId or experienceId required' }, { status: 400, headers: CORS })

  const authHeader = req.headers.get('Authorization')
  let user = await getAuthUser(authHeader)

  // Fallback: if no authenticated user but a userId was forwarded by the submit-order route, look it up
  if (!user && typeof body.userId === 'string' && body.userId) {
    const { data: authData } = await admin.auth.admin.getUserById(body.userId)
    if (authData?.user?.email) {
      user = { id: authData.user.id, email: authData.user.email }
    }
  }

  const name = getText(body.name) || getText(body.firstName) || null
  const email = getText(body.email).toLowerCase() || user?.email?.trim().toLowerCase() || ''
  if (!email || !email.includes('@')) return Response.json({ error: 'Valid email required' }, { status: 400, headers: CORS })

  let phone = getText(body.phone)
  if (!phone) return Response.json({ error: 'phone required' }, { status: 400, headers: CORS })
  if (paymentMethod === 'mpesa') {
    try {
      phone = normalizePhone(phone)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Invalid phone number' }, { status: 400, headers: CORS })
    }
  }

  try {
    const booking = await createBooking(admin, type, itemId, user ? { id: user.id, email: user.email } : null, name, email, phone)
    console.log('[checkout-booking] booking created', {
      bookingId: booking.bookingId,
      type,
      paymentMethod,
      depositAmount: booking.depositAmount,
    })

    const requestId = getText(body.requestId) || `BOOK-${booking.bookingId.slice(0, 8).toUpperCase()}-${Date.now()}`
    const billRef = getText(body.billRef) || `BOOK-${booking.bookingId.slice(0, 8).toUpperCase()}`

    if (paymentMethod === 'pesapal') {
      const ipnId = Deno.env.get('PESAPAL_IPN_ID')
      if (!ipnId) return Response.json({ error: 'PESAPAL_IPN_ID not configured' }, { status: 500, headers: CORS })

      const merchantReference = getText(body.merchantReference) || `ACP-${type.toUpperCase().slice(0, 3)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      const callbackUrl = getText(body.callbackUrl) || `${BASE_URL}/pesapal/callback`
      const description = getText(body.description) || `${type === 'experience' ? 'Experience' : 'Session'} deposit`

      const { error: orderErr } = await admin.from('pesapal_orders').insert({
        merchant_reference: merchantReference,
        type,
        amount: booking.depositAmount,
        currency: 'KES',
        email,
        status: 'pending',
        metadata: {
          bookingId: booking.bookingId,
          itemId,
          type,
          userId: user?.id ?? null,
          guestName: user ? null : name,
          guestEmail: user ? null : email,
          guestPhone: phone,
        },
      })

      if (orderErr) {
        await admin
          .from(type === 'session' ? 'bookings' : 'experience_bookings')
          .update({ status: 'cancelled', cancellation_reason: 'pesapal_order_failed', cancelled_at: new Date().toISOString() })
          .eq('id', booking.bookingId)
        return Response.json({ error: 'Failed to save order' }, { status: 500, headers: CORS })
      }

      const result = await submitPesapalOrder({
        id: merchantReference,
        currency: 'KES',
        amount: booking.depositAmount,
        description,
        callback_url: callbackUrl,
        notification_id: ipnId,
        billing_address: {
          email_address: email,
          phone_number: phone,
          first_name: name ?? '',
          last_name: getText(body.lastName),
          country_code: 'KE',
        },
      })
      console.log('[checkout-booking] pesapal submitted', {
        bookingId: booking.bookingId,
        merchantReference,
        orderTrackingId: result.order_tracking_id,
      })

      await admin
        .from('pesapal_orders')
        .update({ order_tracking_id: result.order_tracking_id })
        .eq('merchant_reference', merchantReference)

      return Response.json(
        {
          bookingId: booking.bookingId,
          confirmationCode: booking.confirmationCode,
          depositAmount: booking.depositAmount,
          remainderAmount: booking.remainderAmount,
          paymentMethod: 'pesapal',
          merchantReference,
          orderTrackingId: result.order_tracking_id,
          redirectUrl: result.redirect_url,
          billRef,
          requestId,
        },
        { status: 201, headers: CORS },
      )
    }

    const payment = await fetch(`${WALLET_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: walletHeaders(),
      body: JSON.stringify({
        requestId,
        billRef,
        phone,
        amount: booking.depositAmount,
        currency: 'KES',
        metadata: {
          source: 'checkout-booking',
          type,
          itemId,
          bookingId: booking.bookingId,
          userId: user?.id ?? null,
          guestName: user ? null : name,
          guestEmail: user ? null : email,
          guestPhone: phone,
        },
      }),
    })

    const paymentData = await payment.json().catch(() => ({})) as Record<string, unknown>
    if (!payment.ok) {
      console.error('[checkout-booking] mpesa initiation failed', {
        bookingId: booking.bookingId,
        status: payment.status,
        body: paymentData,
      })
      await admin
        .from(type === 'session' ? 'bookings' : 'experience_bookings')
        .update({ status: 'cancelled', cancellation_reason: 'stk_push_failed', cancelled_at: new Date().toISOString() })
        .eq('id', booking.bookingId)
      return Response.json(
        { error: getText(paymentData.message) || getText(paymentData.error) || 'Payment initiation failed' },
        { status: payment.status, headers: CORS },
      )
    }

    const resolvedRequestId =
      getText(paymentData.requestId) ||
      getText(paymentData.checkoutReqId) ||
      getText(paymentData.checkoutRequestId) ||
      requestId

    const resolvedBillRef = getText(paymentData.billRef) || billRef
    const resolvedStatus = getText(paymentData.status) || 'PENDING'

    if (type === 'session') {
      await admin.from('booking_payments').insert({
        booking_id: booking.bookingId,
        checkout_request_id: resolvedRequestId,
        merchant_request_id: getText(paymentData.merchantReqId) || getText(paymentData.merchantRequestId) || null,
        phone,
        amount: booking.depositAmount,
        payment_type: 'deposit',
        status: 'pending',
      })
    }

    console.log('[checkout-booking] mpesa initiated', {
      bookingId: booking.bookingId,
      requestId: resolvedRequestId,
      billRef: resolvedBillRef,
    })

    return Response.json(
      {
        bookingId: booking.bookingId,
        confirmationCode: booking.confirmationCode,
        depositAmount: booking.depositAmount,
        remainderAmount: booking.remainderAmount,
        paymentMethod: 'mpesa',
        requestId: resolvedRequestId,
        billRef: resolvedBillRef,
        phone,
        amount: booking.depositAmount,
        currency: 'KES',
        status: resolvedStatus,
        ...paymentData,
      },
      { status: 201, headers: CORS },
    )
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to start checkout.' },
      { status: 500, headers: CORS },
    )
  }
})

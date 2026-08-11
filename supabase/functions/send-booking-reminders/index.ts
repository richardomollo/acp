import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalisePhone, sendWhatsAppTemplate } from '../_shared/whatsapp.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Called daily by a pg_cron job (see 20260811000001_booking_reminders.sql).
// Finds bookings/experience_bookings/pt_bookings 3 or 1 day(s) out and sends
// an email + WhatsApp reminder (with a deposit-balance line where applicable).

// ── Pure helpers (unit-tested in index.test.ts) ────────────────────────────

export function targetDateStr(daysOut: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysOut)
  return d.toISOString().slice(0, 10)
}

export function resolveContactEmail(guestEmail: string | null | undefined, userEmail: string | null | undefined): string | null {
  return guestEmail || userEmail || null
}

export function resolveContactPhone(guestPhone: string | null | undefined, paymentPhone: string | null | undefined, userPhone: string | null | undefined): string | null {
  const raw = guestPhone || paymentPhone || userPhone
  return raw ? normalisePhone(raw) : null
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatTime(timeStr: string | null | undefined): string {
  return timeStr ? timeStr.slice(0, 5) : ''
}

export interface ReminderTarget {
  bookingId: string
  daysOut: number
  reminderColumn: 'reminder_3d_sent_at' | 'reminder_1d_sent_at'
  isDepositOnly: boolean
  remainderAmount: number | null
  confirmationCode: string | null
  activityName: string
  venueName: string
  venueLocation: string | null
  activityDate: string
  activityTime: string | null
  customerName: string | null
  email: string | null
  phone: string | null
  isGuest: boolean
}

export function buildEmailPayload(t: ReminderTarget) {
  return {
    type: 'booking_reminder',
    data: {
      bookingId: t.bookingId,
      email: t.email,
      customerName: t.customerName ?? 'there',
      activityName: t.activityName,
      venueName: t.venueName,
      venueLocation: t.venueLocation,
      activityDate: formatDate(t.activityDate),
      activityTime: formatTime(t.activityTime),
      confirmationCode: t.confirmationCode,
      daysOut: t.daysOut,
      isDepositOnly: t.isDepositOnly,
      remainderAmount: t.remainderAmount,
      isGuest: t.isGuest,
    },
  }
}

export function buildWhatsAppVariables(t: ReminderTarget): string[] {
  const whenLabel = t.daysOut === 1 ? 'tomorrow' : `in ${t.daysOut} days`
  const paymentLine = t.isDepositOnly
    ? `You still owe KES ${Number(t.remainderAmount ?? 0).toLocaleString()} — pay via the app or at the venue before check-in.`
    : "You're all paid up ✅"
  return [
    t.customerName ?? 'there',
    t.activityName,
    whenLabel,
    formatDate(t.activityDate),
    formatTime(t.activityTime),
    t.venueName,
    paymentLine,
    t.confirmationCode ?? '',
  ]
}

// ── Sending (network — not unit tested) ────────────────────────────────────

async function sendReminder(admin: SupabaseClient, table: 'bookings' | 'experience_bookings' | 'pt_bookings', t: ReminderTarget): Promise<{ emailed: boolean; whatsapped: boolean }> {
  let emailed = false
  let whatsapped = false

  if (t.email) {
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify(buildEmailPayload(t)),
      })
      emailed = res.ok
      if (!res.ok) console.error('Reminder email failed:', t.bookingId, res.status, await res.text())
    } catch (err) {
      console.error('Reminder email threw (non-fatal):', t.bookingId, (err as Error).message)
    }
  }

  if (t.phone) {
    try {
      const result = await sendWhatsAppTemplate(t.phone, 'acp_booking_reminder', buildWhatsAppVariables(t))
      whatsapped = !result?.error
      if (result?.error) console.error('Reminder WhatsApp failed (non-fatal, likely template not yet approved):', t.bookingId, JSON.stringify(result.error))
    } catch (err) {
      console.error('Reminder WhatsApp threw (non-fatal):', t.bookingId, (err as Error).message)
    }
  }

  // Stamp regardless of send success — best-effort reminder, not retried.
  await admin.from(table).update({ [t.reminderColumn]: new Date().toISOString() }).eq('id', t.bookingId)

  return { emailed, whatsapped }
}

// ── Main handler ────────────────────────────────────────────────────────────

const WINDOWS: { daysOut: number; column: 'reminder_3d_sent_at' | 'reminder_1d_sent_at' }[] = [
  { daysOut: 3, column: 'reminder_3d_sent_at' },
  { daysOut: 1, column: 'reminder_1d_sent_at' },
]

// Guarded so importing this module for unit tests doesn't also bind a port.
if (import.meta.main) {
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const secret = req.headers.get('x-cron-secret')
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let processed = 0
  let emailed = 0
  let whatsapped = 0

  for (const { daysOut, column } of WINDOWS) {
    const date = targetDateStr(daysOut)

    // ── Gym/class bookings ──
    const { data: bookings, error: bookingsErr } = await admin
      .from('bookings')
      .select(`
        id, status, remainder_amount, confirmation_code,
        booking_date, booking_time, guest_name, guest_email, guest_phone, payment_phone, user_id,
        sessions!session_id(name), gyms!gym_id(name, location),
        users!user_id(name, email, phone)
      `)
      .eq('booking_date', date)
      .in('status', ['confirmed', 'deposit_paid'])
      .is(column, null)

    if (bookingsErr) console.error('bookings query error:', bookingsErr.message)

    for (const b of bookings ?? []) {
      const session = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions
      const gym = Array.isArray(b.gyms) ? b.gyms[0] : b.gyms
      const user = Array.isArray(b.users) ? b.users[0] : b.users

      const target: ReminderTarget = {
        bookingId: b.id,
        daysOut, reminderColumn: column,
        isDepositOnly: b.status === 'deposit_paid',
        remainderAmount: b.remainder_amount,
        confirmationCode: b.confirmation_code,
        activityName: session?.name ?? 'your session',
        venueName: gym?.name ?? 'the venue',
        venueLocation: gym?.location ?? null,
        activityDate: b.booking_date,
        activityTime: b.booking_time,
        customerName: b.guest_name ?? user?.name ?? null,
        email: resolveContactEmail(b.guest_email, user?.email),
        phone: resolveContactPhone(b.guest_phone, b.payment_phone, user?.phone),
        isGuest: !b.user_id,
      }
      const result = await sendReminder(admin, 'bookings', target)
      processed++
      if (result.emailed) emailed++
      if (result.whatsapped) whatsapped++
    }

    // ── Experience bookings (date lives on the parent experiences row) ──
    const { data: experiences, error: expErr } = await admin
      .from('experiences')
      .select('id, name, date, start_time, gyms!gym_id(name, location)')
      .eq('date', date)

    if (expErr) console.error('experiences query error:', expErr.message)

    const expIds = (experiences ?? []).map(e => e.id)
    if (expIds.length > 0) {
      const expById = new Map((experiences ?? []).map(e => [e.id, e]))

      const { data: expBookings, error: expBookingsErr } = await admin
        .from('experience_bookings')
        .select('id, experience_id, status, remainder_amount, confirmation_code, guest_name, email, guest_phone, user_id')
        .in('experience_id', expIds)
        .in('status', ['confirmed', 'deposit_paid'])
        .is(column, null)

      if (expBookingsErr) console.error('experience_bookings query error:', expBookingsErr.message)

      // experience_bookings.user_id has no PostgREST-visible FK to public.users
      // (unlike bookings/pt_bookings), so it can't be embedded — batch-fetch instead.
      const expUserIds = [...new Set((expBookings ?? []).map(b => b.user_id).filter(Boolean))]
      const expUsersById = new Map<string, { name: string | null; email: string | null; phone: string | null }>()
      if (expUserIds.length > 0) {
        const { data: expUsers } = await admin.from('users').select('id, name, email, phone').in('id', expUserIds)
        for (const u of expUsers ?? []) expUsersById.set(u.id, u)
      }

      for (const b of expBookings ?? []) {
        const exp = expById.get(b.experience_id) as any
        const gym = Array.isArray(exp?.gyms) ? exp.gyms[0] : exp?.gyms
        const user = b.user_id ? expUsersById.get(b.user_id) : null

        const target: ReminderTarget = {
          bookingId: b.id,
          daysOut, reminderColumn: column,
          isDepositOnly: b.status === 'deposit_paid',
          remainderAmount: b.remainder_amount,
          confirmationCode: b.confirmation_code,
          activityName: exp?.name ?? 'your experience',
          venueName: gym?.name ?? 'the venue',
          venueLocation: gym?.location ?? null,
          activityDate: exp?.date ?? date,
          activityTime: exp?.start_time ?? null,
          customerName: b.guest_name ?? user?.name ?? null,
          email: resolveContactEmail(b.email, user?.email),
          phone: resolveContactPhone(b.guest_phone, null, user?.phone),
          isGuest: !b.user_id,
        }
        const result = await sendReminder(admin, 'experience_bookings', target)
        processed++
        if (result.emailed) emailed++
        if (result.whatsapped) whatsapped++
      }
    }

    // ── PT bookings (no deposit model — always isDepositOnly: false) ──
    const { data: ptBookings, error: ptErr } = await admin
      .from('pt_bookings')
      .select(`
        id, status, confirmation_code, scheduled_date, scheduled_time,
        location_type, location_address, guest_name, guest_email, guest_phone, user_id,
        personal_trainers!pt_id(full_name, professional_name),
        users!user_id(name, email, phone)
      `)
      .eq('scheduled_date', date)
      .eq('status', 'confirmed')
      .is(column, null)

    if (ptErr) console.error('pt_bookings query error:', ptErr.message)

    for (const b of ptBookings ?? []) {
      const pt = Array.isArray(b.personal_trainers) ? b.personal_trainers[0] : b.personal_trainers
      const user = Array.isArray(b.users) ? b.users[0] : b.users

      const target: ReminderTarget = {
        bookingId: b.id,
        daysOut, reminderColumn: column,
        isDepositOnly: false,
        remainderAmount: null,
        confirmationCode: b.confirmation_code,
        activityName: `your session with ${pt?.professional_name ?? pt?.full_name ?? 'your trainer'}`,
        venueName: pt?.professional_name ?? pt?.full_name ?? 'your trainer',
        venueLocation: b.location_address ?? (b.location_type ? b.location_type : null),
        activityDate: b.scheduled_date,
        activityTime: b.scheduled_time,
        customerName: b.guest_name ?? user?.name ?? null,
        email: resolveContactEmail(b.guest_email, user?.email),
        phone: resolveContactPhone(b.guest_phone, null, user?.phone),
        isGuest: !b.user_id,
      }
      const result = await sendReminder(admin, 'pt_bookings', target)
      processed++
      if (result.emailed) emailed++
      if (result.whatsapped) whatsapped++
    }
  }

  return Response.json({ processed, emailed, whatsapped }, { headers: CORS })
})
}

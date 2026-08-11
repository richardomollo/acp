import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  targetDateStr, resolveContactEmail, resolveContactPhone,
  formatTime, buildEmailPayload, buildWhatsAppVariables,
  type ReminderTarget,
} from './index.ts'

// ─── targetDateStr ──────────────────────────────────────────────────────────

Deno.test('targetDateStr: 3 days out from a fixed date', () => {
  const now = new Date('2026-08-11T06:00:00Z')
  assertEquals(targetDateStr(3, now), '2026-08-14')
})

Deno.test('targetDateStr: 1 day out from a fixed date', () => {
  const now = new Date('2026-08-11T06:00:00Z')
  assertEquals(targetDateStr(1, now), '2026-08-12')
})

Deno.test('targetDateStr: correctly rolls over a month boundary', () => {
  const now = new Date('2026-08-30T06:00:00Z')
  assertEquals(targetDateStr(3, now), '2026-09-02')
})

// ─── resolveContactEmail / resolveContactPhone ────────────────────────────
// Guest fields win over the joined users row — same priority order as the
// existing resolvePhone() pattern in notify-booking/index.ts.

Deno.test('resolveContactEmail: prefers guest email over user email', () => {
  assertEquals(resolveContactEmail('guest@example.com', 'user@example.com'), 'guest@example.com')
})

Deno.test('resolveContactEmail: falls back to user email when no guest email', () => {
  assertEquals(resolveContactEmail(null, 'user@example.com'), 'user@example.com')
})

Deno.test('resolveContactEmail: null when neither present', () => {
  assertEquals(resolveContactEmail(null, null), null)
})

Deno.test('resolveContactPhone: normalises a leading-0 Kenyan number', () => {
  assertEquals(resolveContactPhone('0712345678', null, null), '254712345678')
})

Deno.test('resolveContactPhone: prefers guest phone, then payment phone, then user phone', () => {
  assertEquals(resolveContactPhone('0711111111', '0722222222', '0733333333'), '254711111111')
  assertEquals(resolveContactPhone(null, '0722222222', '0733333333'), '254722222222')
  assertEquals(resolveContactPhone(null, null, '0733333333'), '254733333333')
  assertEquals(resolveContactPhone(null, null, null), null)
})

// ─── formatTime ─────────────────────────────────────────────────────────────

Deno.test('formatTime: trims seconds from a HH:MM:SS time string', () => {
  assertEquals(formatTime('18:30:00'), '18:30')
})

Deno.test('formatTime: empty string for null/undefined', () => {
  assertEquals(formatTime(null), '')
  assertEquals(formatTime(undefined), '')
})

// ─── buildEmailPayload / buildWhatsAppVariables ────────────────────────────

function baseTarget(overrides: Partial<ReminderTarget> = {}): ReminderTarget {
  return {
    bookingId: 'b1',
    daysOut: 3,
    reminderColumn: 'reminder_3d_sent_at',
    isDepositOnly: false,
    remainderAmount: null,
    confirmationCode: 'ABC123',
    activityName: 'HIIT Class',
    venueName: 'Zenith Fitness',
    venueLocation: 'Westlands',
    activityDate: '2026-08-14',
    activityTime: '18:00:00',
    customerName: 'Jane',
    email: 'jane@example.com',
    phone: '254712345678',
    isGuest: false,
    ...overrides,
  }
}

Deno.test('buildEmailPayload: carries deposit-balance flag through untouched', () => {
  const payload = buildEmailPayload(baseTarget({ isDepositOnly: true, remainderAmount: 500 }))
  assertEquals(payload.type, 'booking_reminder')
  assertEquals(payload.data.isDepositOnly, true)
  assertEquals(payload.data.remainderAmount, 500)
  assertEquals(payload.data.email, 'jane@example.com')
})

Deno.test('buildWhatsAppVariables: "in 3 days" wording for the 3-day window', () => {
  const vars = buildWhatsAppVariables(baseTarget({ daysOut: 3 }))
  assertEquals(vars[2], 'in 3 days')
})

Deno.test('buildWhatsAppVariables: "tomorrow" wording for the 1-day window', () => {
  const vars = buildWhatsAppVariables(baseTarget({ daysOut: 1, reminderColumn: 'reminder_1d_sent_at' }))
  assertEquals(vars[2], 'tomorrow')
})

Deno.test('buildWhatsAppVariables: paid-in-full booking gets the all-set line', () => {
  const vars = buildWhatsAppVariables(baseTarget({ isDepositOnly: false }))
  assertEquals(vars[6], "You're all paid up ✅")
})

Deno.test('buildWhatsAppVariables: deposit-only booking gets the balance-owed line with the amount', () => {
  const vars = buildWhatsAppVariables(baseTarget({ isDepositOnly: true, remainderAmount: 1500 }))
  assertEquals(vars[6], 'You still owe KES 1,500 — pay via the app or at the venue before check-in.')
})

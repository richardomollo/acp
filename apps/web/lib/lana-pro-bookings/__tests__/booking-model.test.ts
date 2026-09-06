import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisePtBooking,
  normalisePtBookings,
  normaliseSessionBooking,
  mapPtBookingStatus,
  mapSessionBookingStatus,
  mapPtPaymentStatus,
  ptPaymentDisplay,
  sessionPaymentDisplay,
  isOperationallyActive,
  isCompleted,
  isCancelled,
  isNoShow,
  paymentLabel,
  statusLabel,
  toLocalIso,
  type PtBookingRow,
  type SessionBookingRow,
} from '../booking-model.ts';

const apt = (o: Partial<PtBookingRow> = {}): PtBookingRow => ({
  id: 'b1',
  pt_id: 'pt1',
  user_id: 'u1',
  offering_id: 'o1',
  scheduled_date: '2026-09-14',
  scheduled_time: '09:00:00',
  status: 'confirmed',
  payment_status: 'pending',
  payment_method: 'free',
  amount_kes: 3000,
  location_type: null,
  users: { id: 'u1', full_name: 'James Mwangi' },
  pt_offerings: { id: 'o1', title: 'Personal Training', duration_minutes: 60, gym_id: 'g1' },
  ...o,
});

const cls = (o: Partial<SessionBookingRow> = {}): SessionBookingRow => ({
  id: 'c1',
  user_id: 'u2',
  session_id: 's1',
  gym_id: 'g1',
  booking_date: '2026-09-14',
  booking_time: '18:00:00',
  status: 'confirmed',
  checked_in: false,
  no_show: false,
  session_price: 2200,
  users: { id: 'u2', name: 'Jane Doe' },
  sessions: { id: 's1', name: 'Strength Basics', duration_minutes: 45, max_capacity: 8 },
  ...o,
});

// ── §21.1 pt_booking → LanaBooking ──────────────────────────────────────
describe('normalisePtBooking', () => {
  test('maps an appointment with client, service, venue, duration', () => {
    const b = normalisePtBooking(apt(), { professionalName: 'Richard Omollo' })!;
    assert.equal(b.sourceType, 'pt_booking');
    assert.equal(b.kind, 'appointment');
    assert.equal(b.status, 'confirmed');
    assert.equal(b.title, 'Personal Training');
    assert.equal(b.startAt, '2026-09-14T09:00:00');
    assert.equal(b.endAt, '2026-09-14T10:00:00');
    assert.equal(b.clientName, 'James Mwangi');
    assert.equal(b.clientId, 'u1');
    assert.equal(b.serviceId, 'o1');
    assert.equal(b.professionalName, 'Richard Omollo');
    assert.equal(b.venueId, 'g1');
    assert.equal(b.amount, 3000);
    assert.equal(b.href, '/lana-pro/bookings/appointment/b1');
  });

  test('§30 programme bookings are dropped — never a Lana Pro product', () => {
    assert.equal(normalisePtBooking(apt({ pt_offerings: { title: 'X', is_programme: true } })), null);
    const list = normalisePtBookings([apt({ id: 'a' }), apt({ id: 'b', pt_offerings: { title: 'P', is_programme: true } })]);
    assert.deepEqual(list.map((b) => b.sourceId), ['a']);
  });

  test('guest booking → client name from guest_name', () => {
    const b = normalisePtBooking(apt({ user_id: null, users: null, guest_name: 'Walk-in Sam' }))!;
    assert.equal(b.clientName, 'Walk-in Sam');
  });
});

// ── §21.2 class booking → LanaBooking ───────────────────────────────────
describe('normaliseSessionBooking', () => {
  test('maps a class attendee row', () => {
    const b = normaliseSessionBooking(cls());
    assert.equal(b.sourceType, 'class_booking');
    assert.equal(b.kind, 'class');
    assert.equal(b.classId, 's1');
    assert.equal(b.capacity, 8);
    assert.equal(b.title, 'Strength Basics');
    assert.equal(b.startAt, '2026-09-14T18:00:00');
    assert.equal(b.endAt, '2026-09-14T18:45:00');
    assert.equal(b.href, '/lana-pro/bookings/class/c1');
  });
  test('no_show flag beats status', () => {
    const b = normaliseSessionBooking(cls({ no_show: true, status: 'confirmed' }));
    assert.equal(b.status, 'no_show');
    assert.equal(b.noShow, true);
  });
  test('checked_in state is preserved, not flattened', () => {
    const b = normaliseSessionBooking(cls({ checked_in: true, status: 'checked_in' }));
    assert.equal(b.status, 'checked_in');
    assert.equal(b.checkedIn, true);
  });
});

// ── §21.3 status mapping ────────────────────────────────────────────────
describe('status mapping — truthful, not coerced', () => {
  test('pt_bookings enum', () => {
    for (const s of ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']) {
      assert.equal(mapPtBookingStatus(s), s);
    }
    assert.equal(mapPtBookingStatus('weird'), 'pending');
  });
  test('bookings extended enum collapses cancellation variants but keeps the fact of cancellation', () => {
    assert.equal(mapSessionBookingStatus('cancelled_by_customer'), 'cancelled');
    assert.equal(mapSessionBookingStatus('cancelled_by_partner'), 'cancelled');
    assert.equal(mapSessionBookingStatus('rescheduled'), 'rescheduled');
    assert.equal(mapSessionBookingStatus('checked_in'), 'checked_in');
    assert.equal(mapSessionBookingStatus('no_show'), 'no_show');
  });
  test('predicates', () => {
    assert.equal(isOperationallyActive('confirmed'), true);
    assert.equal(isOperationallyActive('checked_in'), true);
    assert.equal(isOperationallyActive('completed'), false);
    assert.equal(isCompleted('completed'), true);
    assert.equal(isCancelled('cancelled'), true);
    assert.equal(isCancelled('rescheduled'), true);
    assert.equal(isNoShow('no_show'), true);
  });
});

// ── §21.4 payment mapping — never fabricate "paid" ──────────────────────
describe('payment mapping', () => {
  test('canonical pt payment status passthrough', () => {
    assert.equal(mapPtPaymentStatus('paid'), 'paid');
    assert.equal(mapPtPaymentStatus('refunded'), 'refunded');
    assert.equal(mapPtPaymentStatus(null), 'unknown');
  });
  test('legacy free/paid shortcut is NOT shown as "paid"', () => {
    assert.equal(ptPaymentDisplay({ payment_status: 'paid', payment_method: 'free', amount_kes: 3000 }), 'not_collected');
    assert.equal(ptPaymentDisplay({ payment_status: 'paid', payment_method: 'mpesa', amount_kes: 3000 }), 'paid');
  });
  test('professional-created (pending + amount) shows as pending, no fabrication', () => {
    assert.equal(ptPaymentDisplay({ payment_status: 'pending', payment_method: 'free', amount_kes: 3000 }), 'pending');
    assert.equal(ptPaymentDisplay({ payment_status: 'pending', payment_method: 'free', amount_kes: null }), 'not_collected');
  });
  test('refunded is surfaced', () => {
    assert.equal(ptPaymentDisplay({ payment_status: 'refunded', amount_kes: 3000 }), 'refunded');
  });
  test('class payment derives from deposit/refund evidence only', () => {
    assert.equal(sessionPaymentDisplay({ session_price: 2200, deposit_paid_at: '2026-09-01', remainder_collected: true }), 'paid');
    assert.equal(sessionPaymentDisplay({ session_price: 2200, deposit_paid_at: '2026-09-01' }), 'pending');
    assert.equal(sessionPaymentDisplay({ session_price: 2200 }), 'pending');
    assert.equal(sessionPaymentDisplay({ session_price: null }), 'not_collected');
    assert.equal(sessionPaymentDisplay({ session_price: 2200, refund_status: 'completed' }), 'refunded');
  });
  test('labels', () => {
    assert.equal(paymentLabel('not_collected'), 'Not collected via Lana');
    assert.equal(statusLabel('no_show'), 'No-show');
    assert.equal(statusLabel('checked_in'), 'Checked in');
  });
});

// ── §21.28 local date boundary / §21.29 no hardcoded EAT ────────────────
describe('date/time handling — wall-clock, deterministic, no timezone shift', () => {
  test('toLocalIso pads and never converts', () => {
    assert.equal(toLocalIso('2026-09-14', '09:00'), '2026-09-14T09:00:00');
    assert.equal(toLocalIso('2026-12-31', '23:30'), '2026-12-31T23:30:00');
  });
  test('a 23:30 booking stays on its own calendar day (no UTC roll)', () => {
    const b = normalisePtBooking(apt({ scheduled_date: '2026-12-31', scheduled_time: '23:30', pt_offerings: { title: 'X', duration_minutes: 60 } }))!;
    assert.equal(b.startAt.slice(0, 10), '2026-12-31');
    assert.equal(b.endAt, '2027-01-01T00:30:00'); // duration crossing midnight is explicit, not a bug
  });
  test('no EAT / Nairobi / +03:00 literal anywhere in the module source', async () => {
    const src = await (await import('node:fs/promises')).readFile(new URL('../booking-model.ts', import.meta.url), 'utf8');
    assert.equal(/EAT|Nairobi|\+03:00|Africa\/Nairobi/.test(src), false);
  });
});

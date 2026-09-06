import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAppointmentDraft,
  buildAppointmentInsert,
  type AppointmentDraft,
  type ExistingBookingLite,
} from '../appointment-draft.ts';

const NOW = '2026-09-06T09:00';

const good: AppointmentDraft = {
  clientUserId: 'client-1',
  gymServiceId: 'svc-1',
  gymTrainerId: 'gt-1',
  startsAtLocal: '2026-09-10T10:00',
  durationMinutes: 60,
  priceKes: 3000,
};

describe('checkAppointmentDraft', () => {
  test('a complete future draft with no conflicts is ok', () => {
    assert.deepEqual(checkAppointmentDraft(good, [], NOW), { ok: true, problems: [] });
  });

  test('missing fields are each reported', () => {
    const r = checkAppointmentDraft({}, [], NOW);
    assert.equal(r.ok, false);
    assert.deepEqual(r.problems.sort(), ['no_client', 'no_datetime', 'no_professional', 'no_service']);
  });

  test('a past datetime is rejected', () => {
    const r = checkAppointmentDraft({ ...good, startsAtLocal: '2026-09-06T08:00' }, [], NOW);
    assert.ok(r.problems.includes('in_the_past'));
  });

  test('zero duration is rejected', () => {
    const r = checkAppointmentDraft({ ...good, durationMinutes: 0 }, [], NOW);
    assert.ok(r.problems.includes('bad_duration'));
  });

  test('overlapping LIVE booking for the SAME trainer → trainer_slot_taken', () => {
    const existing: ExistingBookingLite[] = [
      { gymTrainerId: 'gt-1', startsAtLocal: '2026-09-10T10:30', status: 'confirmed', clientUserId: 'other', gymServiceId: 'svc-9' },
    ];
    const r = checkAppointmentDraft(good, existing, NOW);
    assert.ok(r.problems.includes('trainer_slot_taken'));
  });

  test('overlapping booking for a DIFFERENT trainer is fine', () => {
    const existing: ExistingBookingLite[] = [
      { gymTrainerId: 'gt-2', startsAtLocal: '2026-09-10T10:30', status: 'confirmed', clientUserId: 'other', gymServiceId: 'svc-9' },
    ];
    assert.equal(checkAppointmentDraft(good, existing, NOW).ok, true);
  });

  test('a CANCELLED booking in the slot does not block', () => {
    const existing: ExistingBookingLite[] = [
      { gymTrainerId: 'gt-1', startsAtLocal: '2026-09-10T10:00', status: 'cancelled', clientUserId: 'x', gymServiceId: 'y' },
    ];
    assert.equal(checkAppointmentDraft(good, existing, NOW).ok, true);
  });

  test('exact same client + service + start → exact_duplicate', () => {
    const existing: ExistingBookingLite[] = [
      { gymTrainerId: 'gt-1', startsAtLocal: '2026-09-10T10:00', status: 'pending', clientUserId: 'client-1', gymServiceId: 'svc-1' },
    ];
    const r = checkAppointmentDraft(good, existing, NOW);
    assert.ok(r.problems.includes('exact_duplicate'));
  });
});

describe('buildAppointmentInsert', () => {
  test('produces a venue-owned, not-collected, confirmed row', () => {
    const row = buildAppointmentInsert(good, { gymId: 'gym-1', createdBy: 'user-1' });
    assert.deepEqual(row, {
      gym_id: 'gym-1',
      gym_service_id: 'svc-1',
      gym_trainer_id: 'gt-1',
      client_user_id: 'client-1',
      starts_at: '2026-09-10T10:00:00',
      duration_minutes: 60,
      status: 'confirmed',
      payment_status: 'not_collected',
      price_kes: 3000,
      created_by: 'user-1',
    });
  });
});

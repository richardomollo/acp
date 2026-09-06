import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toClientVisibleSession,
  isClientSafe,
  sessionFieldConfig,
  normaliseSessionExercises,
  buildCompletionPlan,
  canStartSession,
  followUpDate,
  type SessionRecord,
} from '../session-model.ts';

const record = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'sr1',
  bookingSource: 'pt_booking',
  bookingId: 'bk1',
  professionalKind: 'personal_trainer',
  personalTrainerId: 'pt1',
  clientUserId: 'cl1',
  serviceType: 'Strength coaching',
  professionalFlavour: 'training',
  sessionStatus: 'completed',
  startedAt: '2026-09-14T10:00:00Z',
  completedAt: '2026-09-14T11:00:00Z',
  focus: 'Lower-body strength',
  clientSummary: 'Good session, hips felt better.',
  privateNotes: 'Client seemed tired; watch left knee.',
  sessionExercises: [{ exerciseName: 'Squat', sets: 3, reps: 8, loadKg: 60 }],
  followUpAt: '2026-09-21',
  clientResponse: null,
  planIntent: null,
  ...over,
});

describe('CLIENT-VISIBLE projection (§2, §21)', () => {
  test('toClientVisibleSession never carries private fields', () => {
    const v = toClientVisibleSession(record(), 'Richard Omollo');
    assert.equal('privateNotes' in v, false);
    assert.equal('sessionExercises' in v, false);
    assert.equal(isClientSafe(v as unknown as Record<string, unknown>), true);
    assert.equal(v.focus, 'Lower-body strength');
    assert.equal(v.clientSummary, 'Good session, hips felt better.');
    assert.equal(v.professionalName, 'Richard Omollo');
    assert.equal(v.followUpAt, '2026-09-21');
  });

  test('isClientSafe rejects a raw record', () => {
    assert.equal(isClientSafe(record() as unknown as Record<string, unknown>), false);
    assert.equal(isClientSafe({ private_notes: 'x' }), false);
    assert.equal(isClientSafe({ session_exercises: [] }), false);
  });

  test('JSON of a projection contains no private text', () => {
    const raw = JSON.stringify(toClientVisibleSession(record(), 'R'));
    assert.equal(raw.includes('watch left knee'), false);
    assert.equal(raw.includes('Squat'), false);
  });
});

describe('per-flavour field config (§11)', () => {
  test('training shows exercises, hides nutrition', () => {
    const c = sessionFieldConfig('training');
    assert.equal(c.showExercises, true);
    assert.equal(c.showNutritionEvidence, false);
  });
  test('nutrition hides exercises, shows nutrition evidence, renames focus', () => {
    const c = sessionFieldConfig('nutrition');
    assert.equal(c.showExercises, false);
    assert.equal(c.showNutritionEvidence, true);
    assert.equal(c.focusLabel, 'Consultation focus');
  });
  test('therapy / general — no workout or nutrition fields', () => {
    for (const f of ['therapy', 'general'] as const) {
      const c = sessionFieldConfig(f);
      assert.equal(c.showExercises, false);
      assert.equal(c.showNutritionEvidence, false);
    }
  });
  test('null flavour → training default', () => {
    assert.deepEqual(sessionFieldConfig(null), sessionFieldConfig('training'));
  });
});

describe('normaliseSessionExercises', () => {
  test('drops nameless / non-object entries, coerces numbers, caps', () => {
    const out = normaliseSessionExercises([
      { exerciseName: '  Squat  ', sets: '3', reps: 8, loadKg: '60' },
      { sets: 3 },
      'junk',
      { exerciseName: 'RDL', durationSeconds: -5 },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].exerciseName, 'Squat');
    assert.equal(out[0].sets, 3);
    assert.equal(out[0].loadKg, 60);
    assert.equal(out[1].durationSeconds, null);
  });
  test('non-array → []', () => {
    assert.deepEqual(normaliseSessionExercises(null), []);
    assert.deepEqual(normaliseSessionExercises('x'), []);
  });
});

describe('buildCompletionPlan — idempotent (§13, §21)', () => {
  const base = {
    sessionRecordId: 'sr1',
    bookingId: 'bk1',
    personalTrainerId: 'pt1',
    clientUserId: 'cl1',
    focus: 'Lower-body strength',
    privateNotes: 'watch knee',
    clientSummary: 'nice work',
    followUpAt: '2026-09-21',
    sessionExercises: [{ exerciseName: 'Squat' }],
    proposedActions: [{ title: 'Complete Thursday workout' }, { title: 'Recovery Wednesday' }],
    existingSessionActions: [],
    nowIso: '2026-09-14T11:00:00Z',
  };

  test('first completion → record update + 2 task inserts + booking update', () => {
    const plan = buildCompletionPlan(base);
    assert.equal(plan.recordUpdate.session_status, 'completed');
    assert.equal(plan.recordUpdate.completed_at, '2026-09-14T11:00:00Z');
    assert.equal(plan.recordUpdate.private_notes, 'watch knee');
    assert.equal(plan.recordUpdate.client_summary, 'nice work');
    assert.equal(plan.taskInserts.length, 2);
    assert.equal(plan.taskInserts[0].session_record_id, 'sr1');
    assert.equal(plan.taskInserts[0].status, 'pending');
    assert.deepEqual(plan.bookingUpdate, { table: 'pt_bookings', id: 'bk1', set: { status: 'completed' } });
  });

  test('re-completion with the same actions already linked → ZERO new task inserts', () => {
    const plan = buildCompletionPlan({
      ...base,
      existingSessionActions: [
        { id: 't1', title: 'Complete Thursday workout', sessionRecordId: 'sr1' },
        { id: 't2', title: 'recovery   wednesday', sessionRecordId: 'sr1' },
      ],
    });
    assert.equal(plan.taskInserts.length, 0);
  });

  test('adding one new action on re-completion inserts only that one', () => {
    const plan = buildCompletionPlan({
      ...base,
      proposedActions: [{ title: 'Complete Thursday workout' }, { title: 'Book follow-up' }],
      existingSessionActions: [{ id: 't1', title: 'Complete Thursday workout', sessionRecordId: 'sr1' }],
    });
    assert.deepEqual(plan.taskInserts.map((t) => t.title), ['Book follow-up']);
  });

  test('no clientUserId → no task inserts, record + booking still update', () => {
    const plan = buildCompletionPlan({ ...base, clientUserId: null });
    assert.equal(plan.taskInserts.length, 0);
    assert.equal(plan.recordUpdate.session_status, 'completed');
  });

  test('empty fields become null, not empty string', () => {
    const plan = buildCompletionPlan({ ...base, focus: '  ', privateNotes: '', clientSummary: '', sessionExercises: [] });
    assert.equal(plan.recordUpdate.focus, null);
    assert.equal(plan.recordUpdate.private_notes, null);
    assert.equal(plan.recordUpdate.session_exercises, null);
  });

  // ── Phase 6 (Step 6) outcome signals ──
  test('client_response + plan_intent round-trip onto recordUpdate', () => {
    const plan = buildCompletionPlan({ ...base, clientResponse: 'difficult', planIntent: 'keep' });
    assert.equal(plan.recordUpdate.client_response, 'difficult');
    assert.equal(plan.recordUpdate.plan_intent, 'keep');
  });

  test('both default to null when omitted — old records / no capture', () => {
    const plan = buildCompletionPlan(base);
    assert.equal(plan.recordUpdate.client_response, null);
    assert.equal(plan.recordUpdate.plan_intent, null);
  });

  test('invalid enum values are dropped to null (DB CHECK is the backstop)', () => {
    const plan = buildCompletionPlan({ ...base, clientResponse: 'amazing', planIntent: 'stop' });
    assert.equal(plan.recordUpdate.client_response, null);
    assert.equal(plan.recordUpdate.plan_intent, null);
  });

  test('adding the outcome on re-completion does not change task idempotency', () => {
    const a = buildCompletionPlan({ ...base, existingSessionActions: [
      { id: 't1', title: 'Complete Thursday workout', sessionRecordId: 'sr1' },
      { id: 't2', title: 'Recovery Wednesday', sessionRecordId: 'sr1' },
    ] });
    const b = buildCompletionPlan({ ...base, clientResponse: 'good', planIntent: 'progress', existingSessionActions: [
      { id: 't1', title: 'Complete Thursday workout', sessionRecordId: 'sr1' },
      { id: 't2', title: 'Recovery Wednesday', sessionRecordId: 'sr1' },
    ] });
    assert.equal(a.taskInserts.length, 0);
    assert.equal(b.taskInserts.length, 0);
    assert.equal(b.recordUpdate.client_response, 'good');
  });
});

describe('canStartSession (§19 failure states)', () => {
  test('missing / cancelled / no_show / completed booking blocked', () => {
    assert.deepEqual(canStartSession(null), { ok: false, reason: 'booking_missing' });
    assert.equal(canStartSession({ status: 'cancelled' }).ok, false);
    assert.equal(canStartSession({ status: 'no_show' }).ok, false);
    assert.deepEqual(canStartSession({ status: 'completed' }), { ok: false, reason: 'booking_completed' });
  });
  test('confirmed / pending → ok', () => {
    assert.equal(canStartSession({ status: 'confirmed' }).ok, true);
    assert.equal(canStartSession({ status: 'pending' }).ok, true);
  });
});

describe('followUpDate', () => {
  test('presets from a local date, no timezone shift', () => {
    assert.equal(followUpDate('none', '2026-09-14T11:00:00Z'), null);
    assert.equal(followUpDate('1_week', '2026-09-14T11:00:00Z'), '2026-09-21');
    assert.equal(followUpDate('2_weeks', '2026-09-14'), '2026-09-28');
    assert.equal(followUpDate('1_month', '2026-09-14'), '2026-10-14');
  });
});

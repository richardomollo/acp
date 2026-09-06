import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyClientAttention,
  bucketForClient,
  NO_WORKOUT_ATTENTION_DAYS,
  NO_CHECK_IN_ATTENTION_DAYS,
  MIN_HISTORY_DAYS,
} from '../client-attention.ts';

describe('classifyClientAttention — Phase 3 contract (no evidence producer yet)', () => {
  test('no arguments → insufficient_evidence, never needs_attention', () => {
    const r = classifyClientAttention();
    assert.equal(r.verdict, 'insufficient_evidence');
  });

  test('empty evidence object → insufficient_evidence', () => {
    assert.equal(classifyClientAttention({}).verdict, 'insufficient_evidence');
  });

  test('no share_progress consent → insufficient_evidence even with damning signals', () => {
    const r = classifyClientAttention({
      shareProgressConsent: false,
      daysSinceLastWorkout: 999,
      observedHistoryDays: 365,
    });
    assert.equal(r.verdict, 'insufficient_evidence');
    assert.deepEqual(r.reasons, ['no_consent']);
  });

  test('a pending (not accepted) relationship → insufficient_evidence', () => {
    const r = classifyClientAttention({
      shareProgressConsent: true,
      relationshipStatus: 'pending',
      daysSinceLastWorkout: 999,
    });
    assert.equal(r.verdict, 'insufficient_evidence');
  });

  test('consent but too little history → insufficient_evidence', () => {
    const r = classifyClientAttention({
      shareProgressConsent: true,
      daysSinceLastWorkout: 30,
      observedHistoryDays: MIN_HISTORY_DAYS - 1,
    });
    assert.equal(r.verdict, 'insufficient_evidence');
  });
});

describe('classifyClientAttention — rules (for when evidence IS wired in)', () => {
  const base = { shareProgressConsent: true, observedHistoryDays: 90 };

  test('stale workout → needs_attention', () => {
    const r = classifyClientAttention({ ...base, daysSinceLastWorkout: NO_WORKOUT_ATTENTION_DAYS });
    assert.equal(r.verdict, 'needs_attention');
    assert.ok(r.reasons.includes(`no_workout_${NO_WORKOUT_ATTENTION_DAYS}d`));
  });

  test('stale check-in → needs_attention', () => {
    const r = classifyClientAttention({ ...base, daysSinceLastCheckIn: NO_CHECK_IN_ATTENTION_DAYS + 5 });
    assert.equal(r.verdict, 'needs_attention');
  });

  test('low plan adherence → needs_attention', () => {
    const r = classifyClientAttention({ ...base, planAdherenceRatio: 0.2 });
    assert.equal(r.verdict, 'needs_attention');
    assert.ok(r.reasons.includes('low_plan_adherence'));
  });

  test('recent activity, good adherence → ok', () => {
    const r = classifyClientAttention({
      ...base,
      daysSinceLastWorkout: 2,
      daysSinceLastCheckIn: 3,
      planAdherenceRatio: 0.9,
    });
    assert.equal(r.verdict, 'ok');
    assert.deepEqual(r.reasons, []);
  });
});

describe('bucketForClient', () => {
  test('pending relationship → invited', () => {
    assert.equal(
      bucketForClient({ relationshipStatus: 'pending', hasAccount: true }),
      'invited',
    );
  });

  test('inactive relationship → inactive', () => {
    assert.equal(
      bucketForClient({ relationshipStatus: 'inactive', hasAccount: true }),
      'inactive',
    );
  });

  test('active with no evidence → active (NOT needs_attention)', () => {
    assert.equal(
      bucketForClient({ relationshipStatus: 'active', hasAccount: true, evidence: {} }),
      'active',
    );
  });

  test('active with a real consented signal → needs_attention', () => {
    assert.equal(
      bucketForClient({
        relationshipStatus: 'active',
        hasAccount: true,
        evidence: { shareProgressConsent: true, observedHistoryDays: 90, daysSinceLastWorkout: 40 },
      }),
      'needs_attention',
    );
  });
});

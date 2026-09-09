import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkoutFeedbackSignals } from '../derive.ts';
import { CLASSIFIER_VERSION } from '../classifier.ts';
import type { WorkoutFeedbackItem } from '../../lana-pro-progress/progress.ts';

function fb(o: Partial<WorkoutFeedbackItem> = {}): WorkoutFeedbackItem {
  return {
    id: 'h1',
    scope: 'session',
    comment: 'x',
    workoutId: 'w1',
    workoutTitle: 'Lower strength',
    scheduledDate: '2026-09-09',
    submittedAt: '2026-09-09T18:00:00Z',
    completionContext: { status: 'completed', completionPercentage: 100, perceivedDifficulty: null },
    ...o,
  };
}

describe('deriveWorkoutFeedbackSignals — raw evidence is preserved & traceable (§25)', () => {
  test('sourceEvidence is the comment BYTE-FOR-BYTE; never rewritten', () => {
    const comment = 'Squats felt good but my knee hurt during lunges.';
    const [sig] = deriveWorkoutFeedbackSignals([fb({ comment })], 'client-1');
    assert.equal(sig.sourceEvidence, comment);
    assert.equal(sig.type, 'discomfort_reported'); // structured interpretation…
    assert.notEqual(sig.sourceEvidence, 'Knee issue detected.'); // …NOT a paraphrase
  });

  test('every signal references its source: sourceType + sourceId + observedAt + version', () => {
    const [sig] = deriveWorkoutFeedbackSignals([fb({ id: 'h9:ex-lunge', scope: 'exercise', exerciseId: 'ex-lunge', comment: 'knee hurt here' })], 'client-1');
    assert.equal(sig.sourceType, 'workout_feedback_comment');
    assert.equal(sig.sourceId, 'h9:ex-lunge');
    assert.equal(sig.subjectType, 'exercise');
    assert.equal(sig.subjectId, 'ex-lunge');
    assert.equal(sig.workoutId, 'w1');
    assert.equal(sig.observedAt, '2026-09-09T18:00:00Z'); // the session time, not "now"
    assert.equal(sig.clientId, 'client-1');
    assert.equal(sig.classifierVersion, CLASSIFIER_VERSION);
    assert.equal(sig.strength, 'matched_rule');
    assert.equal(sig.matchedRule, 'discomfort');
  });

  test('id is deterministic — re-deriving the same evidence never makes a "new" signal', () => {
    const items = [fb({ comment: 'weights feel too light' }), fb({ id: 'h2', comment: 'only had 20 min', submittedAt: '2026-09-08T18:00:00Z' })];
    const a = deriveWorkoutFeedbackSignals(items, 'client-1');
    const b = deriveWorkoutFeedbackSignals(items, 'client-1');
    assert.deepEqual(a, b);
    assert.deepEqual(a.map((s) => s.id).sort(), [
      'h1#workout_feedback_comment#progression_candidate',
      'h2#workout_feedback_comment#time_constraint',
    ]);
  });

  test('a comment that matches no rule produces NO signal (no fabrication)', () => {
    assert.deepEqual(deriveWorkoutFeedbackSignals([fb({ comment: 'trained outside today, nice weather' })], 'client-1'), []);
  });

  test('empty / whitespace comment → nothing', () => {
    assert.deepEqual(deriveWorkoutFeedbackSignals([fb({ comment: '   ' })], 'client-1'), []);
  });
});

describe('deriveWorkoutFeedbackSignals — pain/discomfort stays factual (§15)', () => {
  test('"Sharp pain in my lower back during deadlifts." → pain_reported, verbatim evidence, no bodyArea/severity', () => {
    const comment = 'Sharp pain in my lower back during deadlifts.';
    const [sig] = deriveWorkoutFeedbackSignals(
      [fb({ id: 'h5:ex-dl', scope: 'exercise', exerciseId: 'ex-dl', comment })],
      'client-1',
    );
    assert.equal(sig.type, 'pain_reported');
    assert.equal(sig.sourceEvidence, comment);
    assert.ok(!('bodyArea' in sig) && !('severity' in sig) && !('injury' in sig));
  });
});

describe('deriveWorkoutFeedbackSignals — structured sources (perceived difficulty, completion %)', () => {
  test('perceived_difficulty "easy" → perceived_difficulty_low (explicit_self_report)', () => {
    const [sig] = deriveWorkoutFeedbackSignals(
      [fb({ comment: 'ok', completionContext: { status: 'completed', completionPercentage: 100, perceivedDifficulty: 'easy' } })],
      'client-1',
    );
    assert.equal(sig.type, 'perceived_difficulty_low');
    assert.equal(sig.sourceType, 'perceived_difficulty');
    assert.equal(sig.strength, 'explicit_self_report');
    assert.equal(sig.sourceEvidence, 'perceived_difficulty=easy');
  });

  test('completion_percentage 55 → incomplete_volume (computed_threshold)', () => {
    const sigs = deriveWorkoutFeedbackSignals(
      [fb({ comment: 'ok', completionContext: { status: 'completed', completionPercentage: 55, perceivedDifficulty: null } })],
      'client-1',
    );
    const inc = sigs.find((s) => s.type === 'incomplete_volume')!;
    assert.equal(inc.sourceType, 'completion_percentage');
    assert.equal(inc.strength, 'computed_threshold');
    assert.equal(inc.sourceEvidence, 'completion_percentage=55');
  });

  test('completion_percentage 100 → no incomplete_volume signal', () => {
    assert.deepEqual(deriveWorkoutFeedbackSignals([fb({ comment: 'ok' })], 'client-1'), []);
  });

  test('a comment-derived signal wins over a structured one for the same (session, type)', () => {
    // both the comment and perceived_difficulty say "too easy" for the same session
    const sigs = deriveWorkoutFeedbackSignals(
      [fb({ comment: 'felt too easy', completionContext: { status: 'completed', completionPercentage: 100, perceivedDifficulty: 'easy' } })],
      'client-1',
    );
    const low = sigs.filter((s) => s.type === 'perceived_difficulty_low');
    assert.equal(low.length, 1);
    assert.equal(low[0].sourceType, 'workout_feedback_comment'); // the richer evidence
  });
});

describe('deriveWorkoutFeedbackSignals — ordering & scope', () => {
  test('newest first', () => {
    const sigs = deriveWorkoutFeedbackSignals(
      [
        fb({ id: 'a', comment: 'too light', submittedAt: '2026-09-01T10:00:00Z' }),
        fb({ id: 'b', comment: 'knee hurt', submittedAt: '2026-09-09T10:00:00Z' }),
      ],
      'client-1',
    );
    assert.deepEqual(sigs.map((s) => s.observedAt), ['2026-09-09T10:00:00Z', '2026-09-01T10:00:00Z']);
  });

  test('the function has NO write path — it returns data, it cannot modify a programme (§25)', () => {
    // structural: pure function, 2 params, returns an array; nothing to assert
    // beyond that it never throws and never touches a db (there is no db arg).
    assert.equal(deriveWorkoutFeedbackSignals.length, 2);
    assert.ok(Array.isArray(deriveWorkoutFeedbackSignals([], 'c')));
  });
});

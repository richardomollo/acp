import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { derivePTInsights } from '../derive.ts';
import { deriveWorkoutFeedbackSignals } from '../../lana-pro-signals/derive.ts';
import { deriveAdherenceSignals } from '../../lana-pro-signals/adherence.ts';
import { computeAdherenceFacts, type ScheduleRow } from '../../lana-pro-progress/progress.ts';
import type { WorkoutFeedbackItem } from '../../lana-pro-progress/progress.ts';

// Build the L2→L3→L4 chain from real modules — nothing about signals is faked.
function chain(feedback: WorkoutFeedbackItem[], name = 'Richard Omollo') {
  const signals = deriveWorkoutFeedbackSignals(feedback, 'client-1');
  const insights = derivePTInsights({ clientId: 'client-1', clientName: name, feedback, signals });
  return { signals, insights };
}

function fb(o: Partial<WorkoutFeedbackItem> = {}): WorkoutFeedbackItem {
  return {
    id: 'h1',
    scope: 'session',
    comment: 'x',
    workoutId: 'w1',
    workoutTitle: 'Upper strength',
    scheduledDate: '2026-09-09',
    submittedAt: '2026-09-09T18:00:00Z',
    completionContext: { status: 'completed', completionPercentage: 100, perceivedDifficulty: null },
    ...o,
  };
}

// ═══════════════════════════ DISCOMFORT (§26) ═══════════════════════════════
describe('L4 — discomfort insight', () => {
  const KNEE = fb({
    id: 'h9:ex-lunge',
    scope: 'exercise',
    comment: 'My knee hurt during lunges.',
    workoutId: 'w-lower',
    workoutTitle: 'Lower strength',
    exerciseId: 'ex-lunge',
    exerciseName: 'Walking lunge',
    scheduledDate: '2026-09-09',
    submittedAt: '2026-09-09T18:00:00Z',
  });

  test('one report → one discomfort insight (no longitudinal repetition needed)', () => {
    const { signals, insights } = chain([KNEE]);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].type, 'discomfort_reported');
    assert.equal(insights.length, 1);
    const i = insights[0];
    assert.equal(i.family, 'discomfort');
    assert.equal(i.title, 'Discomfort reported');
    assert.equal(i.strength, null);
    assert.equal(i.statement, 'Richard reported discomfort during Walking lunge in the most recent workout.');
  });

  test('statement is factual — no injury / diagnosis / severity / treatment / load advice', () => {
    const { insights } = chain([KNEE]);
    const s = insights[0].statement.toLowerCase();
    for (const banned of ['injury', 'injured', 'diagnos', 'severe', 'severity', 'treat', 'rehab', 'reduce', 'increase', 'load', 'kg', '%', 'stop ', 'avoid', 'replace']) {
      assert.ok(!s.includes(banned), `statement must not contain "${banned}": ${insights[0].statement}`);
    }
    // NOT wrapped in quotation marks (that's for CLIENT SAID only)
    assert.ok(!insights[0].statement.includes('"'));
  });

  test('traceable to the exact raw comment, byte-for-byte', () => {
    const { signals, insights } = chain([KNEE]);
    const i = insights[0];
    assert.deepEqual(i.evidenceIds, ['h9:ex-lunge']);
    assert.deepEqual(i.signalIds, [signals[0].id]);
    assert.deepEqual(i.progressRefs, ['workout_history:h9']);
    assert.equal(i.evidence.length, 1);
    assert.equal(i.evidence[0].comment, 'My knee hurt during lunges.'); // === the client's words
    assert.equal(i.evidence[0].workoutTitle, 'Lower strength');
    assert.equal(i.evidence[0].exerciseName, 'Walking lunge');
    assert.equal(i.evidence[0].date, '2026-09-09');
  });

  test('exercise association unavailable → drops the exercise clause, still factual', () => {
    const { insights } = chain([fb({ id: 'h1', scope: 'session', comment: 'my back was aching afterwards', workoutTitle: 'Full body' })]);
    assert.equal(insights[0].statement, 'Richard reported discomfort in the most recent workout.');
  });

  test('a "pain" report reads as pain in the statement (still family discomfort, still no diagnosis)', () => {
    const { signals, insights } = chain([
      fb({ id: 'h1:ex-dl', scope: 'exercise', comment: 'Sharp pain in my lower back during deadlifts.', exerciseId: 'ex-dl', exerciseName: 'Deadlift', workoutTitle: 'Lower strength' }),
    ]);
    assert.equal(signals[0].type, 'pain_reported');
    assert.equal(insights[0].family, 'discomfort');
    assert.equal(insights[0].statement, 'Richard reported pain during Deadlift in the most recent workout.');
    assert.ok(!/injur|back problem/i.test(insights[0].statement));
  });
});

// ═══════════════════════════ PROGRESSION (§27) ══════════════════════════════
describe('L4 — progression insight', () => {
  const S1 = fb({ id: 'h-s1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z', workoutTitle: 'Upper strength' });
  const S2 = fb({ id: 'h-s2', comment: 'Could have done more reps.', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z', workoutTitle: 'Upper strength' });
  const S3 = fb({ id: 'h-s3', comment: 'Weights are starting to feel too light.', scheduledDate: '2026-09-09', submittedAt: '2026-09-09T18:00:00Z', workoutTitle: 'Upper strength' });

  test('3 completed sessions + repeated low-difficulty/progression comments → one insight', () => {
    const { signals, insights } = chain([S1, S2, S3]);
    assert.deepEqual(signals.map((s) => s.type).sort(), ['perceived_difficulty_low', 'progression_candidate', 'progression_candidate']);
    assert.equal(insights.length, 1);
    const i = insights[0];
    assert.equal(i.family, 'progression');
    assert.equal(i.title, 'Progression worth reviewing');
    assert.equal(i.subject.kind, 'workout');
    assert.equal(i.subject.label, 'Upper strength');
    assert.equal(i.window.sessionCount, 3);
    assert.equal(i.strength, 'consistent'); // 3 qualifying sessions
    assert.equal(
      i.statement,
      'Richard has consistently completed recent Upper strength sessions and repeatedly indicated that the prescribed work feels manageable.',
    );
  });

  test('statement describes the PATTERN — no load-increase / % / kg recommendation', () => {
    const s = chain([S1, S2, S3]).insights[0].statement.toLowerCase();
    for (const banned of ['increase', 'add weight', 'heavier', 'kg', '%', 'progress the', 'bump', 'should']) {
      assert.ok(!s.includes(banned), `must not contain "${banned}"`);
    }
  });

  test('references ALL and ONLY the contributing evidence, newest first, traceable', () => {
    const { signals, insights } = chain([S1, S2, S3]);
    const i = insights[0];
    assert.deepEqual(i.evidence.map((e) => e.comment), [
      'Weights are starting to feel too light.',
      'Could have done more reps.',
      'Bench felt easy.',
    ]);
    assert.deepEqual(i.evidenceIds.sort(), ['h-s1', 'h-s2', 'h-s3']);
    assert.deepEqual(i.progressRefs.sort(), ['workout_history:h-s1', 'workout_history:h-s2', 'workout_history:h-s3']);
    for (const id of i.signalIds) assert.ok(signals.some((s) => s.id === id));
  });

  test('≥2 distinct sessions represented', () => {
    const { insights } = chain([S1, S2, S3]);
    const sessions = new Set(insights[0].progressRefs);
    assert.ok(sessions.size >= 2);
  });

  test('strength scales with qualifying session count (2→emerging, 4+→strong)', () => {
    assert.equal(chain([S1, S2]).insights[0].strength, 'emerging');
    const S4 = fb({ id: 'h-s4', comment: 'felt easy again', scheduledDate: '2026-09-12', submittedAt: '2026-09-12T18:00:00Z' });
    assert.equal(chain([S1, S2, S3, S4]).insights[0].strength, 'strong');
  });
});

// ═══════════════════ PROGRESSION — CATEGORY GROUPING (§17/§18) ══════════════
describe('L4 — progression grouping by canonical workout category', () => {
  // §17: three sessions, three DIFFERENT titles, one shared canonical category.
  const C1 = fb({ id: 'h-c1', workoutId: 'w-ua', workoutTitle: 'Upper A', workoutCategory: 'upper_body', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' });
  const C2 = fb({ id: 'h-c2', workoutId: 'w-ub', workoutTitle: 'Upper B', workoutCategory: 'upper_body', comment: 'Could have done more reps.', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' });
  const C3 = fb({ id: 'h-c3', workoutId: 'w-us', workoutTitle: 'Upper Strength', workoutCategory: 'upper_body', comment: 'Weights are starting to feel too light.', scheduledDate: '2026-09-09', submittedAt: '2026-09-09T18:00:00Z' });

  test('§17 — same category across different titles → ONE insight, subject = category, human-readable label', () => {
    const { insights } = chain([C1, C2, C3]);
    assert.equal(insights.length, 1);
    const i = insights[0];
    assert.equal(i.family, 'progression');
    assert.equal(i.subject.kind, 'category');
    assert.equal(i.subject.id, 'upper_body'); // raw workouts.category value, verbatim
    assert.equal(i.subject.label, 'upper-body'); // human-readable, not a title
    assert.equal(i.window.sessionCount, 3); // all 3 sessions contribute
    assert.equal(
      i.statement,
      'Richard has consistently completed recent upper-body sessions and repeatedly indicated that the prescribed work feels manageable.',
    );
    assert.ok(i.statement.includes('recent upper-body sessions'));
  });

  test('§17 — grouping does NOT depend on an identical workout title', () => {
    const { insights } = chain([C1, C2, C3]);
    // titles differ ("Upper A" / "Upper B" / "Upper Strength") yet still one insight
    const titles = new Set([C1, C2, C3].map((s) => s.workoutTitle));
    assert.equal(titles.size, 3);
    assert.equal(insights.length, 1);
    assert.equal(insights[0].subject.kind, 'category');
    assert.deepEqual(insights[0].progressRefs.sort(), ['workout_history:h-c1', 'workout_history:h-c2', 'workout_history:h-c3']);
  });

  test('§18 — different canonical categories are NEVER combined, even at similar difficulty', () => {
    const upper = fb({ id: 'h-u', workoutId: 'w-ua', workoutTitle: 'Upper A', workoutCategory: 'upper_body', comment: 'too light', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T10:00:00Z' });
    const run = fb({ id: 'h-r', workoutId: 'w-run', workoutTitle: '5K run', workoutCategory: 'running', comment: 'felt easy', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T10:00:00Z' });
    assert.deepEqual(chain([upper, run]).insights, []);
  });

  test('category present on only SOME sessions → falls through to exact-title grouping', () => {
    const withCat = fb({ id: 'h-m1', workoutId: 'w-us', workoutTitle: 'Upper strength', workoutCategory: 'upper_body', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' });
    const noCat1 = fb({ id: 'h-m2', workoutId: 'w-us', workoutTitle: 'Upper strength', comment: 'too light', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' });
    const noCat2 = fb({ id: 'h-m3', workoutId: 'w-us', workoutTitle: 'Upper strength', comment: 'Could have done more reps.', scheduledDate: '2026-09-09', submittedAt: '2026-09-09T18:00:00Z' });
    const { insights } = chain([withCat, noCat1, noCat2]);
    assert.equal(insights.length, 1);
    assert.equal(insights[0].subject.kind, 'workout'); // NOT category — not every session had one
    assert.equal(insights[0].subject.label, 'Upper strength');
  });

  test('same category BUT different titles with a mixed-title fallback still prefers category', () => {
    // regression guard: category wins over title even when titlesNorm.size > 1
    const { insights } = chain([C1, C2, C3]);
    assert.notEqual(insights[0].subject.kind, 'workout');
    assert.equal(insights[0].subject.kind, 'category');
  });
});

// ═══════════════════════════ NEGATIVES (§28) ════════════════════════════════
describe('L4 — negative cases (no fabricated insight)', () => {
  test('ONE progression_candidate → no progression insight', () => {
    assert.deepEqual(chain([fb({ comment: 'weights feel too light' })]).insights, []);
  });

  test('two progression signals from the SAME session → not longitudinal → no insight', () => {
    // one comment ("too light") + the same session's perceived_difficulty 'easy'
    const { signals, insights } = chain([
      fb({ id: 'h1', comment: 'too light today', completionContext: { status: 'completed', completionPercentage: 100, perceivedDifficulty: 'easy' } }),
    ]);
    assert.ok(signals.length >= 1);
    assert.deepEqual(insights, []); // one session, no matter how many signals
  });

  test('two UNRELATED subjects → not combined', () => {
    const strength = fb({ id: 'h-a', comment: 'too light', workoutTitle: 'Upper strength', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T10:00:00Z' });
    const run = fb({ id: 'h-b', comment: 'felt easy', workoutTitle: '5k run', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T10:00:00Z' });
    assert.deepEqual(chain([strength, run]).insights, []);
  });

  test('progression comment + incomplete session where completion is required → no unsupported insight', () => {
    const ok = fb({ id: 'h-ok', comment: 'too light', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T10:00:00Z' });
    const incomplete = fb({
      id: 'h-inc',
      comment: 'could have done more but stopped',
      scheduledDate: '2026-09-05',
      submittedAt: '2026-09-05T10:00:00Z',
      completionContext: { status: 'completed', completionPercentage: 40, perceivedDifficulty: null },
    });
    // h-inc yields an incomplete_volume signal (55<70) → disqualified → only 1 qualifying session → no insight
    assert.deepEqual(chain([ok, incomplete]).insights, []);
  });

  test('unsupported comments → no signal → no insight', () => {
    assert.deepEqual(chain([fb({ comment: 'trained at the park, lovely morning' }), fb({ id: 'h2', comment: 'nothing much to report' })]).insights, []);
  });

  test('no feedback → no insight', () => {
    assert.deepEqual(derivePTInsights({ clientId: 'c', clientName: 'X', feedback: [], signals: [] }), []);
  });

  test('§6 SAFETY: "knee hurt but weights felt too light" → discomfort insight only, that session never fuels progression', () => {
    const painSession = fb({
      id: 'h-pain:ex-lunge',
      scope: 'exercise',
      comment: 'My knee hurt during lunges but the weights also felt too light.',
      exerciseId: 'ex-lunge',
      exerciseName: 'Walking lunge',
      workoutTitle: 'Lower strength',
      scheduledDate: '2026-09-09',
      submittedAt: '2026-09-09T18:00:00Z',
    });
    const cleanProg = fb({ id: 'h-clean', comment: 'too light', workoutTitle: 'Lower strength', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T10:00:00Z' });
    const { signals, insights } = chain([painSession, cleanProg]);
    // the pain comment classifies as discomfort_reported (safety-first first match), NOT progression
    assert.ok(signals.some((s) => s.type === 'discomfort_reported'));
    assert.ok(!signals.some((s) => s.sourceId === 'h-pain:ex-lunge' && s.type === 'progression_candidate'));
    const fams = insights.map((i) => i.family);
    assert.ok(fams.includes('discomfort'));
    assert.ok(!fams.includes('progression')); // only 1 clean progression session remains → not longitudinal
  });
});

// ═══════════════════════ STRUCTURAL GUARANTEES (§23/§13) ════════════════════
describe('L4 — structural guarantees', () => {
  test('derivePTInsights is a pure single-arg function — no db handle, cannot write', () => {
    assert.equal(derivePTInsights.length, 1);
    assert.ok(Array.isArray(derivePTInsights({ clientId: 'c', clientName: 'x', feedback: [], signals: [] })));
  });

  test('deterministic — identical input, identical output (ids included)', () => {
    const items = [
      fb({ id: 'h-s1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' }),
      fb({ id: 'h-s2', comment: 'too light', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' }),
    ];
    assert.deepEqual(chain(items).insights, chain(items).insights);
  });

  test('discomfort is ordered before progression (safety first)', () => {
    const items = [
      fb({ id: 'h-p1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' }),
      fb({ id: 'h-p2', comment: 'too light', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' }),
      fb({ id: 'h-d:ex-x', scope: 'exercise', comment: 'shoulder hurt on presses', exerciseId: 'ex-x', exerciseName: 'Overhead press', scheduledDate: '2026-09-06', submittedAt: '2026-09-06T18:00:00Z', workoutTitle: 'Upper strength' }),
    ];
    const { insights } = chain(items);
    assert.equal(insights[0].family, 'discomfort');
    assert.equal(insights[1].family, 'progression');
  });
});

// ═══════════════════════════ ADHERENCE (§18/§19/§42) ═══════════════════════
describe('L4 — adherence insight', () => {
  const TODAY = '2026-09-10';
  const mwf: ScheduleRow = { workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5], is_active: true };
  const titleById = new Map([['w', 'Upper strength']]);
  // baseline 5/6, recent 1/3
  const adhSignals = deriveAdherenceSignals(
    computeAdherenceFacts({
      schedules: [mwf],
      completions: ['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-31'].map((d, i) => ({ id: `c${i}`, workoutId: 'w', date: d })),
      titleById,
      todayLocalDate: TODAY,
    }),
    'client-1',
  );

  test('adherence signal → one adherence insight with the ACTUAL computed comparison', () => {
    const insights = derivePTInsights({ clientId: 'client-1', clientName: 'Richard Omollo', feedback: [], signals: [], adherenceSignals: adhSignals });
    assert.equal(insights.length, 1);
    const i = insights[0];
    assert.equal(i.family, 'adherence');
    assert.equal(i.title, 'Training consistency has dropped');
    assert.equal(i.strength, null);
    assert.equal(
      i.statement,
      'Richard completed 1 of 3 scheduled sessions in the most recent completed week, compared with 5 of 6 across the previous two weeks.',
    );
    assert.deepEqual(i.signalIds, [adhSignals[0].id]);
    // drill-down occurrences carried, split into the two periods, no comments
    assert.ok(i.occurrences && i.occurrences.length === 9);
    assert.ok(i.occurrences!.some((o) => o.period === 'recent') && i.occurrences!.some((o) => o.period === 'baseline'));
    assert.equal(i.evidence.length, 0);
  });

  test('§19/§42 — statement is factual: no motivation / disengaged / struggling / churn / "too busy"', () => {
    const s = derivePTInsights({ clientId: 'c', clientName: 'Richard', feedback: [], signals: [], adherenceSignals: adhSignals })[0].statement.toLowerCase();
    for (const banned of ['motivation', 'disengaged', 'disengage', 'struggling', 'lazy', 'churn', 'commitment', "doesn't care", 'too busy', 'losing interest', 'priorit']) {
      assert.ok(!s.includes(banned), `adherence statement must not contain "${banned}"`);
    }
    assert.ok(!s.includes('"'));
  });

  test('no adherence signal → no adherence insight', () => {
    assert.deepEqual(
      derivePTInsights({ clientId: 'c', clientName: 'x', feedback: [], signals: [], adherenceSignals: [] }),
      [],
    );
  });

  test('§25/§43 — family order is discomfort → adherence → progression', () => {
    const feedback: WorkoutFeedbackItem[] = [
      fb({ id: 'h-d:ex-x', scope: 'exercise', comment: 'shoulder hurt on presses', exerciseId: 'ex-x', exerciseName: 'Overhead press', scheduledDate: '2026-09-06', submittedAt: '2026-09-06T18:00:00Z', workoutTitle: 'Upper strength' }),
      fb({ id: 'h-p1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' }),
      fb({ id: 'h-p2', comment: 'too light', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' }),
    ];
    const signals = deriveWorkoutFeedbackSignals(feedback, 'client-1');
    const insights = derivePTInsights({ clientId: 'client-1', clientName: 'Richard', feedback, signals, adherenceSignals: adhSignals });
    assert.deepEqual(insights.map((i) => i.family), ['discomfort', 'adherence', 'progression']);
  });
});

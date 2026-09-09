import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveWorkoutFeedbackSignals } from '../../lana-pro-signals/derive.ts';
import { derivePTInsights } from '../../lana-pro-insights/derive.ts';
import { deriveSuggestedCoachingActions } from '../derive.ts';
import type { WorkoutFeedbackItem } from '../../lana-pro-progress/progress.ts';

// Full L2 → L3 → L4 → L5 chain from real modules — nothing is faked. L5 only
// ever sees the L4 insights the previous layers produced.
function chain(feedback: WorkoutFeedbackItem[], name = 'Richard Omollo') {
  const signals = deriveWorkoutFeedbackSignals(feedback, 'client-1');
  const insights = derivePTInsights({ clientId: 'client-1', clientName: name, feedback, signals });
  const actions = deriveSuggestedCoachingActions({ clientId: 'client-1', clientName: name, insights });
  return { signals, insights, actions };
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

// prescriptive / clinical language that L5 must NEVER emit (§5/§7/§28/§35)
const BANNED = [
  'increase', 'reduce', 'remove', 'replace', 'prescrib', 'diagnos', 'injur',
  'treatment', 'physio', 'refer ', 'referral', 'contraindicat', 'must ',
  'should immediately', 'add weight', 'heavier', 'lighter', ' kg', '%', '1rm',
  'add a set', 'add another set', 'drop set', 'stop ', 'avoid ', 'medical',
];
function assertSafe(statement: string) {
  const s = statement.toLowerCase();
  for (const b of BANNED) {
    assert.ok(!s.includes(b), `L5 statement must not contain "${b}": ${statement}`);
  }
  assert.ok(!statement.includes('"'), 'L5 statement is never wrapped in quotes');
}

// ═══════════════════════════ DISCOMFORT (§28) ══════════════════════════════
describe('L5 — discomfort_review action', () => {
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

  test('§28 — one discomfort insight → exactly one advisory review action', () => {
    const { insights, actions } = chain([KNEE]);
    assert.equal(insights.length, 1);
    assert.equal(actions.length, 1);
    const a = actions[0];
    assert.equal(a.family, 'discomfort_review');
    assert.equal(a.priority, 'attention');
    assert.equal(a.title, 'Review client feedback');
    assert.equal(a.insightId, insights[0].id); // references the originating insight
    assert.equal(a.clientId, 'client-1');
    assert.equal(a.id, `discomfort_review:${insights[0].id}`);
    assert.equal(a.createdFrom, 'Discomfort reported');
    assert.ok(/review|discuss|check in/i.test(a.statement), 'advises reviewing/discussing');
    assertSafe(a.statement);
  });

  test('§28 — statement never prescribes a programme change or a diagnosis', () => {
    const a = chain([KNEE]).actions[0];
    // exercise context is reliable here → it may name the movement, factually
    assert.ok(a.statement.includes('Walking lunge'));
    assert.ok(a.statement.includes('discomfort'));
    for (const banned of ['remove lunges', 'reduce lunge', 'replace lunges', 'knee injury', 'physiotherapist', 'stop lower-body']) {
      assert.ok(!a.statement.toLowerCase().includes(banned), banned);
    }
  });

  test('exercise context unavailable → generic, still advisory', () => {
    const { actions } = chain([fb({ id: 'h1', scope: 'session', comment: 'my back was aching afterwards', workoutTitle: 'Full body' })]);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].statement, 'Review this feedback with Richard before the next relevant training session.');
    assertSafe(actions[0].statement);
  });
});

// ═══════════════════════════════ PAIN (§29) ════════════════════════════════
describe('L5 — pain wording stays advisory', () => {
  test('§29 — "pain" from L4 is carried through; never becomes "injury" / "stop" / "refer"', () => {
    const { insights, actions } = chain([
      fb({ id: 'h1:ex-dl', scope: 'exercise', comment: 'Sharp pain in my lower back during deadlifts.', exerciseId: 'ex-dl', exerciseName: 'Deadlift', workoutTitle: 'Lower strength' }),
    ]);
    assert.equal(insights[0].descriptor, 'pain');
    const a = actions[0];
    assert.equal(a.family, 'discomfort_review');
    assert.equal(
      a.statement,
      'Check in with Richard about the reported pain during Deadlift before the next relevant training session.',
    );
    assert.ok(a.statement.includes('pain'));
    for (const banned of ['injured', 'injury', 'stop deadlift', 'refer', 'physio', 'diagnos']) {
      assert.ok(!a.statement.toLowerCase().includes(banned), banned);
    }
    assertSafe(a.statement);
  });

  test('V1 has NO severity model — no urgency language even for pain', () => {
    const { actions } = chain([
      fb({ id: 'h1:ex-dl', scope: 'exercise', comment: 'Sharp pain in my lower back during deadlifts.', exerciseId: 'ex-dl', exerciseName: 'Deadlift', workoutTitle: 'Lower strength' }),
    ]);
    for (const urgent of ['urgent', 'immediately', 'as soon as possible', 'asap', 'critical', 'emergency', 'danger']) {
      assert.ok(!actions[0].statement.toLowerCase().includes(urgent), urgent);
    }
  });
});

// ═══════════════════════════ PROGRESSION (§30/§31) ═════════════════════════
describe('L5 — progression_review action', () => {
  // §30: three sessions, different titles, one shared canonical category.
  const C1 = fb({ id: 'h-c1', workoutId: 'w-ua', workoutTitle: 'Upper A', workoutCategory: 'upper_body', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' });
  const C2 = fb({ id: 'h-c2', workoutId: 'w-ub', workoutTitle: 'Upper B', workoutCategory: 'upper_body', comment: 'Could have done more reps.', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' });
  const C3 = fb({ id: 'h-c3', workoutId: 'w-us', workoutTitle: 'Upper Strength', workoutCategory: 'upper_body', comment: 'Weights are starting to feel too light.', scheduledDate: '2026-09-09', submittedAt: '2026-09-09T18:00:00Z' });

  test('§30 — category-subject progression insight → one review action with human category language', () => {
    const { insights, actions } = chain([C1, C2, C3]);
    assert.equal(insights.length, 1);
    assert.equal(insights[0].subject.kind, 'category');
    assert.equal(actions.length, 1);
    const a = actions[0];
    assert.equal(a.family, 'progression_review');
    assert.equal(a.priority, 'review');
    assert.equal(a.title, 'Review progression');
    assert.equal(a.insightId, insights[0].id);
    assert.equal(a.id, `progression_review:${insights[0].id}`);
    assert.equal(a.createdFrom, 'Progression worth reviewing');
    assert.equal(
      a.statement,
      "Consider reviewing whether progression is appropriate for Richard's next upper-body training block.",
    );
    assertSafe(a.statement);
    for (const banned of ['5 kg', 'another set', '80%', '5×5', '5x5', 'progress all']) {
      assert.ok(!a.statement.toLowerCase().includes(banned), banned);
    }
  });

  test('§31 — exercise-subject progression → names the exercise, does NOT broaden to the category', () => {
    const B1 = fb({ id: 'h-b1:ex-bench', scope: 'exercise', exerciseId: 'ex-bench', exerciseName: 'Bench press', comment: 'Bench felt easy.', workoutTitle: 'Upper A', workoutCategory: 'upper_body', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' });
    const B2 = fb({ id: 'h-b2:ex-bench', scope: 'exercise', exerciseId: 'ex-bench', exerciseName: 'Bench press', comment: 'Weights are starting to feel too light.', workoutTitle: 'Upper A', workoutCategory: 'upper_body', scheduledDate: '2026-09-09', submittedAt: '2026-09-09T18:00:00Z' });
    const { insights, actions } = chain([B1, B2]);
    assert.equal(insights[0].subject.kind, 'exercise');
    assert.equal(actions.length, 1);
    assert.equal(
      actions[0].statement,
      "Consider reviewing whether progression is appropriate for Richard's Bench press.",
    );
    assert.ok(/bench press/i.test(actions[0].statement));
    assert.ok(!actions[0].statement.toLowerCase().includes('upper-body'));
    assertSafe(actions[0].statement);
  });

  test('workout-subject progression → "sessions" phrasing', () => {
    const S1 = fb({ id: 'h-s1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z', workoutTitle: 'Upper strength' });
    const S2 = fb({ id: 'h-s2', comment: 'Could have done more reps.', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z', workoutTitle: 'Upper strength' });
    const S3 = fb({ id: 'h-s3', comment: 'Weights are starting to feel too light.', scheduledDate: '2026-09-09', submittedAt: '2026-09-09T18:00:00Z', workoutTitle: 'Upper strength' });
    const { insights, actions } = chain([S1, S2, S3]);
    assert.equal(insights[0].subject.kind, 'workout');
    assert.equal(actions[0].statement, "Consider reviewing progression for Richard's Upper strength sessions.");
    assertSafe(actions[0].statement);
  });
});

// ═══════════════════ ONE INSIGHT → ONE ACTION / ORDERING (§12/§14) ═════════
describe('L5 — structural rules', () => {
  const items = [
    fb({ id: 'h-p1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' }),
    fb({ id: 'h-p2', comment: 'too light', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' }),
    fb({ id: 'h-d:ex-x', scope: 'exercise', comment: 'shoulder hurt on presses', exerciseId: 'ex-x', exerciseName: 'Overhead press', scheduledDate: '2026-09-06', submittedAt: '2026-09-06T18:00:00Z', workoutTitle: 'Upper strength' }),
  ];

  test('§12 — exactly one action per qualifying insight', () => {
    const { insights, actions } = chain(items);
    assert.equal(insights.length, 2);
    assert.equal(actions.length, 2);
    // no insight produces a second, cascaded action
    assert.equal(new Set(actions.map((a) => a.insightId)).size, 2);
  });

  test('§14 — discomfort_review is ordered before progression_review', () => {
    const { actions } = chain(items);
    assert.equal(actions[0].family, 'discomfort_review');
    assert.equal(actions[1].family, 'progression_review');
  });

  test('§13 — deterministic ids: `${family}:${insightId}`, unique, no random', () => {
    const { insights, actions } = chain(items);
    for (const a of actions) {
      assert.equal(a.id, `${a.family}:${a.insightId}`);
      assert.ok(insights.some((i) => i.id === a.insightId));
    }
    assert.equal(new Set(actions.map((a) => a.id)).size, actions.length);
  });

  test('§33 — same insights in → deepEqual actions out (ids included)', () => {
    assert.deepEqual(chain(items).actions, chain(items).actions);
  });

  test('§34 — every action.insightId resolves to a supplied L4 insight', () => {
    const { insights, actions } = chain(items);
    const ids = new Set(insights.map((i) => i.id));
    for (const a of actions) assert.ok(ids.has(a.insightId));
  });
});

// ═══════════════════════ NO ACTION WITHOUT INSIGHT (§21/§22/§32) ═══════════
describe('L5 — no fabricated / generic actions', () => {
  test('§32 — no insights → no actions', () => {
    assert.deepEqual(chain([]).actions, []);
    assert.deepEqual(deriveSuggestedCoachingActions({ clientId: 'c', clientName: 'X', insights: [] }), []);
  });

  test('§21 — signals but no insight (single progression signal) → no action', () => {
    const { signals, insights, actions } = chain([fb({ comment: 'weights feel too light' })]);
    assert.ok(signals.length >= 1);
    assert.deepEqual(insights, []);
    assert.deepEqual(actions, []);
  });

  test('§22 — never emits generic coaching filler', () => {
    const { actions } = chain([
      fb({ id: 'h9:ex-lunge', scope: 'exercise', comment: 'My knee hurt during lunges.', workoutId: 'w-lower', workoutTitle: 'Lower strength', exerciseId: 'ex-lunge', exerciseName: 'Walking lunge' }),
    ]);
    for (const a of actions) {
      for (const filler of ['keep up the good work', 'everything is on track', 'no action needed', 'encourage consistency', 'check in with your client']) {
        assert.ok(!a.statement.toLowerCase().includes(filler), filler);
      }
    }
  });
});

// ═══════════════════════════ SAFETY SWEEP (§35) ════════════════════════════
describe('L5 — safety sweep over every generated statement', () => {
  test('§35 — no prescriptive / clinical language across a mixed fixture', () => {
    const mixed = chain([
      fb({ id: 'h9:ex-lunge', scope: 'exercise', comment: 'My knee hurt during lunges.', workoutId: 'w-lower', workoutTitle: 'Lower strength', exerciseId: 'ex-lunge', exerciseName: 'Walking lunge', scheduledDate: '2026-09-08', submittedAt: '2026-09-08T18:00:00Z' }),
      fb({ id: 'h-p1', comment: 'Bench felt easy.', scheduledDate: '2026-09-02', submittedAt: '2026-09-02T18:00:00Z' }),
      fb({ id: 'h-p2', comment: 'too light', scheduledDate: '2026-09-05', submittedAt: '2026-09-05T18:00:00Z' }),
    ]);
    assert.ok(mixed.actions.length >= 2);
    for (const a of mixed.actions) {
      assertSafe(a.statement);
      assert.ok(a.title === 'Review client feedback' || a.title === 'Review progression');
    }
  });
});

// ═══════════════════════ PURE — NO SIDE EFFECTS (§23/§24/§25/§36) ══════════
describe('L5 — purity guarantees', () => {
  test('§36 — the derive module has no db / network / llm / router / mutation surface', () => {
    const src = readFileSync(fileURLToPath(new URL('../derive.ts', import.meta.url)), 'utf8');
    for (const forbidden of ['supabase', 'createClient', 'fetch(', 'openai', 'anthropic', 'axios', '.insert(', '.update(', '.upsert(', '.from(', 'useRouter', 'redirect(', 'process.env']) {
      assert.ok(!src.toLowerCase().includes(forbidden.toLowerCase()), `derive.ts must not reference "${forbidden}"`);
    }
  });

  test('§25/§26 — pure single-arg function, returns an array, no auth of its own', () => {
    assert.equal(deriveSuggestedCoachingActions.length, 1);
    assert.ok(Array.isArray(deriveSuggestedCoachingActions({ clientId: 'c', clientName: 'x', insights: [] })));
  });

  test('§37 — L5 does not import the legacy lana-pro-intelligence suggested-actions', () => {
    const src = readFileSync(fileURLToPath(new URL('../derive.ts', import.meta.url)), 'utf8');
    assert.ok(!src.includes('lana-pro-intelligence'));
    assert.ok(!src.includes('deriveSuggestedActions'));
  });
});

// ═══════════════════════════ ADHERENCE (§22/§23/§24) ══════════════════════
describe('L5 — adherence_review action', () => {
  // a minimal adherence PTInsight, shaped exactly as L4 emits it
  const adherenceInsight = {
    id: 'adherence:adherence_drop:client-1:2026-08-17_2026-09-06',
    clientId: 'client-1',
    family: 'adherence' as const,
    subject: { kind: 'overall' as const, label: null },
    window: { kind: 'recent_sessions' as const, sessionCount: 9, from: '2026-08-17', to: '2026-09-06' },
    evidenceIds: [] as string[],
    signalIds: ['adherence_drop:client-1:2026-08-17_2026-09-06'],
    progressRefs: [] as string[],
    strength: null,
    title: 'Training consistency has dropped',
    statement:
      'Richard completed 1 of 3 scheduled sessions in the most recent completed week, compared with 5 of 6 across the previous two weeks.',
    observedAt: '2026-09-06T23:59:59Z',
    evidence: [],
    occurrences: [
      { date: '2026-09-02', workoutTitle: 'Upper strength', status: 'missed' as const, period: 'recent' as const },
    ],
  };

  test('§22 — one adherence insight → one advisory check-in action', () => {
    const actions = deriveSuggestedCoachingActions({ clientId: 'client-1', clientName: 'Richard Omollo', insights: [adherenceInsight] });
    assert.equal(actions.length, 1);
    const a = actions[0];
    assert.equal(a.family, 'adherence_review');
    assert.equal(a.priority, 'review');
    assert.equal(a.title, 'Check in on training consistency');
    assert.equal(a.statement, 'Consider checking in with Richard about the recent change in training consistency.');
    assert.equal(a.insightId, adherenceInsight.id);
    assert.equal(a.id, `adherence_review:${adherenceInsight.id}`);
    assert.equal(a.createdFrom, 'Training consistency has dropped');
    assertSafe(a.statement);
  });

  test('§23/§24 — never prescribes the fix (fewer sessions / weekends / shorter / easier / reminder / motivation)', () => {
    const s = deriveSuggestedCoachingActions({ clientId: 'c', clientName: 'Richard', insights: [adherenceInsight] })[0].statement.toLowerCase();
    for (const banned of ['two sessions', 'fewer sessions', 'weekend', 'shorter', 'easier', 'reminder', 'motivation', 'reduce', 'move his', 'make the programme']) {
      assert.ok(!s.includes(banned), `adherence action must not contain "${banned}"`);
    }
  });

  test('§25 — ordering: discomfort_review → adherence_review → progression_review', () => {
    const discomfort = { ...adherenceInsight, id: 'discomfort:x', family: 'discomfort' as const, title: 'Discomfort reported', subject: { kind: 'workout' as const, label: 'Lower strength' }, occurrences: undefined, observedAt: '2026-09-06T10:00:00Z' };
    const progression = { ...adherenceInsight, id: 'progression:x', family: 'progression' as const, title: 'Progression worth reviewing', subject: { kind: 'category' as const, id: 'upper_body', label: 'upper-body' }, occurrences: undefined, observedAt: '2026-09-06T10:00:00Z' };
    const actions = deriveSuggestedCoachingActions({
      clientId: 'c', clientName: 'Richard',
      insights: [progression, adherenceInsight, discomfort],
    });
    assert.deepEqual(actions.map((a) => a.family), ['discomfort_review', 'adherence_review', 'progression_review']);
  });
});

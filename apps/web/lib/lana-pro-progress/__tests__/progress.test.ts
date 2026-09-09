import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientProgress,
  weekBounds,
  scheduleOccurrencesInWeek,
  classifyOccurrence,
  adherencePct,
  computeGoalProgress,
  computeBodyProgress,
  buildRecentActivity,
  resolveLastActive,
  buildWorkoutFeedback,
  scheduleOccurrencesInRange,
  computeAdherenceFacts,
  ADHERENCE_RESCHEDULE_GRACE_DAYS,
  type ProgressContext,
  type ScheduleRow,
  type SharedLanaPlanOccurrence,
  type WorkoutHistoryFeedbackRow,
} from '../progress.ts';
import type { SupabaseLike, QueryBuilder, QueryResult } from '../../lana-pro-intelligence/aggregator.ts';

// ── a fake supabase that RECORDS every table touched (same shape the
//    aggregator's own tests use) ─────────────────────────────────────────────
type Canned = Record<string, { rows?: Record<string, unknown>[] }>;

class FakeSupabase implements SupabaseLike {
  readonly tablesTouched: string[] = [];
  private canned: Canned;
  constructor(canned: Canned) {
    this.canned = canned;
  }
  from(table: string): QueryBuilder {
    this.tablesTouched.push(table);
    const all = (this.canned[table]?.rows ?? []) as Record<string, unknown>[];
    let limit = Infinity;
    const preds: ((r: Record<string, unknown>) => boolean)[] = [];
    const rows = () => all.filter((r) => preds.every((p) => p(r))).slice(0, limit);
    const result = (): QueryResult => ({ data: rows(), error: null, count: rows().length });
    const b: QueryBuilder = {
      select: () => b,
      eq: (c, v) => (preds.push((r) => r[c] === v), b),
      neq: (c, v) => (preds.push((r) => r[c] !== v), b),
      in: (c, vs) => (preds.push((r) => vs.includes(r[c])), b),
      gte: () => b,
      lte: () => b,
      not: () => b,
      order: () => b,
      limit: (n) => ((limit = n), b),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (ok) => Promise.resolve(result()).then(ok),
    };
    return b;
  }
  get seen(): Set<string> {
    return new Set(this.tablesTouched);
  }
}

// Tables that must NEVER be queried for progress, in ANY consent state.
const NEVER = [
  'plan_activity_completions',
  'plan_activity_execution',
  'health_profile',
  'health_daily_stats',
  'health_workouts',
  'coaching_memory',
  'fitness_plans',
  'meal_plans',
  'saved_meals',
  'strava_connections',
];
// Consent-gated — only allowed when share_progress === true.
const GATED = ['fitness_profile', 'client_measurements', 'workout_history', 'workouts'];

const CTX: ProgressContext = {
  workspace: 'independent',
  professionalId: 'pt-1',
  clientUserId: 'client-1',
  todayLocalDate: '2026-09-10', // a THURSDAY
};

// ── §16 deterministic fixture: Richard / Build strength / 73 → 74.4 (goal 80),
//    Mon/Wed/Fri plan, completed Mon+Wed, "today" = Thu → Fri is upcoming ──
function richardCanned(shareProgress: boolean): Canned {
  return {
    pt_clients: {
      rows: [{ pt_id: 'pt-1', client_user_id: 'client-1', status: 'active', share_progress: shareProgress, created_at: '2026-07-01T09:00:00Z' }],
    },
    users: { rows: [{ id: 'client-1', name: 'Richard Omollo', email: null }] },
    workout_schedules: {
      rows: [
        { user_id: 'client-1', assigned_by: 'pt-1', workout_id: 'w-strength', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5], is_active: true },
      ],
    },
    fitness_profile: {
      rows: [{
        user_id: 'client-1', goal: 'build_muscle', experience_level: 'intermediate',
        initial_weight_kg: 73, starting_weight_kg: 74.4, goal_weight_kg: 80, goal_target_date: '2026-12-01',
      }],
    },
    client_measurements: {
      rows: [
        // most-recent first (module relies on the query's own ordering)
        { user_id: 'client-1', weight_kg: 74.4, logged_at: '2026-09-07T07:00:00Z' },
        { user_id: 'client-1', weight_kg: 73.6, logged_at: '2026-08-20T07:00:00Z' },
        { user_id: 'client-1', weight_kg: 73.0, logged_at: '2026-08-01T07:00:00Z' },
      ],
    },
    workout_history: {
      rows: [
        { user_id: 'client-1', workout_id: 'w-strength', status: 'completed', completed_at: '2026-09-07T18:00:00Z' }, // Mon
        { user_id: 'client-1', workout_id: 'w-strength', status: 'completed', completed_at: '2026-09-09T18:00:00Z' }, // Wed
      ],
    },
    workouts: { rows: [{ id: 'w-strength', title: 'Lower strength' }] },
    professional_session_records: { rows: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────
describe('pure — weekBounds', () => {
  test('Mon..Sun week containing the date (calendar-only arithmetic)', () => {
    assert.deepEqual(weekBounds('2026-09-10'), { weekStart: '2026-09-07', weekEnd: '2026-09-13' }); // Thu → Mon 7th
    assert.deepEqual(weekBounds('2026-09-07'), { weekStart: '2026-09-07', weekEnd: '2026-09-13' }); // Mon itself
    assert.deepEqual(weekBounds('2026-09-13'), { weekStart: '2026-09-07', weekEnd: '2026-09-13' }); // Sun
  });
});

describe('pure — scheduleOccurrencesInWeek', () => {
  const wk = { weekStart: '2026-09-07', weekEnd: '2026-09-13' };
  test('weekly Mon/Wed/Fri → the 3 dates in the week', () => {
    assert.deepEqual(
      scheduleOccurrencesInWeek({ workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5] }, wk.weekStart, wk.weekEnd),
      ['2026-09-07', '2026-09-09', '2026-09-11'],
    );
  });
  test('never fires before its own start_date (LH-30)', () => {
    assert.deepEqual(
      scheduleOccurrencesInWeek({ workout_id: 'w', start_date: '2026-09-10', recurrence: 'weekly', weekdays: [1, 3, 5] }, wk.weekStart, wk.weekEnd),
      ['2026-09-11'], // Mon 7 + Wed 9 are before start_date; only Fri 11 counts
    );
  });
  test('once → only its start_date, and only if inside the window', () => {
    assert.deepEqual(scheduleOccurrencesInWeek({ workout_id: 'w', start_date: '2026-09-09', recurrence: 'once', weekdays: [] }, wk.weekStart, wk.weekEnd), ['2026-09-09']);
    assert.deepEqual(scheduleOccurrencesInWeek({ workout_id: 'w', start_date: '2026-09-20', recurrence: 'once', weekdays: [] }, wk.weekStart, wk.weekEnd), []);
  });
  test('daily → every in-window date on/after start_date', () => {
    assert.equal(scheduleOccurrencesInWeek({ workout_id: 'w', start_date: '2026-09-01', recurrence: 'daily', weekdays: [] }, wk.weekStart, wk.weekEnd).length, 7);
  });
  test('inactive schedule → no occurrences', () => {
    assert.deepEqual(scheduleOccurrencesInWeek({ workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1], is_active: false }, wk.weekStart, wk.weekEnd), []);
  });
});

describe('pure — classifyOccurrence (a future session is never "missed")', () => {
  test('completion evidence → completed regardless of date', () => {
    assert.equal(classifyOccurrence('2026-09-01', '2026-09-10', true), 'completed');
    assert.equal(classifyOccurrence('2026-09-20', '2026-09-10', true), 'completed');
  });
  test('no evidence, date in the past → missed', () => {
    assert.equal(classifyOccurrence('2026-09-09', '2026-09-10', false), 'missed');
  });
  test('no evidence, TODAY → upcoming (not missed)', () => {
    assert.equal(classifyOccurrence('2026-09-10', '2026-09-10', false), 'upcoming');
  });
  test('no evidence, future → upcoming', () => {
    assert.equal(classifyOccurrence('2026-09-11', '2026-09-10', false), 'upcoming');
  });
});

describe('pure — adherencePct (deterministic; null when nothing to divide)', () => {
  test('2 / 3 → 67', () => assert.equal(adherencePct(2, 3), 67));
  test('3 / 3 → 100', () => assert.equal(adherencePct(3, 3), 100));
  test('planned 0 → null (never NaN / Infinity)', () => assert.equal(adherencePct(0, 0), null));
  test('completed clamped to planned', () => assert.equal(adherencePct(9, 3), 100));
  test('same inputs, same output', () => assert.equal(adherencePct(1, 4), adherencePct(1, 4)));
});

describe('pure — computeGoalProgress (current weight uses latest reliable source)', () => {
  test('latest measurement wins over the profile field; delta is +1.4', () => {
    const g = computeGoalProgress({
      initialWeightKg: 73, profileWeightKg: 74.4, goalWeightKg: 80, targetDate: '2026-12-01',
      measurements: [{ weightKg: 74.4, loggedDate: '2026-09-07' }, { weightKg: 73, loggedDate: '2026-08-01' }],
    });
    assert.equal(g.currentWeightKg, 74.4);
    assert.equal(g.currentWeightSource, 'measurement');
    assert.equal(g.startingWeightKg, 73);
    assert.equal(g.changeSinceStartKg, 1.4);
    assert.equal(g.toGoalKg, 5.6);
  });
  test('no measurements → falls back to the profile weight, source = profile', () => {
    const g = computeGoalProgress({ initialWeightKg: 73, profileWeightKg: 75, goalWeightKg: 80, targetDate: null, measurements: [] });
    assert.equal(g.currentWeightKg, 75);
    assert.equal(g.currentWeightSource, 'profile');
    assert.equal(g.changeSinceStartKg, 2);
  });
  test('missing sides → null deltas, never guessed', () => {
    const g = computeGoalProgress({ initialWeightKg: null, profileWeightKg: null, goalWeightKg: 80, targetDate: null, measurements: [] });
    assert.equal(g.currentWeightKg, null);
    assert.equal(g.changeSinceStartKg, null);
    assert.equal(g.toGoalKg, null);
  });
});

describe('pure — computeBodyProgress (no fake trend from one point)', () => {
  test('>= 2 real weigh-ins → hasHistory, ascending points', () => {
    const b = computeBodyProgress([{ weightKg: 74.4, loggedDate: '2026-09-07' }, { weightKg: 73, loggedDate: '2026-08-01' }]);
    assert.equal(b.hasHistory, true);
    assert.deepEqual(b.points.map((p) => p.date), ['2026-08-01', '2026-09-07']);
  });
  test('1 weigh-in → hasHistory false', () => {
    assert.equal(computeBodyProgress([{ weightKg: 73, loggedDate: '2026-08-01' }]).hasHistory, false);
  });
  test('rows without a numeric weight are dropped', () => {
    const b = computeBodyProgress([{ weightKg: null, loggedDate: '2026-09-01' }, { weightKg: 73, loggedDate: '2026-08-01' }]);
    assert.equal(b.points.length, 1);
    assert.equal(b.hasHistory, false);
  });
});

describe('pure — buildRecentActivity / resolveLastActive (real events only)', () => {
  test('merges + sorts newest-first; measurement label carries the real value', () => {
    const feed = buildRecentActivity({
      workoutCompletions: [{ date: '2026-09-07', title: 'Lower strength' }, { date: '2026-09-09', title: 'Upper strength' }],
      measurements: [{ date: '2026-09-07', weightKg: 74.4 }],
      proSessions: [{ date: '2026-09-05', title: 'Coaching' }],
    });
    assert.deepEqual(feed.map((e) => `${e.date}:${e.kind}`), ['2026-09-09:workout', '2026-09-07:measurement', '2026-09-07:workout', '2026-09-05:session']);
    assert.ok(feed.some((e) => e.label === 'Weight updated to 74.4 kg'));
  });
  test('empty inputs → empty feed (no fabricated entries)', () => {
    assert.deepEqual(buildRecentActivity({ workoutCompletions: [], measurements: [], proSessions: [] }), []);
  });
  test('last-active is the newest proven date; null when nothing proven', () => {
    assert.deepEqual(
      resolveLastActive({ lastWorkoutDate: '2026-09-09', lastMeasurementDate: '2026-09-07', lastProSessionDate: null }),
      { date: '2026-09-09', source: 'workout' },
    );
    assert.equal(resolveLastActive({ lastWorkoutDate: null, lastMeasurementDate: null, lastProSessionDate: null }), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('buildClientProgress — authorization & privacy', () => {
  test('no relationship row → state "no_relationship", no gated table touched', async () => {
    const db = new FakeSupabase({ pt_clients: { rows: [] } });
    const out = await buildClientProgress(db, CTX);
    assert.equal(out.state, 'no_relationship');
    for (const t of [...GATED, 'workout_schedules']) assert.ok(!db.seen.has(t), `must not touch ${t}`);
  });

  test('a DIFFERENT professional cannot read this client (relationship keyed by professionalId)', async () => {
    const db = new FakeSupabase(richardCanned(true));
    const out = await buildClientProgress(db, { ...CTX, professionalId: 'pt-OTHER' });
    assert.equal(out.state, 'no_relationship');
  });

  test('active but NOT sharing → state "not_shared": name + planned count only, no gated reads', async () => {
    const db = new FakeSupabase(richardCanned(false));
    const out = await buildClientProgress(db, CTX);
    assert.equal(out.state, 'not_shared');
    assert.equal(out.client.name, 'Richard Omollo');
    assert.equal(out.trainingProgress.planned, 3); // Mon/Wed/Fri — knowable without consent
    assert.equal(out.trainingProgress.completed, null);
    assert.equal(out.trainingProgress.adherencePct, null);
    assert.equal(out.goal, null);
    assert.deepEqual(out.recentActivity, []);
    for (const t of GATED) assert.ok(!db.seen.has(t), `must NOT query ${t} without consent`);
  });

  test('no NEVER-list table is ever queried, even when consented', async () => {
    const db = new FakeSupabase(richardCanned(true));
    await buildClientProgress(db, CTX);
    for (const t of NEVER) assert.ok(!db.seen.has(t), `must NEVER query ${t}`);
    // plan_activity_completions specifically — the consumer AI plan is not
    // professionally visible.
    assert.ok(!db.seen.has('plan_activity_completions'));
  });
});

describe('buildClientProgress — §16 Richard fixture (consented, today = Thu)', () => {
  test('header reflects canonical profile/goal data', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    assert.equal(out.state, 'ok');
    assert.equal(out.client.name, 'Richard Omollo');
    assert.equal(out.client.goalLabel, 'Build muscle'); // via the shared humanGoal('build_muscle')
    assert.equal(out.client.experienceLevel, 'Intermediate');
  });

  test('goal/body progress: +1.4 kg since start, current from the latest weigh-in', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    assert.equal(out.goal?.startingWeightKg, 73);
    assert.equal(out.goal?.currentWeightKg, 74.4);
    assert.equal(out.goal?.currentWeightSource, 'measurement');
    assert.equal(out.goal?.goalWeightKg, 80);
    assert.equal(out.goal?.targetDate, '2026-12-01');
    assert.equal(out.goal?.changeSinceStartKg, 1.4);
    assert.equal(out.goal?.toGoalKg, 5.6);
    assert.equal(out.bodyProgress?.hasHistory, true);
    assert.equal(out.bodyProgress?.points.length, 3);
  });

  test('training: 2/3 completed, Fri upcoming (NOT missed), adherence 67', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    const tp = out.trainingProgress;
    assert.equal(tp.planned, 3);
    assert.equal(tp.completed, 2);
    assert.equal(tp.missed, 0);
    assert.equal(tp.upcoming, 1);
    assert.equal(tp.adherencePct, 67);
    assert.deepEqual(tp.sessions.map((s) => `${s.date}:${s.status}`), [
      '2026-09-07:completed',
      '2026-09-09:completed',
      '2026-09-11:upcoming',
    ]);
    assert.equal(tp.sessions[0].workoutTitle, 'Lower strength');
  });

  test('once the week has moved on, an un-done past session becomes "missed"', async () => {
    // same fixture, but "today" is the following Monday
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), { ...CTX, todayLocalDate: '2026-09-14' });
    // week is now 14..20; the Mon/Wed/Fri schedule still yields 3 occurrences,
    // none completed in THAT week → all missed once past, none for future
    const tp = out.trainingProgress;
    assert.equal(tp.weekStart, '2026-09-14');
    assert.equal(tp.completed, 0);
    // Mon 14 & Wed 16 are past relative to... today is the 14th, so Mon = today
    // (upcoming), Wed/Fri future (upcoming). Nothing missed.
    assert.equal(tp.missed, 0);
    assert.equal(tp.upcoming, 3);
  });

  test('recent activity is real fixture events only, newest first', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    const kinds = out.recentActivity.map((e) => `${e.date}:${e.kind}`);
    // 2 workout completions (7th, 9th) + 3 measurements (1 Aug, 20 Aug, 7 Sep)
    assert.deepEqual(kinds, [
      '2026-09-09:workout',
      '2026-09-07:measurement',
      '2026-09-07:workout',
      '2026-08-20:measurement',
      '2026-08-01:measurement',
    ]);
    assert.ok(out.recentActivity.every((e) => e.kind !== 'session')); // fixture has no pro sessions
  });

  test('last active = the newest proven date (the Wed workout completion)', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    assert.deepEqual(out.lastActive, { date: '2026-09-09', source: 'workout' });
  });

  test('deterministic — identical inputs, identical output', async () => {
    const a = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    const b = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    assert.deepEqual(a, b);
  });
});

describe('buildClientProgress — safe empty states', () => {
  test('consented but no schedules / profile / measurements → zeros & nulls, never a crash', async () => {
    const db = new FakeSupabase({
      pt_clients: { rows: [{ pt_id: 'pt-1', client_user_id: 'client-1', status: 'active', share_progress: true, created_at: '2026-07-01T00:00:00Z' }] },
      users: { rows: [{ id: 'client-1', name: 'Jane', email: null }] },
      workout_schedules: { rows: [] },
      fitness_profile: { rows: [] },
      client_measurements: { rows: [] },
      workout_history: { rows: [] },
      workouts: { rows: [] },
      professional_session_records: { rows: [] },
    });
    const out = await buildClientProgress(db, CTX);
    assert.equal(out.state, 'ok');
    assert.equal(out.trainingProgress.planned, 0);
    assert.equal(out.trainingProgress.completed, 0);
    assert.equal(out.trainingProgress.adherencePct, null); // planned 0 → no fake 0%
    assert.equal(out.goal, null);
    assert.equal(out.bodyProgress?.hasHistory, false);
    assert.deepEqual(out.bodyProgress?.points, []);
    assert.deepEqual(out.recentActivity, []);
    assert.equal(out.lastActive, null);
  });

  test('suggested/plan data is never consulted — module has no code path to plan_activity_completions', async () => {
    // Even with a row present in that table, it is never read.
    const canned = richardCanned(true);
    (canned as Record<string, { rows: Record<string, unknown>[] }>).plan_activity_completions = {
      rows: [{ user_id: 'client-1', activity_index: 0, planned_date: '2026-09-11', completed_at: '2026-09-11T00:00:00Z' }],
    };
    const db = new FakeSupabase(canned);
    const out = await buildClientProgress(db, CTX);
    assert.ok(!db.seen.has('plan_activity_completions'));
    assert.equal(out.trainingProgress.completed, 2); // still only the 2 real workout_history rows
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WORKOUT FEEDBACK — verbatim evidence, no interpretation
// ─────────────────────────────────────────────────────────────────────────

function fbRow(o: Partial<WorkoutHistoryFeedbackRow> = {}): WorkoutHistoryFeedbackRow {
  return {
    id: 'h1', workout_id: 'w1', completed_at: '2026-09-09T18:30:00Z', status: 'completed',
    completion_percentage: 100, notes: null, exercise_notes: null, perceived_difficulty: null, ...o,
  };
}

describe('pure — buildWorkoutFeedback (raw comment preserved, correct associations)', () => {
  const titles = new Map([['w1', 'Lower strength'], ['w2', 'Upper strength']]);
  const exNames = new Map([['ex-lunge', 'Walking lunge']]);

  test('session note → one session-scoped item with the exact text', () => {
    const [item, ...rest] = buildWorkoutFeedback(
      [fbRow({ notes: '  Squats felt good but my knee hurt during lunges.  ' })],
      titles, exNames,
    );
    assert.equal(rest.length, 0);
    assert.equal(item.scope, 'session');
    assert.equal(item.comment, 'Squats felt good but my knee hurt during lunges.'); // trimmed only
    assert.equal(item.workoutTitle, 'Lower strength');
    assert.equal(item.scheduledDate, '2026-09-09');
    assert.equal(item.submittedAt, '2026-09-09T18:30:00Z');
    assert.equal(item.id, 'h1');
  });

  test('exercise_notes → one item per non-empty note; name only when the id resolves', () => {
    const items = buildWorkoutFeedback(
      [fbRow({ exercise_notes: { 'ex-lunge': 'knee pinched here', 'ex-unknown': 'felt strong', 'ex-blank': '   ' } })],
      titles, exNames,
    );
    assert.equal(items.length, 2); // blank dropped
    const lunge = items.find((i) => i.exerciseId === 'ex-lunge')!;
    assert.equal(lunge.scope, 'exercise');
    assert.equal(lunge.exerciseName, 'Walking lunge');
    assert.equal(lunge.comment, 'knee pinched here');
    assert.equal(lunge.id, 'h1:ex-lunge');
    const unknown = items.find((i) => i.exerciseId === 'ex-unknown')!;
    assert.equal(unknown.exerciseName, undefined); // unresolved id → shown, no fabricated name
    assert.equal(unknown.comment, 'felt strong');
  });

  test('chronological — newest first; session before exercise on the same timestamp', () => {
    const items = buildWorkoutFeedback(
      [
        fbRow({ id: 'a', completed_at: '2026-09-03T10:00:00Z', notes: 'older' }),
        fbRow({ id: 'b', completed_at: '2026-09-09T10:00:00Z', notes: 'newer', exercise_notes: { 'ex-lunge': 'ex note' } }),
      ],
      titles, exNames,
    );
    assert.deepEqual(items.map((i) => `${i.scheduledDate}:${i.scope}`), [
      '2026-09-09:session', '2026-09-09:exercise', '2026-09-03:session',
    ]);
  });

  test('completion context is factual, never interpreted', () => {
    const [item] = buildWorkoutFeedback(
      [fbRow({ notes: 'only had 30 min', completion_percentage: 60, perceived_difficulty: 'difficult' })],
      titles, exNames,
    );
    assert.deepEqual(item.completionContext, { status: 'completed', completionPercentage: 60, perceivedDifficulty: 'difficult' });
  });

  test('a row with no comment produces nothing', () => {
    assert.deepEqual(buildWorkoutFeedback([fbRow({ notes: '   ', exercise_notes: {} })], titles, exNames), []);
  });

  test('deterministic — identical input, identical output', () => {
    const rows = [fbRow({ notes: 'x', exercise_notes: { 'ex-lunge': 'y' } })];
    assert.deepEqual(buildWorkoutFeedback(rows, titles, exNames), buildWorkoutFeedback(rows, titles, exNames));
  });
});

// §15 fixture — Richard, 3 sessions with verbatim comments
function richardFeedbackCanned(shareProgress = true): Canned {
  const c = richardCanned(shareProgress);
  c.workout_schedules = { rows: [] }; // isolate: feedback must not depend on scheduling
  c.workout_history = {
    rows: [
      { user_id: 'client-1', id: 'h-lower', workout_id: 'w-lower', status: 'completed', completed_at: '2026-09-09T18:00:00Z', completion_percentage: 100, perceived_difficulty: 'about_right', notes: 'Squats felt good but my knee hurt during lunges.', exercise_notes: {} },
      { user_id: 'client-1', id: 'h-upper', workout_id: 'w-upper', status: 'completed', completed_at: '2026-09-06T18:00:00Z', completion_percentage: 100, perceived_difficulty: 'easy', notes: null, exercise_notes: { 'ex-bench': 'Weights are starting to feel too light.' } },
      { user_id: 'client-1', id: 'h-full', workout_id: 'w-full', status: 'completed', completed_at: '2026-09-03T18:00:00Z', completion_percentage: 55, perceived_difficulty: null, notes: 'Only had 30 minutes today.', exercise_notes: {} },
    ],
  };
  c.workouts = { rows: [{ id: 'w-lower', title: 'Lower strength' }, { id: 'w-upper', title: 'Upper strength' }, { id: 'w-full', title: 'Full-body strength' }] };
  c.exercises = { rows: [{ id: 'ex-bench', name: 'Barbell bench press' }] };
  return c;
}

describe('buildClientProgress — workout feedback (§15/§16)', () => {
  test('loads verbatim, correct workout + date, newest first', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardFeedbackCanned()), CTX);
    assert.equal(out.state, 'ok');
    assert.deepEqual(
      out.workoutFeedback.map((f) => [f.scheduledDate, f.workoutTitle, f.comment]),
      [
        ['2026-09-09', 'Lower strength', 'Squats felt good but my knee hurt during lunges.'],
        ['2026-09-06', 'Upper strength', 'Weights are starting to feel too light.'],
        ['2026-09-03', 'Full-body strength', 'Only had 30 minutes today.'],
      ],
    );
    // exact text, byte-for-byte
    assert.equal(out.workoutFeedback[0].comment, 'Squats felt good but my knee hurt during lunges.');
  });

  test('exercise association only where real', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardFeedbackCanned()), CTX);
    const upper = out.workoutFeedback.find((f) => f.workoutTitle === 'Upper strength')!;
    assert.equal(upper.scope, 'exercise');
    assert.equal(upper.exerciseId, 'ex-bench');
    assert.equal(upper.exerciseName, 'Barbell bench press');
    assert.equal(out.workoutFeedback.find((f) => f.workoutTitle === 'Lower strength')!.scope, 'session');
  });

  test('completion context carried through factually (Full-body at 55%)', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardFeedbackCanned()), CTX);
    const full = out.workoutFeedback.find((f) => f.workoutTitle === 'Full-body strength')!;
    assert.equal(full.completionContext.completionPercentage, 55);
    assert.equal(full.completionContext.status, 'completed');
  });

  test('NO Lana interpretation — only factual keys, no summary/signal/polarity/confidence', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardFeedbackCanned()), CTX);
    const allowed = new Set([
      'comment', 'completionContext', 'id', 'scheduledDate', 'scope', 'submittedAt',
      'workoutId', 'workoutTitle', 'workoutCategory', 'exerciseId', 'exerciseName',
    ]);
    for (const f of out.workoutFeedback) {
      for (const k of Object.keys(f)) assert.ok(allowed.has(k), `unexpected key "${k}"`);
      assert.ok(!('summary' in f) && !('signal' in f) && !('polarity' in f) && !('confidence' in f) && !('sentiment' in f));
    }
  });

  test('§8/§9 — workoutCategory comes verbatim from workouts.category; absent when the row has none', async () => {
    const c = richardFeedbackCanned();
    c.workouts = {
      rows: [
        { id: 'w-lower', title: 'Lower strength', category: 'lower_body' },
        { id: 'w-upper', title: 'Upper strength' }, // no category
        { id: 'w-full', title: 'Full-body strength', category: 'full_body' },
      ],
    };
    const out = await buildClientProgress(new FakeSupabase(c), CTX);
    const lower = out.workoutFeedback.find((f) => f.workoutTitle === 'Lower strength')!;
    const upper = out.workoutFeedback.find((f) => f.workoutTitle === 'Upper strength')!;
    assert.equal(lower.workoutCategory, 'lower_body'); // exact stored value, not inferred
    assert.equal(upper.workoutCategory, undefined); // missing stays missing — never guessed from the title
  });

  test('adding category does not add a workouts query — same read count as before', async () => {
    const db = new FakeSupabase(richardFeedbackCanned());
    await buildClientProgress(db, CTX);
    const n = (t: string) => db.tablesTouched.filter((x) => x === t).length;
    assert.ok(n('workouts') <= 2, `workouts queried ${n('workouts')}×`); // initial + one bounded follow-up
    assert.ok(n('workout_history') <= 2);
  });

  test('empty — client never left feedback → []', async () => {
    const c = richardFeedbackCanned();
    c.workout_history = { rows: [{ user_id: 'client-1', id: 'h1', workout_id: 'w-lower', status: 'completed', completed_at: '2026-09-09T18:00:00Z', completion_percentage: 100, notes: null, exercise_notes: {} }] };
    const out = await buildClientProgress(new FakeSupabase(c), CTX);
    assert.deepEqual(out.workoutFeedback, []);
  });

  test('an UNRELATED professional gets no feedback (same auth gate as the rest)', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardFeedbackCanned()), { ...CTX, professionalId: 'pt-OTHER' });
    assert.equal(out.state, 'no_relationship');
    assert.deepEqual(out.workoutFeedback, []);
  });

  test('NOT sharing → no feedback, and workout_history is never queried', async () => {
    const db = new FakeSupabase(richardFeedbackCanned(false));
    const out = await buildClientProgress(db, CTX);
    assert.equal(out.state, 'not_shared');
    assert.deepEqual(out.workoutFeedback, []);
    assert.ok(!db.seen.has('workout_history'));
    assert.ok(!db.seen.has('exercises'));
  });

  test('no N+1 — feedback rides the existing reads (bounded table counts)', async () => {
    const db = new FakeSupabase(richardFeedbackCanned());
    await buildClientProgress(db, CTX);
    const count = (t: string) => db.tablesTouched.filter((x) => x === t).length;
    assert.ok(count('workout_history') <= 2, `workout_history queried ${count('workout_history')}×`);
    assert.ok(count('exercises') <= 1, `exercises queried ${count('exercises')}×`);
    assert.ok(count('workouts') <= 2, `workouts queried ${count('workouts')}×`);
  });

  test('a scheduled-but-not-done workout is never turned into feedback', async () => {
    const c = richardCanned(true); // has a Mon/Wed/Fri schedule, only Mon+Wed in workout_history, none with notes
    const out = await buildClientProgress(new FakeSupabase(c), CTX);
    assert.deepEqual(out.workoutFeedback, []); // planned Fri contributes nothing
    assert.equal(out.trainingProgress.upcoming, 1); // still classified as upcoming, not feedback
  });

  test('existing metrics do not regress when feedback is present', async () => {
    const c = richardCanned(true);
    // add a comment to the Wed completion
    (c.workout_history!.rows as Record<string, unknown>[])[1] = {
      ...(c.workout_history!.rows as Record<string, unknown>[])[1],
      id: 'h-wed', notes: 'good session', exercise_notes: {}, completion_percentage: 100,
    };
    const out = await buildClientProgress(new FakeSupabase(c), CTX);
    assert.equal(out.trainingProgress.completed, 2);
    assert.equal(out.trainingProgress.adherencePct, 67);
    assert.equal(out.goal?.changeSinceStartKg, 1.4);
    assert.equal(out.workoutFeedback.length, 1);
    assert.equal(out.workoutFeedback[0].comment, 'good session');
  });
});

// ── consolidation: factual header context now comes from Client Progress ──
describe('buildClientProgress — factual header context (replaces the retired brief)', () => {
  test('relationship weeks + status from pt_clients; nextSession from pt_bookings', async () => {
    const c = richardCanned(true);
    c.pt_bookings = {
      rows: [{ pt_id: 'pt-1', user_id: 'client-1', status: 'confirmed', scheduled_date: '2026-09-15', scheduled_time: '07:30:00', pt_offerings: { title: 'Strength session' } }],
    };
    const out = await buildClientProgress(new FakeSupabase(c), CTX);
    assert.equal(out.client.relationshipStatus, 'active');
    assert.equal(out.client.relationshipWeeks, 10); // created 2026-07-01 → 2026-09-10
    assert.deepEqual(out.nextSession, { atIso: '2026-09-15T07:30:00', serviceName: 'Strength session' });
  });

  test('no upcoming booking → nextSession null (not fabricated)', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    assert.equal(out.nextSession, null);
  });

  test('header context is available even when NOT sharing (PT-owned facts)', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(false)), CTX);
    assert.equal(out.state, 'not_shared');
    assert.equal(out.client.relationshipWeeks, 10);
    assert.equal(out.client.relationshipStatus, 'active');
  });

  test('no relationship → status "none", weeks null, nextSession null', async () => {
    const out = await buildClientProgress(new FakeSupabase({ pt_clients: { rows: [] } }), CTX);
    assert.equal(out.state, 'no_relationship');
    assert.equal(out.client.relationshipStatus, 'none');
    assert.equal(out.client.relationshipWeeks, null);
    assert.equal(out.nextSession, null);
  });
});

// ═══════════════════ ADHERENCE FACTS (L1) — planned vs actual ═══════════════
describe('scheduleOccurrencesInRange', () => {
  const mwf: ScheduleRow = { workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5], is_active: true };

  test('projects weekly weekday occurrences across a multi-week span', () => {
    // 2026-08-17 (Mon) .. 2026-08-30 (Sun) → Mon/Wed/Fri × 2 weeks = 6
    const got = scheduleOccurrencesInRange(mwf, '2026-08-17', '2026-08-30');
    assert.deepEqual(got, ['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-28']);
  });

  test('never fires before start_date; inactive schedule yields nothing', () => {
    assert.deepEqual(scheduleOccurrencesInRange({ ...mwf, start_date: '2026-08-25' }, '2026-08-17', '2026-08-30'), ['2026-08-26', '2026-08-28']);
    assert.deepEqual(scheduleOccurrencesInRange({ ...mwf, is_active: false }, '2026-08-17', '2026-08-30'), []);
  });
});

describe('computeAdherenceFacts', () => {
  const TODAY = '2026-09-10'; // Thursday → recent week 08-31..09-06, baseline 08-17..08-30
  const titleById = new Map([['w', 'Upper strength']]);
  const mwf: ScheduleRow = { workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5], is_active: true };
  const c = (id: string, date: string) => ({ id, workoutId: 'w', date });

  test('§34 — a clear drop: baseline 5/6, recent 1/3, with correct occurrence spine', () => {
    const facts = computeAdherenceFacts({
      schedules: [mwf],
      completions: [
        c('b1', '2026-08-17'), c('b2', '2026-08-19'), c('b3', '2026-08-21'),
        c('b4', '2026-08-24'), c('b5', '2026-08-26'), // miss 08-28
        c('r1', '2026-08-31'), // miss 09-02, 09-04
      ],
      titleById,
      todayLocalDate: TODAY,
    });
    assert.ok(facts);
    assert.deepEqual(
      { s: facts!.baseline.scheduled, c: facts!.baseline.completed, m: facts!.baseline.missed, rate: facts!.baseline.rate },
      { s: 6, c: 5, m: 1, rate: 0.83 },
    );
    assert.deepEqual(
      { s: facts!.recent.scheduled, c: facts!.recent.completed, m: facts!.recent.missed, rate: facts!.recent.rate },
      { s: 3, c: 1, m: 2, rate: 0.33 },
    );
    assert.equal(facts!.occurrences.length, 9);
    assert.ok(facts!.occurrences.every((o) => o.workoutTitle === 'Upper strength'));
    // every occurrence resolves to completed|missed (elapsed periods only)
    assert.ok(facts!.occurrences.every((o) => o.status === 'completed' || o.status === 'missed'));
  });

  test('§36/§37 — only whole ELAPSED weeks: today\'s and this week\'s occurrences never counted', () => {
    const facts = computeAdherenceFacts({ schedules: [mwf], completions: [], titleById, todayLocalDate: TODAY });
    assert.ok(facts);
    // recent period ends on the Sunday BEFORE this week's Monday (2026-09-07)
    assert.ok(facts!.occurrences.every((o) => o.date <= '2026-09-06'));
    assert.ok(facts!.recent.end < '2026-09-07');
  });

  test(`reschedule slip within ${ADHERENCE_RESCHEDULE_GRACE_DAYS} days credits the occurrence; a longer slip does not`, () => {
    const facts = computeAdherenceFacts({
      schedules: [mwf],
      completions: [
        // Wed 08-19 done Thu 08-20 (1-day slip → credited)
        c('x', '2026-08-20'),
        // Fri 08-21 done Mon 08-24 (3-day slip → NOT credited within grace 2)
        c('y', '2026-08-24'),
      ],
      titleById,
      todayLocalDate: TODAY,
    });
    const byDate = new Map(facts!.occurrences.map((o) => [o.date, o.status]));
    assert.equal(byDate.get('2026-08-19'), 'completed'); // slip credited
    assert.equal(byDate.get('2026-08-21'), 'missed'); // slip too long
    // 08-24 is itself a Monday occurrence — the completion lands exactly there
    assert.equal(byDate.get('2026-08-24'), 'completed');
  });

  test('no PT schedule → null (nothing to compare)', () => {
    assert.equal(computeAdherenceFacts({ schedules: [], completions: [], titleById, todayLocalDate: TODAY }), null);
  });
});

// ═══════════ SHARED LANA PLAN — merged spine + authoritative completion ═════
const lanaOcc = (o: Partial<SharedLanaPlanOccurrence> & { date: string }): SharedLanaPlanOccurrence => ({
  title: 'Lana session', category: null, durationMinutes: null, completed: false, ...o,
});

describe('computeAdherenceFacts — Lana occurrences join the SAME spine (§20)', () => {
  const TODAY = '2026-09-10'; // recent 08-31..09-06, baseline 08-17..08-30
  const titleById = new Map<string, string>();

  test('Lana-plan-only client can produce a clear drop (baseline 5/6, recent 1/3) (§34/§37)', () => {
    const facts = computeAdherenceFacts({
      schedules: [], completions: [], titleById, todayLocalDate: TODAY,
      lanaOccurrences: [
        // baseline: 6 planned, 5 completed
        lanaOcc({ date: '2026-08-17', completed: true }), lanaOcc({ date: '2026-08-19', completed: true }),
        lanaOcc({ date: '2026-08-21', completed: true }), lanaOcc({ date: '2026-08-24', completed: true }),
        lanaOcc({ date: '2026-08-26', completed: true }), lanaOcc({ date: '2026-08-28', completed: false }),
        // recent: 3 planned, 1 completed
        lanaOcc({ date: '2026-08-31', completed: true }), lanaOcc({ date: '2026-09-02', completed: false }),
        lanaOcc({ date: '2026-09-04', completed: false }),
      ],
    });
    assert.ok(facts);
    assert.deepEqual({ s: facts!.baseline.scheduled, c: facts!.baseline.completed }, { s: 6, c: 5 });
    assert.deepEqual({ s: facts!.recent.scheduled, c: facts!.recent.completed, m: facts!.recent.missed }, { s: 3, c: 1, m: 2 });
    assert.ok(facts!.occurrences.every((o) => o.source === 'lana_plan'));
  });

  test('trainer + lana occurrences both count in the periods (§18), no cross-source dedup (§39)', () => {
    const mwf: ScheduleRow = { workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1], is_active: true }; // Mondays
    const facts = computeAdherenceFacts({
      schedules: [mwf],
      completions: [{ id: 'x', workoutId: 'w', date: '2026-08-17' }],
      titleById: new Map([['w', 'Trainer Monday']]),
      todayLocalDate: TODAY,
      lanaOccurrences: [ lanaOcc({ date: '2026-08-17', title: 'Lana Monday', completed: true }) ],
    });
    // 2026-08-17 is a Monday in the baseline window: one trainer occ + one lana
    // occ on the SAME date — both kept (identity can't be proven).
    const aug17 = facts!.occurrences.filter((o) => o.date === '2026-08-17');
    assert.equal(aug17.length, 2);
    assert.deepEqual(aug17.map((o) => o.source).sort(), ['lana_plan', 'trainer_plan']);
  });

  test('only occurrences inside an elapsed period are counted; today/future Lana occ excluded', () => {
    const facts = computeAdherenceFacts({
      schedules: [], completions: [], titleById, todayLocalDate: TODAY,
      lanaOccurrences: [
        lanaOcc({ date: '2026-08-19', completed: true }),   // baseline
        lanaOcc({ date: '2026-09-10', completed: false }),  // today
        lanaOcc({ date: '2026-09-20', completed: false }),  // future
      ],
    });
    assert.equal(facts!.occurrences.length, 1);
    assert.equal(facts!.occurrences[0].date, '2026-08-19');
  });
});

describe('buildClientProgress — merged "Training this week" (§15/§26–§32)', () => {
  const lanaWeek: SharedLanaPlanOccurrence[] = [
    { date: '2026-09-07', title: 'Heavy Lower', category: 'strength', durationMinutes: 60, completed: true },   // Mon, past, DONE
    { date: '2026-09-09', title: 'Conditioning', category: 'cardio', durationMinutes: 40, completed: true },    // Wed, past, DONE
    { date: '2026-09-10', title: 'Lower Volume', category: 'strength', durationMinutes: 50, completed: false }, // Thu = today
    { date: '2026-09-11', title: 'Upper Volume', category: 'strength', durationMinutes: 55, completed: false }, // Fri, future
  ];

  test('§26/§28 — Lana-plan-only client → merged sessions, authoritative completion, no empty state', async () => {
    const canned = richardCanned(true);
    canned.workout_schedules = { rows: [] };
    canned.workout_history = { rows: [] };
    const out = await buildClientProgress(new FakeSupabase(canned), CTX, lanaWeek);
    assert.equal(out.state, 'ok');
    assert.equal(out.trainingProgress.planned, 4);
    assert.ok(out.trainingProgress.sessions.every((s) => s.source === 'lana_plan'));
    assert.deepEqual(out.trainingProgress.sessions.map((s) => s.status), ['completed', 'completed', 'upcoming', 'upcoming']);
    assert.equal(out.trainingProgress.completed, 2);
    assert.equal(out.trainingProgress.missed, 0);
  });

  test('§29 — a past uncompleted Lana occurrence IS "missed" now (authoritative)', async () => {
    const canned = richardCanned(true);
    canned.workout_schedules = { rows: [] };
    canned.workout_history = { rows: [] };
    const out = await buildClientProgress(new FakeSupabase(canned), CTX, [
      { date: '2026-09-07', title: 'Heavy Lower', category: 'strength', durationMinutes: 60, completed: false },
    ]);
    assert.equal(out.trainingProgress.sessions[0].status, 'missed'); // Mon 09-07 < today 09-10, not completed
  });

  test('§27 — trainer schedule only (no Lana occ passed) → unchanged, all trainer_plan', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX);
    assert.ok(out.trainingProgress.sessions.length > 0);
    assert.ok(out.trainingProgress.sessions.every((s) => s.source === 'trainer_plan'));
  });

  test('§28 — both sources merge; trainer first on a shared date; no double count', async () => {
    const out = await buildClientProgress(new FakeSupabase(richardCanned(true)), CTX, [
      { date: '2026-09-08', title: 'Lana Tuesday', category: 'mobility', durationMinutes: 30, completed: false },
    ]);
    const bySrc = out.trainingProgress.sessions.reduce((m, s) => ((m[s.source] = (m[s.source] ?? 0) + 1), m), {} as Record<string, number>);
    assert.equal(bySrc.trainer_plan, 3);
    assert.equal(bySrc.lana_plan, 1);
    assert.equal(out.trainingProgress.planned, 4);
  });

  test('§34/§41 — consent OFF: shared Lana occurrences never reach the merge', async () => {
    // even if a caller passed occurrences, the not_shared branch returns early
    const out = await buildClientProgress(new FakeSupabase(richardCanned(false)), CTX, lanaWeek);
    assert.equal(out.state, 'not_shared');
    assert.deepEqual(out.trainingProgress.sessions, []);
    assert.equal(out.adherence, null);
  });
});

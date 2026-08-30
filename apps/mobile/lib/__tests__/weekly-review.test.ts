import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPlanReadyForReview, isSundayPlanningWindow, getScheduledNextPlan, buildWeeklyBehaviourSummary, fetchWeeklyAdaptation, fetchPlanDateUpgrade, scheduledPlanNeedsScheduleUpdate } from '../weekly-review.ts';
import type { StartingPlanActivity, AIAssessment } from '../ai-assessment.ts';
import type { PlanActivityCompletion } from '../completion.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...overrides };
}

function completion(overrides: Partial<PlanActivityCompletion> = {}): PlanActivityCompletion {
  return { id: 'c1', planId: 'plan-1', activityIndex: 0, plannedDate: '2026-08-31', completedAt: '2026-08-31T10:00:00Z', completionSource: 'manual', sourceEntityId: null, ...overrides };
}

describe('isPlanReadyForReview (Part 6 — deterministic review readiness)', () => {
  test('not ready while the week is still in progress', () => {
    const assessment = { starting_plan: { week_end_date: '2026-09-06' } } as Pick<AIAssessment, 'starting_plan'>;
    assert.equal(isPlanReadyForReview(assessment, new Date('2026-09-03T09:00:00Z')), false);
  });

  test('not ready on the exact final day of the week (the week has not fully ended yet)', () => {
    const assessment = { starting_plan: { week_end_date: '2026-09-06' } } as Pick<AIAssessment, 'starting_plan'>;
    assert.equal(isPlanReadyForReview(assessment, new Date('2026-09-06T23:00:00Z')), false);
  });

  test('ready the day after the week ends', () => {
    const assessment = { starting_plan: { week_end_date: '2026-09-06' } } as Pick<AIAssessment, 'starting_plan'>;
    assert.equal(isPlanReadyForReview(assessment, new Date('2026-09-07T09:00:00Z')), true);
  });

  test('never ready for a pre-Day-5 plan with no week_end_date at all', () => {
    const assessment = { starting_plan: {} } as Pick<AIAssessment, 'starting_plan'>;
    assert.equal(isPlanReadyForReview(assessment, new Date('2026-09-07T09:00:00Z')), false);
  });

  test('never ready for a null/missing assessment', () => {
    assert.equal(isPlanReadyForReview(null, new Date()), false);
    assert.equal(isPlanReadyForReview(undefined, new Date()), false);
  });
});

describe('buildWeeklyBehaviourSummary (Part 7/8/9 — code calculates facts, never the AI)', () => {
  test('Scenario A: strong adherence — 4 planned, 4 completed', () => {
    const activities = [activity({ day: 'Monday' }), activity({ day: 'Tuesday' }), activity({ day: 'Wednesday' }), activity({ day: 'Thursday' })];
    const completions = [0, 1, 2, 3].map(i => completion({ activityIndex: i }));
    const summary = buildWeeklyBehaviourSummary(activities, completions, {});
    assert.equal(summary.planned_sessions, 4);
    assert.equal(summary.completed_sessions, 4);
    assert.equal(summary.adherence_rate, 1);
  });

  test('Scenario B/C: partial adherence computes the correct rate', () => {
    const activities = [activity(), activity(), activity(), activity()];
    const completions = [0, 1, 2].map(i => completion({ activityIndex: i }));
    const summary = buildWeeklyBehaviourSummary(activities, completions, {});
    assert.equal(summary.completed_sessions, 3);
    assert.equal(summary.adherence_rate, 0.75);
  });

  test('Scenario D: preserves per-category completed vs missed breakdown', () => {
    const activities = [
      activity({ category: 'strength' }), activity({ category: 'strength' }), activity({ category: 'cardio' }),
    ];
    const completions = [completion({ activityIndex: 0 }), completion({ activityIndex: 1 })]; // both strength done, cardio missed
    const summary = buildWeeklyBehaviourSummary(activities, completions, {});
    assert.deepEqual(summary.completed_by_category, { strength: 2 });
    assert.deepEqual(summary.missed_by_category, { cardio: 1 });
  });

  test('Scenario E: manual-only completions never fabricate actual duration', () => {
    const activities = [activity({ duration_minutes: 60 })];
    const completions = [completion({ activityIndex: 0, completionSource: 'manual', sourceEntityId: null })];
    const summary = buildWeeklyBehaviourSummary(activities, completions, {});
    assert.equal(summary.completed_known_minutes, 0);
    assert.equal(summary.has_known_duration, false);
  });

  test('Scenario F: a Strava completion with a real duration lookup contributes known minutes', () => {
    const activities = [activity({ duration_minutes: 45 })];
    const completions = [completion({ activityIndex: 0, completionSource: 'strava', sourceEntityId: 'strava-1' })];
    const summary = buildWeeklyBehaviourSummary(activities, completions, { 'strava-1': 42 });
    assert.equal(summary.completed_known_minutes, 42);
    assert.equal(summary.has_known_duration, true);
  });

  test('an ExerciseDB completion with a real duration lookup also contributes known minutes', () => {
    const activities = [activity({ duration_minutes: 60 })];
    const completions = [completion({ activityIndex: 0, completionSource: 'exercise_db', sourceEntityId: 'wh-1' })];
    const summary = buildWeeklyBehaviourSummary(activities, completions, { 'wh-1': 38 });
    assert.equal(summary.completed_known_minutes, 38);
    assert.equal(summary.has_known_duration, true);
  });

  test('an ACP check-in completion never contributes known minutes even if a lookup value exists for its id', () => {
    const activities = [activity()];
    const completions = [completion({ activityIndex: 0, completionSource: 'acp_session', sourceEntityId: 'booking-1' })];
    const summary = buildWeeklyBehaviourSummary(activities, completions, { 'booking-1': 999 });
    assert.equal(summary.completed_known_minutes, 0);
    assert.equal(summary.has_known_duration, false);
  });

  test('zero planned sessions is zero adherence, not NaN', () => {
    const summary = buildWeeklyBehaviourSummary([], [], {});
    assert.equal(summary.adherence_rate, 0);
  });

  test('never double-counts a duplicate completion record for the same activity index', () => {
    const activities = [activity()];
    const completions = [completion({ id: 'a', activityIndex: 0 }), completion({ id: 'b', activityIndex: 0 })];
    const summary = buildWeeklyBehaviourSummary(activities, completions, {});
    assert.equal(summary.completed_sessions, 1);
  });
});

describe('Beta #001 — isSundayPlanningWindow (local-date Sunday of the current week)', () => {
  const plan = { starting_plan: { week_start_date: '2026-08-24', week_end_date: '2026-08-30' } } as any; // Sun 30 Aug
  test('true on the plan\'s last day (Sunday), local date', () => {
    assert.equal(isSundayPlanningWindow(plan, new Date('2026-08-30T09:00:00')), true);
    assert.equal(isSundayPlanningWindow(plan, new Date('2026-08-30T23:30:00')), true);
  });
  test('false on Saturday and on Monday (Monday+ is the normal review flow)', () => {
    assert.equal(isSundayPlanningWindow(plan, new Date('2026-08-29T23:59:00')), false);
    assert.equal(isSundayPlanningWindow(plan, new Date('2026-08-31T00:01:00')), false);
  });
  test('false with no week_end_date', () => {
    assert.equal(isSundayPlanningWindow({ starting_plan: {} } as any, new Date('2026-08-30T12:00:00')), false);
    assert.equal(isSundayPlanningWindow(null, new Date()), false);
  });
  test('month boundary: Sun 31 Jan', () => {
    const janPlan = { starting_plan: { week_start_date: '2027-01-25', week_end_date: '2027-01-31' } } as any;
    assert.equal(isSundayPlanningWindow(janPlan, new Date('2027-01-31T10:00:00')), true);
    assert.equal(isSundayPlanningWindow(janPlan, new Date('2027-02-01T10:00:00')), false);
  });
});

describe('Beta #001 — getScheduledNextPlan', () => {
  const chain = (rows: any[]) => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }) }),
  });
  test('returns the scheduled plan when one exists', async () => {
    const row = { plan_id: 'p2', week_start_date: '2026-08-31', week_end_date: '2026-09-06', assessment: { starting_plan: { activities: [{ day: 'Monday' }] } } };
    const r = await getScheduledNextPlan(chain([row]) as any, 'u1');
    assert.equal(r?.planId, 'p2');
    assert.equal(r?.weekStartDate, '2026-08-31');
  });
  test('returns null when there is no scheduled row', async () => {
    assert.equal(await getScheduledNextPlan(chain([]) as any, 'u1'), null);
  });
  test('returns null on a malformed/empty assessment', async () => {
    assert.equal(await getScheduledNextPlan(chain([{ plan_id: 'p', week_start_date: 'x', week_end_date: 'y', assessment: { starting_plan: { activities: [] } } }]) as any, 'u1'), null);
  });
  test('never throws — a rejecting client resolves to null', async () => {
    const bad = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => { throw new Error('db down'); } }) }) }) }) }) };
    assert.equal(await getScheduledNextPlan(bad as any, 'u1'), null);
  });
});

describe('Beta #003 — scheduledPlanNeedsScheduleUpdate (dirty-state, structural not "visited editor")', () => {
  const FAR_FUTURE = '2099-01-05'; // a Monday-ish far-future week start
  const mkScheduled = (days: string[]) => ({
    weekStartDate: FAR_FUTURE,
    assessment: { starting_plan: { activities: days.map(d => ({ day: d })) } } as any,
  });

  test('false when there is no scheduled plan', () => {
    assert.equal(scheduledPlanNeedsScheduleUpdate(null, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']), false);
  });

  test('false when the user has no explicit preference (< 2 canonical days)', () => {
    assert.equal(scheduledPlanNeedsScheduleUpdate(mkScheduled(['Monday', 'Wednesday']), null), false);
    assert.equal(scheduledPlanNeedsScheduleUpdate(mkScheduled(['Monday', 'Wednesday']), ['monday']), false);
  });

  test('false when the prepared plan already sits within the preferred days', () => {
    assert.equal(
      scheduledPlanNeedsScheduleUpdate(mkScheduled(['Monday', 'Wednesday', 'Friday']), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
      false,
    );
  });

  test('true when a prepared-plan day falls outside the (changed) preference', () => {
    assert.equal(
      scheduledPlanNeedsScheduleUpdate(mkScheduled(['Monday', 'Wednesday', 'Saturday']), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
      true,
    );
    // Mon–Fri plan, user narrows to Mon/Wed/Fri → Tue/Thu now outside
    assert.equal(
      scheduledPlanNeedsScheduleUpdate(mkScheduled(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']), ['monday', 'wednesday', 'friday']),
      true,
    );
  });

  test('false once the target week has started (regeneration would be rejected server-side)', () => {
    const started = { weekStartDate: '2020-01-06', assessment: { starting_plan: { activities: [{ day: 'Saturday' }] } } as any };
    assert.equal(
      scheduledPlanNeedsScheduleUpdate(started, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], new Date('2020-01-08T12:00:00Z')),
      false,
    );
  });

  test('mixed-form day input is normalised before comparison', () => {
    assert.equal(
      scheduledPlanNeedsScheduleUpdate(mkScheduled(['Mon', 'weds']), ['monday', 'wednesday', 'friday']),
      false, // both plan days are within the preference after normalisation
    );
  });
});

describe('fetchWeeklyAdaptation (never throws, races a UX timeout)', () => {
  const baseParams = { userId: 'u1', accessToken: 't1', behaviourSummary: buildWeeklyBehaviourSummary([], [], {}) };

  test('returns the assessment + generatedAt on a valid response', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ assessment: { headline: 'x' }, generatedAt: '2026-09-08T00:00:00Z' }) }) as any;
    const result = await fetchWeeklyAdaptation(baseParams, mockFetch, 200);
    assert.deepEqual(result, { assessment: { headline: 'x' }, generatedAt: '2026-09-08T00:00:00Z', scheduled: false, promoted: false, regenerated: false });
  });

  test('Beta #001 — passes through the scheduled flag for a Sunday advance generation', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ assessment: { headline: 'x' }, generatedAt: 'g', scheduled: true }) }) as any;
    const result = await fetchWeeklyAdaptation(baseParams, mockFetch, 200);
    assert.equal(result?.scheduled, true);
    assert.equal(result?.promoted, false);
  });

  test('Beta #003 — sends regenerateFuturePlan in the body and passes back the regenerated flag', async () => {
    let sentBody: any = null;
    const mockFetch = async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ assessment: { headline: 'x' }, generatedAt: 'g2', scheduled: true, regenerated: true }) } as any;
    };
    const result = await fetchWeeklyAdaptation({ ...baseParams, regenerateFuturePlan: true }, mockFetch as any, 200);
    assert.equal(sentBody.regenerateFuturePlan, true);
    assert.equal(result?.regenerated, true);
    assert.equal(result?.scheduled, true);
  });

  test('Beta #003 — a failed regeneration (non-2xx) resolves to null so the caller keeps the old plan', async () => {
    const mockFetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'regeneration_failed', assessment: { headline: 'old' }, generatedAt: 'old' }) }) as any;
    assert.equal(await fetchWeeklyAdaptation({ ...baseParams, regenerateFuturePlan: true }, mockFetch, 200), null);
  });

  test('returns null (never throws) when the network call rejects', async () => {
    const mockFetch = async () => { throw new Error('down'); };
    const result = await fetchWeeklyAdaptation(baseParams, mockFetch as any, 200);
    assert.equal(result, null);
  });

  test('returns null on a non-2xx response', async () => {
    const mockFetch = async () => ({ ok: false, json: async () => ({}) }) as any;
    assert.equal(await fetchWeeklyAdaptation(baseParams, mockFetch, 200), null);
  });

  test('resolves promptly via the UX timeout rather than hanging', async () => {
    const neverResolves = () => new Promise(() => {});
    const start = Date.now();
    const result = await fetchWeeklyAdaptation(baseParams, neverResolves as any, 100);
    assert.equal(result, null);
    assert.ok(Date.now() - start < 1000);
  });
});

describe('fetchPlanDateUpgrade (Day 5.5 Problem C — never throws, fails safe)', () => {
  const params = { userId: 'u1', accessToken: 't1' };

  test('returns upgraded: true + the assessment on success', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ upgraded: true, assessment: { headline: 'x' }, generatedAt: '2026-08-19T00:00:00Z' }) }) as any;
    const result = await fetchPlanDateUpgrade(params, mockFetch);
    assert.deepEqual(result, { upgraded: true, assessment: { headline: 'x' }, generatedAt: '2026-08-19T00:00:00Z' });
  });

  test('returns upgraded: false when the plan was already dated (server no-op)', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ upgraded: false }) }) as any;
    const result = await fetchPlanDateUpgrade(params, mockFetch);
    assert.equal(result.upgraded, false);
  });

  test('never throws on a network failure — fails safe', async () => {
    const mockFetch = async () => { throw new Error('down'); };
    const result = await fetchPlanDateUpgrade(params, mockFetch as any);
    assert.equal(result.upgraded, false);
  });

  test('never throws on a non-2xx response', async () => {
    const mockFetch = async () => ({ ok: false, json: async () => ({}) }) as any;
    const result = await fetchPlanDateUpgrade(params, mockFetch);
    assert.equal(result.upgraded, false);
  });
});

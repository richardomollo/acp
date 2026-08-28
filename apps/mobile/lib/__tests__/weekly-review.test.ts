import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPlanReadyForReview, buildWeeklyBehaviourSummary, fetchWeeklyAdaptation, fetchPlanDateUpgrade } from '../weekly-review.ts';
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

describe('fetchWeeklyAdaptation (never throws, races a UX timeout)', () => {
  const baseParams = { userId: 'u1', accessToken: 't1', behaviourSummary: buildWeeklyBehaviourSummary([], [], {}) };

  test('returns the assessment + generatedAt on a valid response', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ assessment: { headline: 'x' }, generatedAt: '2026-09-08T00:00:00Z' }) }) as any;
    const result = await fetchWeeklyAdaptation(baseParams, mockFetch, 200);
    assert.deepEqual(result, { assessment: { headline: 'x' }, generatedAt: '2026-09-08T00:00:00Z' });
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

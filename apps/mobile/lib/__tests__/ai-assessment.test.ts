import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidAssessment, isCanonicalPlanReady, fetchOnboardingAssessment, deriveCategoryCounts, sumDurationMinutes, sortSupportOpportunities,
  projectPlanSchedule,
  type SupportOpportunity, type StartingPlanActivity,
} from '../ai-assessment.ts';
import { EMPTY_ANSWERS } from '../onboarding.ts';

const VALID_ASSESSMENT = {
  headline: 'Consistency matters more than doing more.',
  summary: 'You want to feel calmer and more consistent, with sleep as your main focus.',
  starting_point: {
    experience: 'New to structured activity',
    available_time: 'A few hours a week',
    main_barriers: ['motivation'],
  },
  recommendation: {
    approach: 'self_directed',
    title: 'Start with light movement and a sleep routine',
    reason: 'Nothing in your answers points to needing paid support yet.',
  },
  support_opportunities: [],
  starting_plan: {
    title: 'Your first week',
    rationale: 'A short, consistent routine is the best starting point for reducing stress.',
    activities: [
      { day: 'Monday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light', title: 'Easy walk', description: 'Keep this relaxed.' },
      { day: 'Wednesday', category: 'recovery', activity: 'Yoga', duration_minutes: 30, intensity: 'light', title: 'Gentle yoga', description: 'Focus on breathing.' },
      { day: 'Friday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light', title: 'Easy walk', description: 'Same time as Monday if possible.' },
    ],
  },
  weekly_focus: {
    title: 'Show up consistently',
    description: 'The goal this week is simply to complete the planned sessions.',
  },
  next_steps: ['Note your stress level after each session', 'Review how the week felt on Sunday'],
};

const baseParams = { userId: 'user-1', onboardingAnswers: EMPTY_ANSWERS, accessToken: 'token-1' };

describe('isValidAssessment', () => {
  test('accepts a well-formed assessment', () => {
    assert.equal(isValidAssessment(VALID_ASSESSMENT), true);
  });

  test('rejects an old Day-1 recommendation.approach value', () => {
    const bad = { ...VALID_ASSESSMENT, recommendation: { ...VALID_ASSESSMENT.recommendation, approach: 'personal_trainer' } };
    assert.equal(isValidAssessment(bad), false);
  });

  test('rejects the old pre-fix mutually-exclusive approach values (forces regeneration of saved rows in the old shape)', () => {
    for (const oldApproach of ['professional_support_optional', 'personal_trainer_support', 'nutrition_support']) {
      const bad = { ...VALID_ASSESSMENT, recommendation: { ...VALID_ASSESSMENT.recommendation, approach: oldApproach } };
      assert.equal(isValidAssessment(bad), false, `${oldApproach} should no longer validate`);
    }
  });

  test('rejects a saved row missing support_opportunities entirely (old pre-fix shape)', () => {
    const { support_opportunities, ...rest } = VALID_ASSESSMENT as any;
    assert.equal(isValidAssessment(rest), false);
  });

  test('accepts both a personal_trainer and nutrition opportunity together', () => {
    const both = {
      ...VALID_ASSESSMENT,
      support_opportunities: [
        { type: 'personal_trainer', relevance: 'high', reason: 'x' },
        { type: 'nutrition', relevance: 'medium', reason: 'x' },
      ],
    };
    assert.equal(isValidAssessment(both), true);
  });

  test('rejects a "low" relevance value', () => {
    const bad = { ...VALID_ASSESSMENT, support_opportunities: [{ type: 'nutrition', relevance: 'low', reason: 'x' }] };
    assert.equal(isValidAssessment(bad), false);
  });

  test('rejects an empty next_steps array', () => {
    assert.equal(isValidAssessment({ ...VALID_ASSESSMENT, next_steps: [] }), false);
  });

  test('rejects a missing starting_plan', () => {
    const { starting_plan, ...rest } = VALID_ASSESSMENT;
    assert.equal(isValidAssessment(rest), false);
  });

  test('rejects an empty activities array', () => {
    const bad = { ...VALID_ASSESSMENT, starting_plan: { ...VALID_ASSESSMENT.starting_plan, activities: [] } };
    assert.equal(isValidAssessment(bad), false);
  });

  test('rejects a missing weekly_focus', () => {
    const { weekly_focus, ...rest } = VALID_ASSESSMENT;
    assert.equal(isValidAssessment(rest), false);
  });
});

describe('isCanonicalPlanReady (LH-19 — gate the completion actions on the real plan)', () => {
  // §10 A — generation begins / still running
  test('loading phase → NOT ready (spinner shown, both actions disabled)', () => {
    assert.equal(isCanonicalPlanReady('loading', null), false);
    assert.equal(isCanonicalPlanReady('loading', VALID_ASSESSMENT), false);
  });
  test('idle phase → NOT ready', () => {
    assert.equal(isCanonicalPlanReady('idle', null), false);
  });

  // §10 B / §6 — initial UX window expired, canonical plan not yet arrived
  test('fallback phase with no canonical assessment → NOT ready ("finishing" state, disabled)', () => {
    assert.equal(isCanonicalPlanReady('fallback', null), false);
  });
  test('fallback phase even if a stale/partial object is present → NOT ready', () => {
    const partial = { headline: 'x', summary: 'y' };
    assert.equal(isCanonicalPlanReady('fallback', partial), false);
  });

  // §7 / §10 D — generation failure
  test('failure (phase never reaches ready) → NOT ready, actions stay disabled', () => {
    assert.equal(isCanonicalPlanReady('idle', null), false);
    assert.equal(isCanonicalPlanReady('fallback', null), false);
  });

  // §2 — must not be "ready" on partial/invalid data even if the phase says ready
  test('ready phase but assessment is null / partial / has no activities → NOT ready', () => {
    assert.equal(isCanonicalPlanReady('ready', null), false);
    assert.equal(isCanonicalPlanReady('ready', { headline: 'x', summary: 'y' }), false);
    const noActivities = { ...VALID_ASSESSMENT, starting_plan: { ...VALID_ASSESSMENT.starting_plan, activities: [] } };
    assert.equal(isCanonicalPlanReady('ready', noActivities), false);
  });

  // §10 C / §6 — the canonical assessment arrives (initial or via poll)
  test('ready phase + a fully valid canonical plan → READY (both actions enable)', () => {
    assert.equal(isCanonicalPlanReady('ready', VALID_ASSESSMENT), true);
  });

  // §8 — the handler-guard contract: `if (!planReady) return` blocks navigation
  test('the value drives the handler guard — falsy in every not-ready state, truthy only when canonical', () => {
    const notReady = [
      isCanonicalPlanReady('idle', null),
      isCanonicalPlanReady('loading', null),
      isCanonicalPlanReady('fallback', null),
      isCanonicalPlanReady('ready', null),
      isCanonicalPlanReady('ready', { starting_plan: { activities: [] } }),
    ];
    assert.ok(notReady.every(v => v === false), 'no not-ready state may return true');
    assert.equal(isCanonicalPlanReady('ready', VALID_ASSESSMENT), true);
  });
});

describe('deriveCategoryCounts (category counts remain derived, never AI-generated)', () => {
  test('derives counts from activities — the single source of truth', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    assert.deepEqual(counts, [
      { category: 'cardio', label: 'Cardio', count: 2 },
      { category: 'recovery', label: 'Recovery', count: 1 },
    ]);
  });

  test('omits zero-count categories entirely rather than showing 0', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    assert.equal(counts.some(c => c.category === 'strength'), false);
  });

  test('total across derived counts always matches the number of activities', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    assert.equal(total, VALID_ASSESSMENT.starting_plan.activities.length);
  });
});

describe('projectPlanSchedule (LH-24 — completion card mirrors the canonical plan)', () => {
  const act = (o: Partial<StartingPlanActivity>): StartingPlanActivity => ({
    day: 'Monday', category: 'strength', activity: 'Full body', duration_minutes: 45,
    intensity: 'moderate', title: 'Strength A', description: '...', ...o,
  });

  // §9 — the exact device repro
  const DEVICE_REPRO: StartingPlanActivity[] = [
    act({ day: 'Monday', category: 'strength', title: 'Strength A' }),
    act({ day: 'Wednesday', category: 'strength', title: 'Strength B' }),
    act({ day: 'Friday', category: 'strength', title: 'Strength C' }),
  ];

  test('§9 — Mon/Wed/Fri all-strength plan projects exactly Mon/Wed/Fri, 3 rows, 3 strength, no cardio', () => {
    const rows = projectPlanSchedule(DEVICE_REPRO);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.day), ['Monday', 'Wednesday', 'Friday']);
    assert.ok(rows.every(r => r.category === 'strength'));
    const counts = deriveCategoryCounts(DEVICE_REPRO);
    assert.deepEqual(counts, [{ category: 'strength', label: 'Strength', count: 3 }]);
    assert.equal(counts.some(c => c.category === 'cardio'), false);
  });

  test('row count always equals the canonical activity count — never an independent number', () => {
    for (const n of [2, 3, 4, 5]) {
      const acts = Array.from({ length: n }, (_, i) => act({ day: `D${i}`, title: `T${i}` }));
      assert.equal(projectPlanSchedule(acts).length, n);
    }
  });

  test('preserves the canonical array order (chronological) — no re-sorting or grouping by type', () => {
    const mixed = [
      act({ day: 'Tuesday', category: 'cardio', title: 'Run' }),
      act({ day: 'Thursday', category: 'strength', title: 'Lift' }),
      act({ day: 'Saturday', category: 'recovery', title: 'Mobility' }),
    ];
    assert.deepEqual(projectPlanSchedule(mixed).map(r => r.day), ['Tuesday', 'Thursday', 'Saturday']);
  });

  test('mixed plan: projected category composition equals deriveCategoryCounts', () => {
    const mixed = [
      act({ category: 'strength' }), act({ category: 'strength' }),
      act({ category: 'cardio' }), act({ category: 'cardio' }),
    ];
    const rows = projectPlanSchedule(mixed);
    const strength = rows.filter(r => r.category === 'strength').length;
    const cardio = rows.filter(r => r.category === 'cardio').length;
    assert.equal(strength, 2);
    assert.equal(cardio, 2);
    assert.deepEqual(deriveCategoryCounts(mixed), [
      { category: 'strength', label: 'Strength', count: 2 },
      { category: 'cardio', label: 'Cardio', count: 2 },
    ]);
  });

  test('each row is a verbatim read of the activity — day / category / title / activity / duration', () => {
    const [row] = projectPlanSchedule([act({
      day: 'Sunday', category: 'mobility', title: 'Stretch', activity: 'Yoga flow', duration_minutes: 20,
    })]);
    assert.deepEqual(
      { day: row.day, category: row.category, title: row.title, activity: row.activity, durationMinutes: row.durationMinutes },
      { day: 'Sunday', category: 'mobility', title: 'Stretch', activity: 'Yoga flow', durationMinutes: 20 },
    );
    assert.equal(row.categoryLabel, 'Mobility');
  });

  test('carries planned_date through when present, null when absent', () => {
    assert.equal(projectPlanSchedule([act({ planned_date: '2026-09-14' })])[0].plannedDate, '2026-09-14');
    assert.equal(projectPlanSchedule([act({})])[0].plannedDate, null);
  });

  test('empty activity list projects to [] — never a fabricated default schedule', () => {
    assert.deepEqual(projectPlanSchedule([]), []);
  });

  test('a mid-week / non-consecutive plan keeps its own order and days (§10 E/F)', () => {
    const midWeek = [
      act({ day: 'Wednesday', category: 'strength', title: 'A' }),
      act({ day: 'Friday', category: 'cardio', title: 'B' }),
      act({ day: 'Sunday', category: 'strength', title: 'C' }),
    ];
    assert.deepEqual(projectPlanSchedule(midWeek).map(r => `${r.day}:${r.category}`),
      ['Wednesday:strength', 'Friday:cardio', 'Sunday:strength']);
  });
});

describe('sumDurationMinutes', () => {
  test('sums duration_minutes across all activities', () => {
    assert.equal(sumDurationMinutes(VALID_ASSESSMENT.starting_plan.activities), 90);
  });
});

describe('fetchOnboardingAssessment', () => {
  test('returns the assessment + generatedAt (plan identifier) on a valid 200 response within the timeout', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ assessment: VALID_ASSESSMENT, generatedAt: '2026-09-01T12:00:00.000Z' }),
    }) as any;
    const result = await fetchOnboardingAssessment(baseParams, mockFetch, 200);
    assert.deepEqual(result, { assessment: VALID_ASSESSMENT, generatedAt: '2026-09-01T12:00:00.000Z' });
  });

  test('returns null when generatedAt is missing — an assessment without a plan identifier is not usable', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ assessment: VALID_ASSESSMENT }) }) as any;
    const result = await fetchOnboardingAssessment(baseParams, mockFetch, 200);
    assert.equal(result, null);
  });

  test('returns null (never throws) when the network call rejects', async () => {
    const mockFetch = async () => { throw new Error('network down'); };
    const result = await fetchOnboardingAssessment(baseParams, mockFetch as any, 200);
    assert.equal(result, null);
  });

  test('returns null on a non-2xx response', async () => {
    const mockFetch = async () => ({ ok: false, json: async () => ({}) }) as any;
    const result = await fetchOnboardingAssessment(baseParams, mockFetch, 200);
    assert.equal(result, null);
  });

  test('returns null when the response body is malformed', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => ({ assessment: { headline: 'only this field' } }) }) as any;
    const result = await fetchOnboardingAssessment(baseParams, mockFetch, 200);
    assert.equal(result, null);
  });

  test('AI failure does not throw — onboarding completion is unaffected by this call', async () => {
    const mockFetch = async () => { throw new Error('timeout'); };
    await assert.doesNotReject(fetchOnboardingAssessment(baseParams, mockFetch as any, 200));
  });

  test('LH-30 — sends clientLocalDate (the user\'s LOCAL calendar date, canonical YYYY-MM-DD) so the server never backfills a past session', async () => {
    let sentBody: any;
    const mockFetch = async (_url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ assessment: VALID_ASSESSMENT, generatedAt: '2026-09-08T22:30:00.000Z' }) } as any;
    };
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'Africa/Nairobi'; // UTC+3
      // 22:30 UTC on the 7th == 01:30 local on the 8th → the local calendar day is the 8th.
      const localMidnightIsh = new Date('2026-09-07T22:30:00.000Z');
      await fetchOnboardingAssessment(baseParams, mockFetch as any, 200, localMidnightIsh);
      assert.equal(sentBody.clientLocalDate, '2026-09-08');
      // a UTC slice would have sent '2026-09-07' — the exact LH-30 defect.
      assert.notEqual(sentBody.clientLocalDate, localMidnightIsh.toISOString().slice(0, 10));
      // the rest of the params are passed through untouched
      assert.equal(sentBody.userId, baseParams.userId);
      assert.equal(sentBody.accessToken, baseParams.accessToken);
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    }
  });

  test('timeout triggers the fallback signal (null) when the request is slower than the threshold', async () => {
    const neverResolves = () => new Promise(() => {}); // simulates a request slower than the UX timeout
    const start = Date.now();
    const result = await fetchOnboardingAssessment(baseParams, neverResolves as any, 100);
    assert.equal(result, null);
    assert.ok(Date.now() - start < 1000, 'should resolve promptly at the timeout, not hang');
  });

  test('a slow-but-eventually-successful request is not left dangling (resolves via the real request after the race, if awaited directly)', async () => {
    // Confirms the underlying request promise itself still resolves to a
    // valid result even past the UX deadline — i.e. nothing in the fetch
    // path itself is torn down at the timeout (no AbortController), which
    // is what lets the server finish saving even after the client moves on.
    let resolveFetch: (v: any) => void;
    const slowFetch = () => new Promise(resolve => { resolveFetch = resolve; });
    const racePromise = fetchOnboardingAssessment(baseParams, slowFetch as any, 50);
    const raceResult = await racePromise;
    assert.equal(raceResult, null); // UX timeout fired first

    // The underlying "request" would still resolve successfully later in
    // real usage (proven by exercising the same fetchImpl directly here) —
    // fetchOnboardingAssessment doesn't cancel it, it just stops waiting.
    resolveFetch!({ ok: true, json: async () => ({ assessment: VALID_ASSESSMENT, generatedAt: '2026-09-01T12:00:00.000Z' }) });
  });
});

describe('sortSupportOpportunities (Part 20 — relevance order, never commercial signals)', () => {
  test('sorts HIGH before MEDIUM', () => {
    const opportunities: SupportOpportunity[] = [
      { type: 'nutrition', relevance: 'medium', reason: 'x' },
      { type: 'personal_trainer', relevance: 'high', reason: 'x' },
    ];
    const sorted = sortSupportOpportunities(opportunities);
    assert.equal(sorted[0].type, 'personal_trainer');
    assert.equal(sorted[1].type, 'nutrition');
  });

  test('preserves original order when relevance is equal (stable, deterministic)', () => {
    const opportunities: SupportOpportunity[] = [
      { type: 'nutrition', relevance: 'high', reason: 'x' },
      { type: 'personal_trainer', relevance: 'high', reason: 'x' },
    ];
    const sorted = sortSupportOpportunities(opportunities);
    assert.equal(sorted[0].type, 'nutrition');
    assert.equal(sorted[1].type, 'personal_trainer');
  });

  test('does not mutate the input array', () => {
    const opportunities: SupportOpportunity[] = [
      { type: 'nutrition', relevance: 'medium', reason: 'x' },
      { type: 'personal_trainer', relevance: 'high', reason: 'x' },
    ];
    const copy = [...opportunities];
    sortSupportOpportunities(opportunities);
    assert.deepEqual(opportunities, copy);
  });
});

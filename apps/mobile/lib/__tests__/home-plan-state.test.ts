import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHomePlanState, resolvePlanCoverage, shouldNeutraliseExerciseRing,
  type HomePlanStateInput,
} from '../home-plan-state.ts';

// Beta Feedback #021 — Home continuity, plan maturity & rest-day experience.
// Beta Feedback #021B — runtime precedence fix: active-plan date coverage
// decides rest vs. transition FIRST; a completed week must not downgrade a
// day the active plan still owns into "programme transition".

function input(over: Partial<HomePlanStateInput> = {}): HomePlanStateInput {
  return {
    loadError: false,
    hasAssessment: true,
    isEstablished: true,
    hasTodayActivity: false,
    todayCompleted: false,
    todaySkipped: false,
    nextKind: 'upcoming',
    planCoverage: 'within',
    ...over,
  };
}

describe('§18.1 — brand-new user, first plan, zero history → FIRST_PLAN', () => {
  test('not established, regardless of today', () => {
    assert.equal(resolveHomePlanState(input({ isEstablished: false })).state, 'first_plan');
    assert.equal(resolveHomePlanState(input({ isEstablished: false, hasTodayActivity: true })).state, 'first_plan');
  });
});

describe('§18.2 — established user, training today → TRAINING_TODAY, never first plan', () => {
  test('established + today scheduled + unresolved', () => {
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: true }));
    assert.equal(r.state, 'training_today');
    assert.notEqual(r.state, 'first_plan');
  });
});

describe('§18.3 — established user, intentional rest today → REST_DAY', () => {
  test('established + no activity today + within plan coverage', () => {
    const r = resolveHomePlanState(input({ hasTodayActivity: false, planCoverage: 'within' }));
    assert.equal(r.state, 'rest_day');
  });
});

describe('§18.4 — rest today + rest tomorrow + workout Monday → REST_DAY, next-up handled upstream', () => {
  test('nextKind stays "upcoming" (selectNextActivity already resolves Monday); state is rest_day', () => {
    // Home's existing #012 selectNextActivity already finds the next
    // unresolved future activity regardless of how many rest days precede
    // it — this resolver only needs plan coverage to know today is a rest
    // day within the active plan.
    assert.equal(resolveHomePlanState(input({ nextKind: 'upcoming', planCoverage: 'within' })).state, 'rest_day');
  });
});

describe('§18.5 — workout completed today → TRAINING_COMPLETED_TODAY', () => {
  test('completed', () => {
    const r = resolveHomePlanState(input({ hasTodayActivity: true, todayCompleted: true }));
    assert.equal(r.state, 'training_completed_today');
    assert.equal(r.todayResolved, true);
  });
  test('skipped also resolves today (distinct completion detail is a presentation concern)', () => {
    const r = resolveHomePlanState(input({ hasTodayActivity: true, todaySkipped: true }));
    assert.equal(r.state, 'training_completed_today');
    assert.equal(r.todayResolved, true);
  });
});

describe('§18.6 — activity scheduled today but incomplete → never rest, regardless of time of day', () => {
  test('hasTodayActivity alone decides training vs rest, not a clock', () => {
    const r = resolveHomePlanState(input({ hasTodayActivity: true, todayCompleted: false, todaySkipped: false }));
    assert.equal(r.state, 'training_today');
    assert.notEqual(r.state, 'rest_day');
  });
});

describe('§18.7 — no active plan → NO_ACTIVE_PLAN, not rest day', () => {
  test('hasAssessment:false wins over everything else', () => {
    const r = resolveHomePlanState(input({ hasAssessment: false, isEstablished: true, hasTodayActivity: false }));
    assert.equal(r.state, 'no_active_plan');
    assert.notEqual(r.state, 'rest_day');
  });
});

describe('§18.8 — programme query failure → LOAD_ERROR, not rest day', () => {
  test('loadError wins over every other input', () => {
    const r = resolveHomePlanState(input({ loadError: true, hasAssessment: true, isEstablished: true }));
    assert.equal(r.state, 'load_error');
    assert.notEqual(r.state, 'rest_day');
  });
});

describe('§18.9 — rest day never shows a false exercise-target failure', () => {
  test('rest_day + nothing else scheduled → neutralise', () => {
    assert.equal(shouldNeutraliseExerciseRing('rest_day', 0), true);
  });
  test('rest_day + a genuinely separate scheduled item → do NOT neutralise (real evidence)', () => {
    assert.equal(shouldNeutraliseExerciseRing('rest_day', 2), false);
  });
  test('training_today is never neutralised', () => {
    assert.equal(shouldNeutraliseExerciseRing('training_today', 0), false);
  });
});

describe('§18.10 — Friday rest day + measurement due: resolver is decoupled from #020B', () => {
  test('the resolver takes no measurement-checkin input at all — REST_DAY stands on its own', () => {
    const r = resolveHomePlanState(input({ hasTodayActivity: false, planCoverage: 'within' }));
    assert.equal(r.state, 'rest_day');
    assert.ok(!('measurementCheckin' in r));
  });
});

describe('§18.13 — established user history: initial-plan messaging cannot reappear on a later rest day', () => {
  test('isEstablished:true + zero activity today + within coverage → rest_day, never first_plan', () => {
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, nextKind: 'none', planCoverage: 'within' }));
    assert.equal(r.state, 'rest_day');
    assert.notEqual(r.state, 'first_plan');
  });
});

describe('priority chain never contradicts itself', () => {
  test('loadError beats a missing plan', () => {
    assert.equal(resolveHomePlanState(input({ loadError: true, hasAssessment: false })).state, 'load_error');
  });
  test('no plan beats "not established"', () => {
    assert.equal(resolveHomePlanState(input({ hasAssessment: false, isEstablished: false })).state, 'no_active_plan');
  });
  test('not-established beats a same-day completed activity', () => {
    // An activity can be completed within the very first plan without that
    // making the user "established" by itself if no canonical lifecycle
    // evidence exists yet for OTHER weeks — first_plan still applies to the
    // headline-level state; per-day completion is a presentation detail.
    assert.equal(resolveHomePlanState(input({ isEstablished: false, hasTodayActivity: true, todayCompleted: true })).state, 'first_plan');
  });
});

// ── §021B.10 — the exact regression matrix from the device-failure report ──

describe('Beta #021B — rest-day precedence over a fully-completed week', () => {
  test('A. established, active plan covers today, no activity, 0 of 5 completed → REST_DAY', () => {
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'within', nextKind: 'upcoming' }));
    assert.equal(r.state, 'rest_day');
  });

  test('B. established, active plan covers today, 5 of 5 completed, no future activity this week → REST_DAY (not programme_transition)', () => {
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'within', nextKind: 'none' }));
    assert.equal(r.state, 'rest_day');
    assert.notEqual(r.state, 'programme_transition');
  });

  test('C. same as B, but next workout is already known (next week scheduled) → still REST_DAY; next-up is a separate, independent concern', () => {
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'within', nextKind: 'upcoming' }));
    assert.equal(r.state, 'rest_day');
    // The resolver never claims to know about "next week's activity" itself
    // — that's #012's selectNextActivity/homeUpcomingRef, rendered
    // independently of homePlanState (§H below).
  });

  test('D. today is AFTER the active plan\'s week and no next plan → PROGRAMME_TRANSITION', () => {
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'after', nextKind: 'none' }));
    assert.equal(r.state, 'programme_transition');
  });

  test('E. first-ever plan, no historical completion, no previous plan → FIRST_PLAN', () => {
    const r = resolveHomePlanState(input({ isEstablished: false, hasTodayActivity: false, planCoverage: 'within', nextKind: 'none' }));
    assert.equal(r.state, 'first_plan');
  });

  test('F. established user, coaching_memory empty → NEVER FIRST_PLAN (coaching memory is not part of this contract at all)', () => {
    // home-plan-state.ts takes no coaching-memory input — isEstablished is
    // fed purely from fitness_plans/plan_activity_completions lifecycle
    // evidence (index.tsx), so an empty coaching_memory table cannot reach
    // this resolver at all.
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'within' }));
    assert.notEqual(r.state, 'first_plan');
  });

  test('G. established user, current-week completions = 0 → NEVER FIRST_PLAN', () => {
    // homeWeeklyProgress.completed === 0 is not part of this contract either
    // — isEstablished already reflects cross-week/lifetime evidence.
    const r = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'within' }));
    assert.notEqual(r.state, 'first_plan');
  });

  test('week-boundary edge case — day after week_end_date, established, nothing next → PROGRAMME_TRANSITION; the day before (still "within") → REST_DAY', () => {
    const withinLastDay = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'within', nextKind: 'none' }));
    assert.equal(withinLastDay.state, 'rest_day');
    const dayAfter = resolveHomePlanState(input({ isEstablished: true, hasTodayActivity: false, planCoverage: 'after', nextKind: 'none' }));
    assert.equal(dayAfter.state, 'programme_transition');
  });

  test('undated legacy plan (planCoverage "unknown") falls back to the nextKind heuristic rather than guessing', () => {
    assert.equal(resolveHomePlanState(input({ planCoverage: 'unknown', nextKind: 'upcoming' })).state, 'rest_day');
    assert.equal(resolveHomePlanState(input({ planCoverage: 'unknown', nextKind: 'none' })).state, 'programme_transition');
  });

  test('plan starts later ("before") falls back to the nextKind heuristic', () => {
    assert.equal(resolveHomePlanState(input({ planCoverage: 'before', nextKind: 'upcoming' })).state, 'rest_day');
    assert.equal(resolveHomePlanState(input({ planCoverage: 'before', nextKind: 'none' })).state, 'programme_transition');
  });
});

describe('resolvePlanCoverage — pure local-ISO-date comparison', () => {
  test('today strictly inside [start, end] → within', () => {
    assert.equal(resolvePlanCoverage('2026-09-01', '2026-09-07', '2026-09-05'), 'within');
  });
  test('today equals start or end → within (inclusive)', () => {
    assert.equal(resolvePlanCoverage('2026-09-01', '2026-09-07', '2026-09-01'), 'within');
    assert.equal(resolvePlanCoverage('2026-09-01', '2026-09-07', '2026-09-07'), 'within');
  });
  test('today after end → after', () => {
    assert.equal(resolvePlanCoverage('2026-09-01', '2026-09-07', '2026-09-08'), 'after');
  });
  test('today before start → before', () => {
    assert.equal(resolvePlanCoverage('2026-09-01', '2026-09-07', '2026-08-31'), 'before');
  });
  test('missing dates → unknown', () => {
    assert.equal(resolvePlanCoverage(null, null, '2026-09-05'), 'unknown');
    assert.equal(resolvePlanCoverage('2026-09-01', undefined, '2026-09-05'), 'unknown');
  });
});

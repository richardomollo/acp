import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHomeIntelligenceInsight, findTodayActivity,
  selectNextActivity, resolveActivityDate, dateLabelFor,
} from '../home-intelligence.ts';
import type { StartingPlanActivity } from '../ai-assessment.ts';
import type { AIAssessment } from '../ai-assessment.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'x', ...overrides };
}

const BASE_ASSESSMENT: AIAssessment = {
  headline: 'Consistency matters more than doing more.',
  summary: 'x',
  starting_point: { experience: 'x', available_time: 'x', main_barriers: [] },
  recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
  starting_plan: { title: 'x', rationale: 'x', activities: [activity()] },
  weekly_focus: { title: 'x', description: 'x' },
  next_steps: ['x'],
};

describe('getHomeIntelligenceInsight — Priority 1: today incomplete', () => {
  test('surfaces today\'s activity with the correct CTA', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: activity({ category: 'strength', activity: 'Gym', duration_minutes: 60 }),
      todayCompleted: false,
      weeklyProgress: { completed: 1, total: 4 },
    });
    assert.equal(insight.headline, "Today's focus is strength.");
    assert.ok(insight.body.includes('60-minute'));
    assert.equal(insight.ctaLabel, "View today's plan →");
  });
});

describe('getHomeIntelligenceInsight — Priority 2: today completed', () => {
  test('shows the completed framing and weekly count, never encouraging extra training', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: activity({ category: 'strength' }),
      todayCompleted: true,
      weeklyProgress: { completed: 2, total: 4 },
    });
    assert.equal(insight.headline, "Today's strength session is done.");
    assert.ok(insight.body.includes('2 of 4'));
    assert.equal(insight.ctaLabel, 'View my progress →');
    assert.equal(insight.ctaTarget, '/weekly-plan');
    assert.ok(!insight.body.toLowerCase().includes('add'), 'must not suggest extra training');
  });
});

describe('getHomeIntelligenceInsight — Priority 3: no activity today, progressing', () => {
  test('frames it as a lighter/recovery day when the user has completions this week', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: null,
      todayCompleted: false,
      weeklyProgress: { completed: 2, total: 4 },
    });
    assert.equal(insight.headline, 'Today is a lighter day.');
    assert.ok(insight.body.includes('2 of 4'));
    assert.ok(insight.body.toLowerCase().includes('recovery'));
  });
});

describe('getHomeIntelligenceInsight — Priority 4: behind plan, never guilt-oriented', () => {
  test('states remaining activities factually', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: null,
      todayCompleted: false,
      weeklyProgress: { completed: 0, total: 3 },
    });
    assert.ok(insight.body.includes('3 activities'));
  });

  test('never uses guilt-oriented language', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: null,
      todayCompleted: false,
      weeklyProgress: { completed: 0, total: 3 },
    });
    const lower = (insight.headline + ' ' + insight.body).toLowerCase();
    for (const banned of ['failing', 'behind schedule', 'missed your goal', 'catch up all at once is required', "you're behind"]) {
      assert.ok(!lower.includes(banned), `must not contain "${banned}"`);
    }
  });
});

describe('getHomeIntelligenceInsight — Day 6: optional longitudinal insight', () => {
  test('replaces the generic lighter-day filler when there is no activity today and a longitudinal insight is provided', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: null,
      todayCompleted: false,
      weeklyProgress: { completed: 2, total: 4 },
      longitudinalInsight: { headline: "You're building consistency", body: '8 of your last 10 planned activities completed.' },
    });
    assert.equal(insight.headline, "You're building consistency");
    assert.equal(insight.body, '8 of your last 10 planned activities completed.');
    assert.equal(insight.ctaLabel, 'View progress →');
  });

  test('never overrides a pending or completed activity for today, even when a longitudinal insight is provided', () => {
    const pending = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: activity({ category: 'strength' }),
      todayCompleted: false,
      weeklyProgress: { completed: 1, total: 4 },
      longitudinalInsight: { headline: 'Should not appear', body: 'Should not appear' },
    });
    assert.equal(pending.headline, "Today's focus is strength.");

    const completed = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: activity({ category: 'strength' }),
      todayCompleted: true,
      weeklyProgress: { completed: 2, total: 4 },
      longitudinalInsight: { headline: 'Should not appear', body: 'Should not appear' },
    });
    assert.equal(completed.headline, "Today's strength session is done.");
  });

  test('falls back to the existing lighter-day text when no longitudinal insight is supplied (default behaviour unchanged)', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: BASE_ASSESSMENT,
      todayActivity: null,
      todayCompleted: false,
      weeklyProgress: { completed: 2, total: 4 },
    });
    assert.equal(insight.headline, 'Today is a lighter day.');
  });
});

describe('getHomeIntelligenceInsight — Priority 5: no valid assessment', () => {
  test('offers to build a plan rather than showing broken AI content', () => {
    const insight = getHomeIntelligenceInsight({
      assessment: null,
      todayActivity: null,
      todayCompleted: false,
      weeklyProgress: { completed: 0, total: 0 },
    });
    assert.equal(insight.ctaLabel, 'Build your personal plan →');
    assert.equal(insight.ctaTarget, '/my-plan');
  });
});

describe('findTodayActivity', () => {
  test('finds the activity whose day matches a given date\'s weekday name', () => {
    const activities = [activity({ day: 'Monday' }), activity({ day: 'Wednesday', activity: 'Yoga' })];
    const wednesday = new Date('2026-09-02T09:00:00'); // a Wednesday
    const found = findTodayActivity(activities, wednesday);
    assert.equal(found?.activity, 'Yoga');
  });

  test('returns null when no activity falls on the given day', () => {
    const activities = [activity({ day: 'Monday' })];
    const wednesday = new Date('2026-09-02T09:00:00');
    assert.equal(findTodayActivity(activities, wednesday), null);
  });

  // Beta QA — the stored `day` is a free LLM string with no enforced casing;
  // a strict `===` silently hid Home's Today's Plan card while weekly-plan
  // (which normalises) still showed the session.
  test('matches leniently regardless of casing or surrounding whitespace', () => {
    const wednesday = new Date('2026-09-02T09:00:00');
    for (const day of ['wednesday', 'WEDNESDAY', ' Wednesday', 'Wednesday ']) {
      assert.equal(findTodayActivity([activity({ day, activity: 'Yoga' })], wednesday)?.activity, 'Yoga', day);
    }
  });

  test('prefers an explicit planned_date over the weekday name', () => {
    const wednesday = new Date('2026-09-02T09:00:00');
    const activities = [
      activity({ day: 'Wednesday', activity: 'StaleWeekday' }),
      activity({ day: 'Monday', planned_date: '2026-09-02', activity: 'DatedToday' }),
    ];
    assert.equal(findTodayActivity(activities, wednesday)?.activity, 'DatedToday');
  });
});

// ── Beta Feedback #012 — "up next" selection ───────────────────────────────
describe('selectNextActivity (Beta #012)', () => {
  const NOW = new Date('2026-09-01T12:00:00'); // Tuesday; tomorrow = Wed 2 Sep

  const A = (i: number, date: string, o: Partial<StartingPlanActivity> = {}) =>
    activity({ planned_date: date, title: `act${i}`, activity: `act${i}`, ...o });

  test('A — one activity today, incomplete → feature today; complete → advance to next future', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-03', { category: 'mobility' })];
    const incomplete = selectNextActivity({ activities: acts, completedIndexes: new Set(), now: NOW });
    assert.equal(incomplete.kind, 'today');
    assert.equal(incomplete.kind === 'today' && incomplete.ref.activityIndex, 0);

    const done = selectNextActivity({ activities: acts, completedIndexes: new Set([0]), now: NOW });
    assert.equal(done.kind, 'upcoming');
    assert.equal(done.kind === 'upcoming' && done.ref.activityIndex, 1);
    assert.equal(done.kind === 'upcoming' && done.dateLabel, 'Thursday');
  });

  test('B — two activities today, first done → feature the SECOND (still today), not tomorrow', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-01', { category: 'mobility' }), A(2, '2026-09-02')];
    const sel = selectNextActivity({ activities: acts, completedIndexes: new Set([0]), now: NOW });
    assert.equal(sel.kind, 'today');
    assert.equal(sel.kind === 'today' && sel.ref.activityIndex, 1);
  });

  test('C — all of today resolved → advance to next future activity', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-01'), A(2, '2026-09-02')];
    const sel = selectNextActivity({ activities: acts, completedIndexes: new Set([0, 1]), now: NOW });
    assert.equal(sel.kind, 'upcoming');
    assert.equal(sel.kind === 'upcoming' && sel.ref.activityIndex, 2);
    assert.equal(sel.kind === 'upcoming' && sel.dateLabel, 'Tomorrow');
  });

  test('D — today explicitly skipped → Home is not trapped, it advances', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-04')];
    const sel = selectNextActivity({ activities: acts, completedIndexes: new Set(), skippedIndexes: new Set([0]), now: NOW });
    assert.equal(sel.kind, 'upcoming');
    assert.equal(sel.kind === 'upcoming' && sel.ref.activityIndex, 1);
  });

  test('tomorrow is a rest day (no activity), Wednesday has one → label the weekday, flag restTomorrow', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-03', { category: 'strength' })];
    const sel = selectNextActivity({ activities: acts, completedIndexes: new Set([0]), now: NOW });
    assert.equal(sel.kind, 'upcoming');
    assert.equal(sel.kind === 'upcoming' && sel.dateLabel, 'Thursday');
    assert.equal(sel.kind === 'upcoming' && sel.restTomorrow, true);
  });

  test('no activity for two days → shows the actual next day, not an empty tomorrow', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-05')];
    const sel = selectNextActivity({ activities: acts, completedIndexes: new Set([0]), now: NOW });
    assert.equal(sel.kind, 'upcoming');
    assert.equal(sel.kind === 'upcoming' && sel.ref.dateIso, '2026-09-05');
    assert.equal(sel.kind === 'upcoming' && sel.dateLabel, 'Saturday');
    assert.equal(sel.kind === 'upcoming' && sel.restTomorrow, true);
  });

  test('a future activity already completed early is skipped — next UNRESOLVED wins (§15)', () => {
    const acts = [A(0, '2026-09-01'), A(1, '2026-09-02'), A(2, '2026-09-03')];
    const sel = selectNextActivity({ activities: acts, completedIndexes: new Set([0, 1]), now: NOW });
    assert.equal(sel.kind, 'upcoming');
    assert.equal(sel.kind === 'upcoming' && sel.ref.activityIndex, 2);
  });

  test('nothing left in the plan → kind "none" (caller handles Sunday / next-week / empty state)', () => {
    const acts = [A(0, '2026-09-01')];
    assert.equal(selectNextActivity({ activities: acts, completedIndexes: new Set([0]), now: NOW }).kind, 'none');
  });

  test('Sunday → Monday: run the selector on a scheduled next-week plan whose activities are all future', () => {
    const sundayNow = new Date('2026-09-06T20:00:00'); // Sunday
    const nextWeek = [
      activity({ planned_date: '2026-09-07', title: 'Mon strength', activity: 'strength' }),
      activity({ planned_date: '2026-09-09', title: 'Wed run', activity: 'run', category: 'cardio' }),
    ];
    const sel = selectNextActivity({ activities: nextWeek, completedIndexes: new Set(), now: sundayNow });
    assert.equal(sel.kind, 'upcoming');
    assert.equal(sel.kind === 'upcoming' && sel.ref.activityIndex, 0);
    assert.equal(sel.kind === 'upcoming' && sel.dateLabel, 'Tomorrow');
  });
});

describe('resolveActivityDate / dateLabelFor', () => {
  const NOW = new Date('2026-09-01T12:00:00');
  test('resolveActivityDate prefers the stored planned_date', () => {
    assert.equal(resolveActivityDate(activity({ planned_date: '2026-09-10', day: 'Monday' }), NOW), '2026-09-10');
  });
  test('resolveActivityDate falls back to the next occurrence of the weekday (local)', () => {
    assert.equal(resolveActivityDate(activity({ day: 'wednesday' }), NOW), '2026-09-02');
    assert.equal(resolveActivityDate(activity({ day: 'Tuesday' }), NOW), '2026-09-01'); // today itself
  });
  test('dateLabelFor: today / tomorrow / weekday', () => {
    assert.equal(dateLabelFor('2026-09-01', NOW), 'Today');
    assert.equal(dateLabelFor('2026-09-02', NOW), 'Tomorrow');
    assert.equal(dateLabelFor('2026-09-04', NOW), 'Friday');
  });
});

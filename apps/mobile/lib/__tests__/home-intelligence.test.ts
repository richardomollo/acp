import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getHomeIntelligenceInsight, findTodayActivity } from '../home-intelligence.ts';
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
});

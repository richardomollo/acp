// Day 6.5 — End-to-End Coaching Validation. These tests exercise the REAL
// exported functions from longitudinal.ts/adaptation.ts/assessment.ts against
// one carefully-constructed four-week fixture (see buildFixture() below) that
// intentionally decouples "Saturday is a hard day" from "football/sport is a
// disliked activity" — the central distinction this task validates. No
// network/OpenAI calls here (that's the separate live-run script referenced
// in the Day 6.5 report) — everything below is deterministic and fast.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLongitudinalSummary, resolveMemorySync,
  type LongitudinalPlanInput, type LongitudinalCompletionInput,
} from '../longitudinal.ts';
import {
  preserveMeaningfulActivityContinuity, enforceAdaptationMagnitude, buildDeterministicFallbackPlan,
  WEEKLY_ADAPTATION_JSON_SCHEMA,
  type StartingPlanActivity, type AIAssessment,
} from '../adaptation.ts';
import {
  enforceSupportLogic, getWeeklyMinutesBudget, attachPlanDates, dateForWeekdayInWeek, validateAssessment,
} from '../../onboarding-assessment/assessment.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 40, intensity: 'moderate', title: 'x', description: 'x', ...overrides };
}

// ── The Day 6.5 fixture: 4 completed historical weeks ───────────────────────
// Designed so that:
//  - Gym (strength, Mon+Thu every week): 8 planned / 7 completed (1 miss, wk3 Thu).
//  - Walking (cardio, Tue every week): 4 planned / 4 completed (perfect).
//  - Saturday ROTATES category (football wk1/wk4, recovery wk2/wk3) specifically
//    so "Saturday is hard" and "football/sport is disliked" are NOT confounded —
//    football only appears twice total (wk1 miss, wk4 hit) => its own category
//    bucket lands at exactly 50%, i.e. ambiguous, never a difficulty pattern.
//  - Short sessions (<=30min: Tue walking + Fri mobility + one extra wk4 Wed):
//    9 planned / 8 completed (1 miss, wk4 Fri).
//  - Long sessions (>60min: the 4 Saturday slots, 90/70/65/90min): 4 planned / 1
//    completed (only wk4's Saturday football was done).
const WEEK_STARTS = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'];
const WEEK_ENDS = ['2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28'];
const NOW = new Date('2026-06-29T00:00:00Z'); // strictly after all 4 weeks' week_end_date

function week(planId: string, i: number, activities: StartingPlanActivity[]): LongitudinalPlanInput {
  return {
    planId, weekStartDate: WEEK_STARTS[i], weekEndDate: WEEK_ENDS[i],
    activities, nutritionFocusType: 'protein_consistency', supportTypes: [],
  };
}

function buildFixture(): { plans: LongitudinalPlanInput[]; completions: LongitudinalCompletionInput[] } {
  const gym = (day: string) => activity({ day, category: 'strength', activity: 'Gym full-body', duration_minutes: 40, title: 'Gym' });
  const walk = () => activity({ day: 'Tuesday', category: 'cardio', activity: 'Walk', duration_minutes: 25, title: 'Walking' });
  const mobility = (day = 'Friday', duration_minutes = 20) => activity({ day, category: 'mobility', activity: 'Mobility flow', duration_minutes, title: 'Mobility' });
  const football = (duration_minutes = 90) => activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes, title: 'Football' });
  const recovery = (duration_minutes: number) => activity({ day: 'Saturday', category: 'recovery', activity: 'Recovery walk', duration_minutes, title: 'Recovery' });

  const plans: LongitudinalPlanInput[] = [
    week('h1', 0, [gym('Monday'), walk(), gym('Thursday'), mobility(), football(90)]),
    week('h2', 1, [gym('Monday'), walk(), gym('Thursday'), mobility(), recovery(70)]),
    week('h3', 2, [gym('Monday'), walk(), gym('Thursday'), mobility(), recovery(65)]),
    week('h4', 3, [gym('Monday'), walk(), gym('Thursday'), mobility('Friday', 20), mobility('Wednesday', 15), football(90)]),
  ];

  // index maps (per week's activities array order, matching `plans` above):
  // h1: [0 Mon-gym✓, 1 Tue-walk✓, 2 Thu-gym✓, 3 Fri-mob✓, 4 Sat-football✗]
  // h2: [0 Mon-gym✓, 1 Tue-walk✓, 2 Thu-gym✓, 3 Fri-mob✓, 4 Sat-recovery✗]
  // h3: [0 Mon-gym✓, 1 Tue-walk✓, 2 Thu-gym✗, 3 Fri-mob✓, 4 Sat-recovery✗]
  // h4: [0 Mon-gym✓, 1 Tue-walk✓, 2 Thu-gym✓, 3 Fri-mob✗, 4 Wed-mob✓, 5 Sat-football✓]
  const completions: LongitudinalCompletionInput[] = [
    { planId: 'h1', activityIndex: 0 }, { planId: 'h1', activityIndex: 1 }, { planId: 'h1', activityIndex: 2 }, { planId: 'h1', activityIndex: 3 },
    { planId: 'h2', activityIndex: 0 }, { planId: 'h2', activityIndex: 1 }, { planId: 'h2', activityIndex: 2 }, { planId: 'h2', activityIndex: 3 },
    { planId: 'h3', activityIndex: 0 }, { planId: 'h3', activityIndex: 1 }, { planId: 'h3', activityIndex: 3 },
    { planId: 'h4', activityIndex: 0 }, { planId: 'h4', activityIndex: 1 }, { planId: 'h4', activityIndex: 2 }, { planId: 'h4', activityIndex: 4 }, { planId: 'h4', activityIndex: 5 },
  ];

  return { plans, completions };
}

describe('Day 6.5 — Scenario A: strong success category remains represented', () => {
  test('gym (strength) shows strong category_success at exactly 8/7', () => {
    const { plans, completions } = buildFixture();
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const gymPattern = summary.patterns.find(p => p.type === 'category_success' && p.subject === 'strength');
    assert.ok(gymPattern, 'expected a category_success pattern for strength');
    assert.deepEqual(gymPattern!.evidence, { planned: 8, completed: 7, rate: 0.875, weeks: 4 });
    assert.equal(gymPattern!.confidence, 'strong');
  });

  test('walking (cardio) also shows strong category_success at exactly 4/4', () => {
    const { plans, completions } = buildFixture();
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const walkPattern = summary.patterns.find(p => p.type === 'category_success' && p.subject === 'cardio');
    assert.ok(walkPattern, 'expected a category_success pattern for cardio');
    assert.deepEqual(walkPattern!.evidence, { planned: 4, completed: 4, rate: 1, weeks: 4 });
    assert.equal(walkPattern!.confidence, 'strong');
  });
});

describe('Day 6.5 — Scenario B: strong difficulty day influences adaptation (continuity guard, day bypass)', () => {
  test('a Saturday-scheduled category the model dropped is NOT force-reintroduced when Saturday has strong difficulty evidence', () => {
    const previous = [activity({ day: 'Monday', category: 'strength' }), activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 })];
    const next = [previous[0]]; // model dropped Saturday football entirely
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['football'], barriers: [], weekStartDate: '2026-07-06',
      strongDifficultyDays: new Set(['saturday']),
    });
    assert.equal(result.find(a => a.category === 'sport'), undefined, 'strong Saturday difficulty should let the removal stand');
  });

  test('without that evidence, the exact same single-week miss WOULD have been reintroduced (the guard is not simply disabled)', () => {
    const previous = [activity({ day: 'Monday', category: 'strength' }), activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 })];
    const next = [previous[0]];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['football'], barriers: [], weekStartDate: '2026-07-06',
      // no strongDifficultyDays/Categories passed
    });
    assert.ok(result.some(a => a.category === 'sport'), 'without strong evidence, one miss alone must still be protected');
  });
});

describe('Day 6.5 — Scenario C: strong short-duration success is recognised', () => {
  test('short (<=30min) sessions show strong duration_success at exactly 9/8', () => {
    const { plans, completions } = buildFixture();
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const shortPattern = summary.patterns.find(p => p.type === 'duration_success' && p.subject === 'short');
    assert.ok(shortPattern, 'expected a duration_success pattern for short sessions');
    assert.deepEqual(shortPattern!.evidence, { planned: 9, completed: 8, rate: 0.889, weeks: 4 });
    assert.equal(shortPattern!.confidence, 'strong');
  });
});

describe('Day 6.5 — Scenario D: strong long-duration difficulty is recognised', () => {
  test('long (>60min) sessions show strong duration_difficulty at exactly 4/1', () => {
    const { plans, completions } = buildFixture();
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const longPattern = summary.patterns.find(p => p.type === 'duration_difficulty' && p.subject === 'long');
    assert.ok(longPattern, 'expected a duration_difficulty pattern for long sessions');
    assert.deepEqual(longPattern!.evidence, { planned: 4, completed: 1, rate: 0.25, weeks: 4 });
    assert.equal(longPattern!.confidence, 'strong');
  });
});

describe('Day 6.5 — Scenario E: single-week miss does not override longitudinal success', () => {
  test('a category/day with 3 historical successes is still reintroduced after just one current-week miss', () => {
    // History: Monday sessions succeeded 3/3 (this is deliberately NOT strong-difficulty
    // evidence for Monday — the point is that success history + one miss must still protect).
    const previous = [activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 40 })];
    const next: StartingPlanActivity[] = []; // model dropped it after one missed Monday
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { strength: 1 }, preferredActivities: ['gym'], barriers: [], weekStartDate: '2026-07-06',
      // Monday has no strong difficulty evidence (history says it succeeds), so no bypass set contains it.
      strongDifficultyDays: new Set(['saturday']), strongDifficultyCategories: new Set(),
    });
    assert.ok(result.some(a => a.day === 'Monday'), 'one recent miss must not override established longitudinal success — Monday must still be protected');
  });
});

describe('Day 6.5 — Scenario F: strong longitudinal difficulty can override the continuity guard (category bypass)', () => {
  test('a category with strong longitudinal difficulty is not force-reintroduced, even matching preferences', () => {
    const previous = [activity({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 40 })];
    const next: StartingPlanActivity[] = [];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { cardio: 1 }, preferredActivities: ['running'], barriers: [], weekStartDate: '2026-07-06',
      strongDifficultyCategories: new Set(['cardio']),
    });
    assert.equal(result.length, 0, 'strong category-level difficulty should let the removal stand');
  });
});

describe('Day 6.5 — Scenario G: ambiguous evidence produces no conclusion', () => {
  test('football/sport (2 observations, 50% rate) produces no pattern at all — not success, not difficulty', () => {
    const { plans, completions } = buildFixture();
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const sportPattern = summary.patterns.find(p => p.subject === 'sport');
    assert.equal(sportPattern, undefined, 'football/sport must not surface as either a success or a difficulty pattern');
  });
});

describe('Day 6.5 — Scenario H: missing historical week is not interpreted as 0% adherence', () => {
  test('a gap week (no canonical plan) is simply absent from weeks_available, never a synthesized failed week', () => {
    const { plans, completions } = buildFixture();
    const withoutWeek3 = plans.filter(p => p.planId !== 'h3');
    const completionsWithoutWeek3 = completions.filter(c => c.planId !== 'h3');
    const summary = buildLongitudinalSummary(withoutWeek3, completionsWithoutWeek3, NOW);
    assert.equal(summary.window.weeks_available, 3);
    // Gym: without h3's 2 planned (1 completed), totals become 6 planned / 6 completed — never counted as 8 planned with a phantom 0-completed week 3.
    const gymPattern = summary.patterns.find(p => p.type === 'category_success' && p.subject === 'strength');
    assert.deepEqual(gymPattern!.evidence, { planned: 6, completed: 6, rate: 1, weeks: 3 });
  });
});

describe('Day 6.5 — Scenario I: duplicate completion rows cannot inflate adherence', () => {
  test('two completion rows for the same (plan, activityIndex) still count as one completed activity', () => {
    const plans: LongitudinalPlanInput[] = [week('d1', 0, [activity({ day: 'Monday' }), activity({ day: 'Thursday' })])];
    const duplicated: LongitudinalCompletionInput[] = [
      { planId: 'd1', activityIndex: 0 }, { planId: 'd1', activityIndex: 0 }, { planId: 'd1', activityIndex: 0 }, // 3 rows, same activity
    ];
    const summary = buildLongitudinalSummary(plans, duplicated, NOW);
    assert.equal(summary.overall.completed_sessions, 1, 'duplicate rows for the same activity index must not inflate the completed count');
    assert.equal(summary.overall.planned_sessions, 2);
  });
});

describe('Day 6.5 — Scenario J: PT recommendation remains independent of ordinary missed sessions', () => {
  test('enforceSupportLogic has no missed-session/behaviour parameter at all — an experienced, low-barrier profile never gets a forced PT entry', () => {
    const base: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'intermediate', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [],
      starting_plan: { title: 'x', rationale: 'x', activities: [activity()] },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
    };
    // Even though this profile has missed a session this week (a fact this
    // function is never even given), the deterministic PT rule only looks at
    // experience + barriers — neither of which trigger it here.
    const result = enforceSupportLogic(base, { strengthExperience: 'intermediate', barriers: ['time'] });
    assert.deepEqual(result.support_opportunities, []);
  });
});

describe('Day 6.5 — Scenario K: nutrition and PT opportunities can coexist', () => {
  test('a beginner with confidence/knowledge barriers gets PT:high added WITHOUT displacing an existing nutrition entry', () => {
    const base: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'beginner', available_time: 'x', main_barriers: ['confidence'] },
      recommendation: { approach: 'guided', title: 'x', reason: 'x' },
      support_opportunities: [{ type: 'nutrition', relevance: 'medium', reason: 'Supports the stated goal.' }],
      starting_plan: { title: 'x', rationale: 'x', activities: [activity()] },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
    };
    const result = enforceSupportLogic(base, { strengthExperience: 'beginner', barriers: ['confidence', 'knowledge'] });
    const pt = result.support_opportunities.find(o => o.type === 'personal_trainer');
    const nutrition = result.support_opportunities.find(o => o.type === 'nutrition');
    assert.equal(pt?.relevance, 'high', 'beginner + confidence/knowledge must yield a high PT opportunity');
    assert.ok(nutrition, 'the pre-existing nutrition opportunity must not be displaced');
    assert.equal(result.support_opportunities.length, 2);
  });

  test('an experienced user with no PT-trigger barriers is never forced into a high PT opportunity', () => {
    const base: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'advanced', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [],
      starting_plan: { title: 'x', rationale: 'x', activities: [activity()] },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
    };
    const result = enforceSupportLogic(base, { strengthExperience: 'advanced', barriers: ['time', 'cost'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer'), undefined);
  });
});

describe('Day 6.5 — Scenario L: time/growth budget cannot increase because historical adherence improved', () => {
  test('getWeeklyMinutesBudget takes no adherence/history input — identical activity level always yields the identical budget', () => {
    assert.equal(getWeeklyMinutesBudget('active_2_3', null), getWeeklyMinutesBudget('active_2_3', null));
    assert.equal(getWeeklyMinutesBudget('active_2_3', null), 180);
  });

  test('enforceAdaptationMagnitude caps growth regardless of how strong the success evidence is', () => {
    const previous = [activity({ day: 'Monday', duration_minutes: 40 }), activity({ day: 'Wednesday', duration_minutes: 30 }), activity({ day: 'Friday', duration_minutes: 30 })];
    // Model proposes a large jump — as if "rewarding" strong historical success with more volume.
    const proposedNext = Array.from({ length: 6 }, (_, i) => activity({ day: `Day${i}`, duration_minutes: 50 }));
    const result = enforceAdaptationMagnitude(proposedNext, previous);
    const maxSessions = Math.max(Math.ceil(3 * 1.5), 3 + 2); // = 5
    assert.ok(result.length <= maxSessions, `expected at most ${maxSessions} sessions, got ${result.length}`);
  });
});

describe('Day 6.5 — Scenario M: primary goal cannot be changed by adaptation', () => {
  test('the weekly-adaptation JSON schema has no goal/starting_point field at all — the model is never even asked for one', () => {
    const schemaProperties = WEEKLY_ADAPTATION_JSON_SCHEMA.properties as Record<string, unknown>;
    assert.equal(schemaProperties.starting_point, undefined);
    assert.equal(schemaProperties.goal, undefined);
  });

  test('buildDeterministicFallbackPlan carries starting_point forward completely unchanged', () => {
    const current: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'intermediate', available_time: '180 minutes per week', main_barriers: ['time'] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [],
      starting_plan: { title: 'x', rationale: 'x', activities: [activity()], week_start_date: '2026-06-01', week_end_date: '2026-06-07' },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
    };
    const result = buildDeterministicFallbackPlan(current, '2026-06-08', 180);
    assert.deepEqual(result.starting_point, current.starting_point);
  });
});

describe('Day 6.5 — Scenario N: preferred activity is not interpreted as disliked solely because its day performs badly', () => {
  test('preferredActivities is only ever read, never mutated, whether or not the strong-difficulty bypass fires', () => {
    const preferredActivities = ['football', 'gym'];
    const previous = [activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 })];

    preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: [],
      missedByCategory: { sport: 1 }, preferredActivities, barriers: [], weekStartDate: '2026-07-06',
      strongDifficultyDays: new Set(['saturday']), // bypass fires this time
    });
    assert.deepEqual(preferredActivities, ['football', 'gym'], 'preferredActivities must never be mutated, even when the day-difficulty bypass lets a removal stand');

    preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: [],
      missedByCategory: { sport: 1 }, preferredActivities, barriers: [], weekStartDate: '2026-07-06',
      // no bypass this time — reintroduction happens instead
    });
    assert.deepEqual(preferredActivities, ['football', 'gym'], 'preferredActivities must never be mutated when reintroduction happens either');
  });
});

describe('Day 6.5 — Scenario O: deterministic fallback remains valid with longitudinal context present', () => {
  test('buildDeterministicFallbackPlan produces a fully valid assessment regardless of any longitudinal computation happening elsewhere', () => {
    const current: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'intermediate', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [{ type: 'nutrition', relevance: 'medium', reason: 'x' }],
      starting_plan: { title: 'Week', rationale: 'x', activities: [activity({ day: 'Monday' }), activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 })], week_start_date: '2026-06-01', week_end_date: '2026-06-07' },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
      nutrition_focus: { type: 'fibre', title: 'x', reason: 'x' },
    };
    const result = buildDeterministicFallbackPlan(current, '2026-06-08', 180);
    assert.equal(validateAssessment(result), true, 'fallback output must itself be a fully valid assessment');
    assert.equal(result.generation_source, 'deterministic_fallback');
    assert.deepEqual(result.nutrition_focus, current.nutrition_focus);
    assert.deepEqual(result.support_opportunities, current.support_opportunities);
    assert.equal(result.starting_plan.week_start_date, '2026-06-08');
  });
});

describe('Day 6.5 — Scenario P: canonical planned_date survives the entire adaptation flow', () => {
  test('attachPlanDates computes an absolute planned_date for every activity, anchored to week_start_date, never to "today"', () => {
    const draft: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'x', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [],
      starting_plan: { title: 'x', rationale: 'x', activities: [activity({ day: 'Monday' }), activity({ day: 'Saturday' })] },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
    };
    const result = attachPlanDates(draft, '2026-06-08'); // a Monday
    assert.equal(result.starting_plan.activities[0].planned_date, dateForWeekdayInWeek('2026-06-08', 'Monday'));
    assert.equal(result.starting_plan.activities[0].planned_date, '2026-06-08');
    assert.equal(result.starting_plan.activities[1].planned_date, dateForWeekdayInWeek('2026-06-08', 'Saturday'));
    assert.equal(result.starting_plan.activities[1].planned_date, '2026-06-13');
  });

  test('a stale/pre-set planned_date on the input is always overwritten, never trusted', () => {
    const draft: AIAssessment = {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'x', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [],
      starting_plan: { title: 'x', rationale: 'x', activities: [activity({ day: 'Monday', planned_date: '1999-01-01' })] },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
    };
    const result = attachPlanDates(draft, '2026-06-08');
    assert.equal(result.starting_plan.activities[0].planned_date, '2026-06-08');
  });
});

// ── Coaching-memory sync, applied to the same fixture (rounds out A/C/D/G with the persisted-row layer) ──
describe('Day 6.5 — coaching_memory sync over the same fixture', () => {
  test('resolveMemorySync produces exactly one active memory per (type, subject) — no contradictory actives for the same subject', () => {
    const { plans, completions } = buildFixture();
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const { toUpsert } = resolveMemorySync(summary, []);
    const bySubject = new Map<string, Set<string>>();
    for (const row of toUpsert) {
      const axis = row.memory_type.replace(/_success$|_difficulty$/, '');
      if (!bySubject.has(row.subject)) bySubject.set(row.subject, new Set());
      bySubject.get(row.subject)!.add(axis);
    }
    // Every subject should map to memory types from a single axis family at most twice only if genuinely different axes (e.g. 'strength' could be both a category AND coincidentally... not possible here); assert no subject has BOTH a *_success and *_difficulty row simultaneously.
    for (const row of toUpsert) {
      const opposite = row.memory_type.endsWith('_success')
        ? row.memory_type.replace('_success', '_difficulty')
        : row.memory_type.endsWith('_difficulty') ? row.memory_type.replace('_difficulty', '_success') : null;
      if (opposite) {
        assert.equal(toUpsert.some(r => r.memory_type === opposite && r.subject === row.subject), false,
          `found contradictory active memories for subject "${row.subject}": ${row.memory_type} and ${opposite}`);
      }
    }
    assert.ok(toUpsert.some(r => r.memory_type === 'category_success' && r.subject === 'strength'));
    assert.ok(toUpsert.some(r => r.memory_type === 'day_difficulty' && r.subject === 'saturday'));
    assert.ok(toUpsert.some(r => r.memory_type === 'duration_success' && r.subject === 'short'));
    assert.ok(toUpsert.some(r => r.memory_type === 'duration_difficulty' && r.subject === 'long'));
    assert.equal(toUpsert.some(r => r.subject === 'sport'), false, 'ambiguous football/sport evidence must not produce any persisted memory');
  });
});

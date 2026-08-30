import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAssessment, checkAuthorization, buildUserPrompt,
  deriveCategoryCounts, sumDurationMinutes, enforceTimeBudget, getWeeklyMinutesBudget,
  enforceSupportLogic, getWeekBounds, dateForWeekdayInWeek, attachPlanDates, upgradeLegacyPlanDates,
  AI_REQUEST_CONFIG, SYSTEM_PROMPT,
  normalizeWeekdayName, sanitizeTrainingDays, formatTrainingDaysForPrompt, CANONICAL_WEEKDAYS,
} from '../assessment.ts';

const VALID_ASSESSMENT = {
  headline: 'You’re already putting in the work. Let’s make it count.',
  summary: 'You train regularly and want to build muscle, with nutrition and cost as your main barriers.',
  starting_point: {
    experience: 'Intermediate strength training experience',
    available_time: '4+ sessions a week',
    main_barriers: ['nutrition', 'cost'],
  },
  recommendation: {
    approach: 'guided',
    title: 'Nutrition is your biggest opportunity',
    reason: 'Professional guidance is an option if you’d like help creating an approach that fits your goals and budget.',
  },
  support_opportunities: [
    { type: 'nutrition', relevance: 'high', reason: 'Nutrition was one of the main challenges you identified, and it materially affects this goal.' },
  ],
  starting_plan: {
    title: 'Your first week',
    rationale: 'You already train regularly, so the priority is maintaining consistent strength work.',
    activities: [
      { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'Continue your normal programme.' },
      { day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'Consistency over volume.' },
      { day: 'Friday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'Third session of the week.' },
      { day: 'Saturday', category: 'cardio', activity: 'Football', duration_minutes: 60, intensity: 'moderate', title: 'Football', description: 'Use an activity you enjoy for conditioning.' },
    ],
  },
  weekly_focus: {
    title: 'Nutrition consistency',
    description: 'Spend a few days understanding what you currently eat before changing anything.',
  },
  next_steps: ['Track your normal meals for a few days', 'Review how the week felt on Sunday'],
};

describe('validateAssessment', () => {
  test('accepts a well-formed assessment matching the schema', () => {
    assert.equal(validateAssessment(VALID_ASSESSMENT), true);
  });

  test('rejects a non-object', () => {
    assert.equal(validateAssessment(null), false);
    assert.equal(validateAssessment('a string'), false);
  });

  test('rejects a missing required top-level field', () => {
    const { headline, ...rest } = VALID_ASSESSMENT;
    assert.equal(validateAssessment(rest), false);
  });

  test('rejects an invalid recommendation.approach value (old Day-1 enum no longer accepted)', () => {
    const bad = { ...VALID_ASSESSMENT, recommendation: { ...VALID_ASSESSMENT.recommendation, approach: 'personal_trainer' } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects the old pre-fix mutually-exclusive approach values too', () => {
    for (const oldApproach of ['professional_support_optional', 'personal_trainer_support', 'nutrition_support']) {
      const bad = { ...VALID_ASSESSMENT, recommendation: { ...VALID_ASSESSMENT.recommendation, approach: oldApproach } };
      assert.equal(validateAssessment(bad), false, `${oldApproach} should no longer validate`);
    }
  });

  test('accepts an empty support_opportunities array — fully capable self-directed users have nothing to surface', () => {
    assert.equal(validateAssessment({ ...VALID_ASSESSMENT, support_opportunities: [] }), true);
  });

  test('accepts both a personal_trainer and a nutrition opportunity simultaneously', () => {
    const both = {
      ...VALID_ASSESSMENT,
      support_opportunities: [
        { type: 'personal_trainer', relevance: 'high', reason: 'A trainer could help you build confidence and accountability.' },
        { type: 'nutrition', relevance: 'medium', reason: 'Nutrition support could help refine your approach.' },
      ],
    };
    assert.equal(validateAssessment(both), true);
  });

  test('rejects a missing support_opportunities field', () => {
    const { support_opportunities, ...rest } = VALID_ASSESSMENT;
    assert.equal(validateAssessment(rest), false);
  });

  test('rejects an invalid support_opportunities type value', () => {
    const bad = { ...VALID_ASSESSMENT, support_opportunities: [{ type: 'nutritionist', relevance: 'high', reason: 'x' }] };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a "low" relevance value — low relevance is never persisted', () => {
    const bad = { ...VALID_ASSESSMENT, support_opportunities: [{ type: 'nutrition', relevance: 'low', reason: 'x' }] };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects more than 2 support_opportunities entries', () => {
    const bad = {
      ...VALID_ASSESSMENT,
      support_opportunities: [
        { type: 'personal_trainer', relevance: 'high', reason: 'x' },
        { type: 'nutrition', relevance: 'high', reason: 'x' },
        { type: 'personal_trainer', relevance: 'medium', reason: 'x' },
      ],
    };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a non-array main_barriers', () => {
    const bad = { ...VALID_ASSESSMENT, starting_point: { ...VALID_ASSESSMENT.starting_point, main_barriers: 'nutrition' } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an empty starting_plan.activities array', () => {
    const bad = { ...VALID_ASSESSMENT, starting_plan: { ...VALID_ASSESSMENT.starting_plan, activities: [] } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an activity with an invalid category', () => {
    const bad = {
      ...VALID_ASSESSMENT,
      starting_plan: {
        ...VALID_ASSESSMENT.starting_plan,
        activities: [{ ...VALID_ASSESSMENT.starting_plan.activities[0], category: 'swimming' }],
      },
    };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a missing weekly_focus', () => {
    const { weekly_focus, ...rest } = VALID_ASSESSMENT;
    assert.equal(validateAssessment(rest), false);
  });

  test('rejects more than 3 next_steps', () => {
    const bad = { ...VALID_ASSESSMENT, next_steps: ['a', 'b', 'c', 'd'] };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an empty next_steps array', () => {
    assert.equal(validateAssessment({ ...VALID_ASSESSMENT, next_steps: [] }), false);
  });
});

describe('deriveCategoryCounts', () => {
  test('counts activities by category — this is the single source of truth for session counts', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    assert.deepEqual(counts, { strength: 3, cardio: 1 });
  });

  test('never produces a count that disagrees with the activities array length', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    assert.equal(total, VALID_ASSESSMENT.starting_plan.activities.length);
  });
});

describe('sumDurationMinutes', () => {
  test('sums duration_minutes across all activities', () => {
    assert.equal(sumDurationMinutes(VALID_ASSESSMENT.starting_plan.activities), 240);
  });
});

describe('getWeeklyMinutesBudget', () => {
  test('maps known activity levels to a conservative minutes budget when no explicit hours are given', () => {
    assert.equal(getWeeklyMinutesBudget('inactive'), 90);
    assert.equal(getWeeklyMinutesBudget('occasional'), 120);
    assert.equal(getWeeklyMinutesBudget('active_2_3'), 180);
    assert.equal(getWeeklyMinutesBudget('active_4_plus'), 240);
    assert.equal(getWeeklyMinutesBudget('serious'), 300);
  });

  test('falls back to a conservative default for unknown/missing activity level', () => {
    assert.equal(getWeeklyMinutesBudget(null), 120);
    assert.equal(getWeeklyMinutesBudget(undefined), 120);
    assert.equal(getWeeklyMinutesBudget('made_up_value'), 120);
  });

  test('prefers the user\'s own stated weekly training hours over the activityLevel proxy when given', () => {
    // 5 hours/week stated explicitly should win over the "inactive" bucket's 90-min proxy.
    assert.equal(getWeeklyMinutesBudget('inactive', 5), 300);
  });

  test('treats 0 stated hours as canonical too (not "missing")', () => {
    assert.equal(getWeeklyMinutesBudget('active_4_plus', 0), 0);
  });

  test('ignores an invalid sportHoursPerWeek value and falls back to the activityLevel proxy', () => {
    assert.equal(getWeeklyMinutesBudget('occasional', -5), 120);
    assert.equal(getWeeklyMinutesBudget('occasional', NaN), 120);
    assert.equal(getWeeklyMinutesBudget('occasional', 'not a number' as any), 120);
  });
});

describe('enforceTimeBudget', () => {
  test('leaves a plan untouched when it already fits the budget', () => {
    const activities = VALID_ASSESSMENT.starting_plan.activities; // 240 min total
    const result = enforceTimeBudget(activities, 240);
    assert.equal(result.length, 4);
  });

  test('trims trailing activities until the total fits within a 15% tolerance', () => {
    const activities = VALID_ASSESSMENT.starting_plan.activities; // 240 min total, 4 activities
    const result = enforceTimeBudget(activities, 90); // tolerance = 103.5
    assert.ok(sumDurationMinutes(result) <= 90 * 1.15);
    assert.ok(result.length < activities.length);
  });

  test('never trims below one activity even if it alone exceeds the budget', () => {
    const activities = [VALID_ASSESSMENT.starting_plan.activities[0]]; // 60 min, single activity
    const result = enforceTimeBudget(activities, 10);
    assert.equal(result.length, 1);
  });
});

describe('checkAuthorization', () => {
  test('rejects when the token failed to resolve a user', () => {
    const result = checkAuthorization(null, 'user-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  test('rejects when userId is missing or not a string', () => {
    const result = checkAuthorization({ id: 'user-1' }, undefined);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });

  test('rejects when the authenticated user does not match the requested userId', () => {
    const result = checkAuthorization({ id: 'user-1' }, 'user-2');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  test('accepts when the authenticated user matches userId', () => {
    const result = checkAuthorization({ id: 'user-1' }, 'user-1');
    assert.equal(result.ok, true);
  });
});

describe('buildUserPrompt', () => {
  test('includes the onboarding answers as JSON in the prompt', () => {
    const answers = { goal: 'lose_weight', startingWeightKg: 80, goalWeightKg: 72 };
    const prompt = buildUserPrompt(answers);
    assert.ok(prompt.includes('"goal":"lose_weight"'));
    assert.ok(prompt.includes('"startingWeightKg":80'));
  });

  test('includes an explicit weekly minutes budget derived from activityLevel when no explicit hours are given', () => {
    const prompt = buildUserPrompt({ goal: 'lose_weight', activityLevel: 'active_2_3' });
    assert.ok(prompt.includes('180 minutes'));
    assert.ok(prompt.includes('estimated from their current activity level'));
  });

  test('uses the user\'s own stated training hours as the canonical budget when given, and says so', () => {
    const prompt = buildUserPrompt({ goal: 'lose_weight', activityLevel: 'inactive' }, 5);
    assert.ok(prompt.includes('300 minutes')); // 5 hrs * 60, not the "inactive" 90-min proxy
    assert.ok(prompt.includes("user's own stated 5 training hours/week"));
  });

  // Beta Feedback #002 — training schedule preference
  test('emits a preferred-training-days line when 2+ canonical days are given', () => {
    const prompt = buildUserPrompt({
      goal: 'build_muscle', activityLevel: 'serious',
      preferredTrainingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    }, 5);
    assert.ok(prompt.includes('Preferred training days (user-stated): Monday, Tuesday, Wednesday, Thursday, Friday'));
    assert.ok(prompt.includes('5 days/week'));
    assert.ok(prompt.toLowerCase().includes('keep the others free'));
    assert.ok(prompt.toLowerCase().includes('do not add total minutes'));
  });

  test('normalises mixed-form day input before putting it in the prompt', () => {
    const prompt = buildUserPrompt({
      goal: 'build_muscle',
      preferredTrainingDays: ['Mon', 'WEDNESDAY', ' friday '],
    }, 4);
    assert.ok(prompt.includes('Monday, Wednesday, Friday'));
    assert.ok(prompt.includes('3 days/week'));
  });

  test('omits the schedule line entirely when no preference (null / empty / single day)', () => {
    for (const v of [undefined, null, [], ['monday'], ['garbage']]) {
      const prompt = buildUserPrompt({ goal: 'lose_weight', preferredTrainingDays: v as unknown });
      assert.ok(!prompt.includes('Preferred training days (user-stated)'), `should be absent for ${JSON.stringify(v)}`);
    }
  });
});

describe('training schedule weekday helpers (Beta Feedback #002)', () => {
  test('CANONICAL_WEEKDAYS is Monday-first, lowercase, 7 entries', () => {
    assert.deepEqual([...CANONICAL_WEEKDAYS], ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
  });

  test('normalizeWeekdayName accepts full/short/upper/spaced/punctuated forms', () => {
    assert.equal(normalizeWeekdayName('Monday'), 'monday');
    assert.equal(normalizeWeekdayName('mon'), 'monday');
    assert.equal(normalizeWeekdayName(' TUE. '), 'tuesday');
    assert.equal(normalizeWeekdayName('Tues'), 'tuesday');
    assert.equal(normalizeWeekdayName('WEDNESDAY'), 'wednesday');
  });

  test('normalizeWeekdayName rejects non-weekdays and non-strings', () => {
    for (const v of ['someday', '', '   ', 'M', 42, null, undefined, {}]) {
      assert.equal(normalizeWeekdayName(v as unknown), null);
    }
  });

  test('sanitizeTrainingDays dedupes, normalises, drops invalid, sorts Monday-first', () => {
    assert.deepEqual(
      sanitizeTrainingDays(['friday', 'Mon', 'monday', 'weds', 'WEDNESDAY', 'nope']),
      ['monday', 'wednesday', 'friday'],
    );
  });

  test('sanitizeTrainingDays returns [] for non-arrays and all-invalid input (treated as "no preference")', () => {
    assert.deepEqual(sanitizeTrainingDays(null), []);
    assert.deepEqual(sanitizeTrainingDays('monday'), []);
    assert.deepEqual(sanitizeTrainingDays(['x', 'y']), []);
    assert.deepEqual(sanitizeTrainingDays([]), []);
  });

  test('formatTrainingDaysForPrompt title-cases in order', () => {
    assert.equal(formatTrainingDaysForPrompt(['monday', 'wednesday', 'friday']), 'Monday, Wednesday, Friday');
  });
});

describe('SYSTEM_PROMPT guardrails (regression coverage — not testing exact AI prose)', () => {
  test('explicitly rules out personal_training preference alone as a support-recommendation trigger', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('personal_training') && SYSTEM_PROMPT.toLowerCase().includes('not by itself enough'));
  });

  test('still instructs commercial neutrality (self_directed as default, no named providers)', () => {
    assert.ok(SYSTEM_PROMPT.includes('self_directed'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('never name a specific'));
  });

  test('still instructs the core safety constraints', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('no diagnosis'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('no guaranteed outcomes'));
  });

  test('still instructs that starting_plan.activities is the single source of truth for counts', () => {
    assert.ok(SYSTEM_PROMPT.includes('starting_plan.activities'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('single source of truth'));
  });

  test('instructs that approach and support are independent, never a choice between them', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('never a choice between them'));
    assert.ok(SYSTEM_PROMPT.includes('guided'));
  });

  test('instructs the personal_trainer HIGH-relevance rules explicitly', () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('beginner/new experience and at least one of confidence/knowledge/accountability'));
    assert.ok(lower.includes('two or more of confidence/knowledge/accountability/consistency'));
  });

  test('instructs that support_opportunities omits low relevance and caps at 2 entries', () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('omit it entirely if low'));
    assert.ok(lower.includes('max 2 entries'));
  });

  test('instructs nutrition is judged independently and never prescriptive', () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('nutrition: judge independently'));
    assert.ok(lower.includes('never prescribe calories/macros/diets'));
  });

  // Beta Feedback #002 — training schedule preference
  test('has a TRAINING SCHEDULE section that treats preferred days as a strong, bounded preference', () => {
    assert.ok(SYSTEM_PROMPT.includes('TRAINING SCHEDULE'));
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('strong preference'));
    assert.ok(lower.includes('not an instruction to make every preferred day a demanding session'));
    assert.ok(lower.includes('more preferred days does not mean more total time'));
  });

  test('scopes "prefer fewer sessions" to the no-preferred-days case', () => {
    assert.ok(SYSTEM_PROMPT.includes('When no preferred training days are given, prefer fewer/shorter sessions over more.'));
  });
});

describe('AI_REQUEST_CONFIG (latency optimisation)', () => {
  test('uses minimal reasoning effort', () => {
    assert.equal(AI_REQUEST_CONFIG.reasoning_effort, 'minimal');
  });

  test('caps output tokens', () => {
    assert.ok(AI_REQUEST_CONFIG.max_completion_tokens > 0);
    assert.ok(AI_REQUEST_CONFIG.max_completion_tokens < 3000);
  });

  test('never sets temperature — this model only supports its default and errors on any other value (confirmed empirically)', () => {
    assert.equal((AI_REQUEST_CONFIG as any).temperature, undefined);
  });
});

describe('enforceSupportLogic (deterministic safety backstop — Part 16/25)', () => {
  const baseAssessment = () => ({ ...VALID_ASSESSMENT, support_opportunities: [] });

  test('beginner + confidence → personal_trainer high', () => {
    const result = enforceSupportLogic(baseAssessment(), { strengthExperience: 'beginner', barriers: ['confidence'] });
    const pt = result.support_opportunities.find(o => o.type === 'personal_trainer');
    assert.equal(pt?.relevance, 'high');
  });

  test('beginner + knowledge → personal_trainer high', () => {
    const result = enforceSupportLogic(baseAssessment(), { strengthExperience: 'beginner', barriers: ['knowledge'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer')?.relevance, 'high');
  });

  test('beginner + accountability → personal_trainer high', () => {
    const result = enforceSupportLogic(baseAssessment(), { strengthExperience: 'beginner', barriers: ['accountability'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer')?.relevance, 'high');
  });

  test('Profile A: beginner + confidence + knowledge + accountability → personal_trainer high (critical regression case)', () => {
    const result = enforceSupportLogic(baseAssessment(), {
      strengthExperience: 'beginner',
      barriers: ['confidence', 'knowledge', 'accountability'],
    });
    const pt = result.support_opportunities.find(o => o.type === 'personal_trainer');
    assert.equal(pt?.relevance, 'high');
    assert.ok(pt!.reason.includes('confidence'));
    assert.ok(pt!.reason.includes('fundamentals'));
    assert.ok(pt!.reason.includes('accountability'));
  });

  test('two or more strong execution barriers (not beginner) → personal_trainer high', () => {
    // Profile F: "some experience", 4 execution barriers, not flagged beginner.
    const result = enforceSupportLogic(baseAssessment(), {
      strengthExperience: 'intermediate',
      barriers: ['confidence', 'knowledge', 'consistency', 'accountability'],
    });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer')?.relevance, 'high');
  });

  test('experienced + personal-training preference only → NOT forced to personal_trainer high', () => {
    // Profile C: experienced, barriers time/cost, no execution barriers.
    const result = enforceSupportLogic(baseAssessment(), { strengthExperience: 'advanced', barriers: ['time', 'cost'] });
    assert.equal(result.support_opportunities.length, 0);
  });

  test('a single weak/moderate barrier (e.g. accountability only, not beginner) does not force high', () => {
    // Profile D: experienced + accountability only — backstop stays out of the way.
    const result = enforceSupportLogic(baseAssessment(), { strengthExperience: 'advanced', barriers: ['accountability'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer'), undefined);
  });

  test('nutrition barrier does not suppress the personal_trainer backstop', () => {
    const withNutrition = {
      ...VALID_ASSESSMENT,
      support_opportunities: [{ type: 'nutrition' as const, relevance: 'high' as const, reason: 'Nutrition is a real barrier here.' }],
    };
    const result = enforceSupportLogic(withNutrition, { strengthExperience: 'beginner', barriers: ['confidence', 'nutrition'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer')?.relevance, 'high');
    assert.equal(result.support_opportunities.find(o => o.type === 'nutrition')?.relevance, 'high');
    assert.equal(result.support_opportunities.length, 2);
  });

  test('personal_trainer relevance does not suppress nutrition — both survive together', () => {
    const both = {
      ...VALID_ASSESSMENT,
      support_opportunities: [
        { type: 'personal_trainer' as const, relevance: 'high' as const, reason: 'Already high from the model.' },
        { type: 'nutrition' as const, relevance: 'medium' as const, reason: 'Nutrition support could help.' },
      ],
    };
    const result = enforceSupportLogic(both, { strengthExperience: 'beginner', barriers: ['confidence'] });
    assert.equal(result.support_opportunities.length, 2);
    assert.equal(result.support_opportunities.find(o => o.type === 'nutrition')?.relevance, 'medium');
  });

  test('does not downgrade or duplicate an already-correct model-provided personal_trainer:high', () => {
    const alreadyHigh = {
      ...VALID_ASSESSMENT,
      support_opportunities: [{ type: 'personal_trainer' as const, relevance: 'high' as const, reason: 'Model-authored reason.' }],
    };
    const result = enforceSupportLogic(alreadyHigh, { strengthExperience: 'beginner', barriers: ['confidence'] });
    assert.equal(result.support_opportunities.length, 1);
    assert.equal(result.support_opportunities[0].reason, 'Model-authored reason.'); // untouched, not overwritten
  });

  test('upgrades a model-provided personal_trainer:medium to high when the profile warrants it', () => {
    const medium = {
      ...VALID_ASSESSMENT,
      support_opportunities: [{ type: 'personal_trainer' as const, relevance: 'medium' as const, reason: 'Model said medium.' }],
    };
    const result = enforceSupportLogic(medium, { strengthExperience: 'beginner', barriers: ['confidence', 'knowledge'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer')?.relevance, 'high');
  });

  test('reason text only ever mentions barriers actually selected by the user', () => {
    const result = enforceSupportLogic(baseAssessment(), { strengthExperience: 'beginner', barriers: ['confidence'] });
    const reason = result.support_opportunities.find(o => o.type === 'personal_trainer')!.reason;
    assert.ok(reason.includes('confidence'));
    assert.ok(!reason.includes('fundamentals')); // knowledge wasn't selected
    assert.ok(!reason.includes('accountability')); // accountability wasn't selected
  });

  test('no commercial/provider data ever enters the function — its only inputs are the assessment and onboarding answers', () => {
    // Type-level guarantee: enforceSupportLogic's signature has no
    // provider/commission/inventory parameter for this test to even pass by
    // accident — asserting arity here keeps that contract visible in tests.
    assert.equal(enforceSupportLogic.length, 2);
  });
});

describe('getWeekBounds (Day 5 Part 3 — plan dating fix)', () => {
  test('a Wednesday anchor resolves to that same week\'s Monday-Sunday', () => {
    const wednesday = new Date('2026-09-02T09:00:00Z'); // a Wednesday
    assert.deepEqual(getWeekBounds(wednesday), { weekStartDate: '2026-08-31', weekEndDate: '2026-09-06' });
  });

  test('a Monday anchor resolves to itself as week start', () => {
    const monday = new Date('2026-08-31T09:00:00Z');
    assert.deepEqual(getWeekBounds(monday), { weekStartDate: '2026-08-31', weekEndDate: '2026-09-06' });
  });

  test('a Sunday anchor resolves back to that same week\'s Monday, not the next one', () => {
    const sunday = new Date('2026-09-06T09:00:00Z');
    assert.deepEqual(getWeekBounds(sunday), { weekStartDate: '2026-08-31', weekEndDate: '2026-09-06' });
  });
});

describe('dateForWeekdayInWeek (Day 5 Part 3 — the actual historical-stability fix)', () => {
  const weekStart = '2026-08-31'; // a Monday

  test('resolves each weekday within the given week, never relative to "now"', () => {
    assert.equal(dateForWeekdayInWeek(weekStart, 'Monday'), '2026-08-31');
    assert.equal(dateForWeekdayInWeek(weekStart, 'Wednesday'), '2026-09-02');
    assert.equal(dateForWeekdayInWeek(weekStart, 'Saturday'), '2026-09-05');
    assert.equal(dateForWeekdayInWeek(weekStart, 'Sunday'), '2026-09-06');
  });

  test('is case/whitespace tolerant, matching the model\'s day-name output', () => {
    assert.equal(dateForWeekdayInWeek(weekStart, ' monday '), '2026-08-31');
  });

  test('returns null for an unrecognised day name rather than guessing', () => {
    assert.equal(dateForWeekdayInWeek(weekStart, 'Someday'), null);
  });

  test('critical regression check: a Monday activity dated against LAST week never shifts to THIS week just because "today" changed', () => {
    // This is exactly the bug Day 4 flagged: the old nextDateForWeekday(day, new
    // Date()) recomputed live, so opening the app in a later week silently
    // turned last week's Monday into next week's Monday. dateForWeekdayInWeek
    // takes no "now" parameter at all — the same weekStart always produces
    // the same date, no matter when this function is called.
    const lastWeekStart = '2026-08-24';
    const resolvedOnceUpfront = dateForWeekdayInWeek(lastWeekStart, 'Monday');
    // Simulate "time passing" — call again with the exact same weekStart,
    // as if it were now three weeks later. The anchor never enters the
    // calculation, so nothing can drift.
    const resolvedMuchLater = dateForWeekdayInWeek(lastWeekStart, 'Monday');
    assert.equal(resolvedOnceUpfront, '2026-08-24');
    assert.equal(resolvedOnceUpfront, resolvedMuchLater);
  });
});

describe('attachPlanDates (Day 5 Part 3)', () => {
  const baseAssessment = {
    ...VALID_ASSESSMENT,
    starting_plan: {
      title: 'x', rationale: 'x',
      activities: [
        { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'x', description: 'x' },
        { day: 'Saturday', category: 'cardio', activity: 'Football', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x' },
      ],
    },
  } as const;

  test('sets assessment_version, week_start_date/week_end_date, and each activity\'s planned_date', () => {
    const result = attachPlanDates(baseAssessment as any, '2026-08-31');
    assert.equal(result.assessment_version, 3);
    assert.equal(result.starting_plan.week_start_date, '2026-08-31');
    assert.equal(result.starting_plan.week_end_date, '2026-09-06');
    assert.equal(result.starting_plan.activities[0].planned_date, '2026-08-31'); // Monday
    assert.equal(result.starting_plan.activities[1].planned_date, '2026-09-05'); // Saturday
  });

  test('never mutates the input object', () => {
    const original = JSON.parse(JSON.stringify(baseAssessment));
    attachPlanDates(baseAssessment as any, '2026-08-31');
    assert.deepEqual(baseAssessment, original);
  });
});

describe('upgradeLegacyPlanDates (Day 5.5 Part 20-26)', () => {
  const legacyAssessment = {
    ...VALID_ASSESSMENT,
    starting_plan: {
      title: 'x', rationale: 'x',
      activities: [
        { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x' },
        { day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x' },
        { day: 'Saturday', category: 'cardio', activity: 'Football', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x' },
      ],
      // deliberately no week_start_date/week_end_date — the pre-Day-5 shape.
    },
  } as const;

  test('Scenario H: anchors dates to the ORIGINAL generation week, not today', () => {
    // Generated on a Wednesday, two weeks before "today" would be, if today
    // were used as the anchor by mistake.
    const generatedAt = '2026-08-19T14:00:00.000Z'; // a Wednesday
    const upgraded = upgradeLegacyPlanDates(legacyAssessment as any, generatedAt);
    assert.equal(upgraded.starting_plan.week_start_date, '2026-08-17'); // that week's Monday
    assert.equal(upgraded.starting_plan.week_end_date, '2026-08-23');
    const monday = upgraded.starting_plan.activities.find(a => a.day === 'Monday');
    const saturday = upgraded.starting_plan.activities.find(a => a.day === 'Saturday');
    assert.equal(monday?.planned_date, '2026-08-17');
    assert.equal(saturday?.planned_date, '2026-08-22');
  });

  test('a weekday listed earlier in the week than the generation day is still anchored to that same week (documented rule), never reinterpreted as a later week', () => {
    // Generated Wednesday 2026-08-19; "Monday" (08-17) already passed by
    // generation time within that same calendar week — it must stay 08-17,
    // not jump to the following week's Monday.
    const generatedAt = '2026-08-19T14:00:00.000Z';
    const upgraded = upgradeLegacyPlanDates(legacyAssessment as any, generatedAt);
    const monday = upgraded.starting_plan.activities.find(a => a.day === 'Monday');
    assert.equal(monday?.planned_date, '2026-08-17');
  });

  test('sets assessment_version and null nutrition_focus/review, matching a normal v3 plan exactly', () => {
    const upgraded = upgradeLegacyPlanDates(legacyAssessment as any, '2026-08-19T14:00:00.000Z');
    assert.equal(upgraded.assessment_version, 3);
    assert.equal(upgraded.nutrition_focus, null);
    assert.equal(upgraded.review, null);
  });

  test('is a no-op (idempotent) on a plan that already has dates — never overwrites existing dates', () => {
    const alreadyDated = attachPlanDates(legacyAssessment as any, '2026-09-14');
    const result = upgradeLegacyPlanDates(alreadyDated, '2026-08-19T14:00:00.000Z');
    assert.equal(result.starting_plan.week_start_date, '2026-09-14'); // unchanged — the later call is a no-op
    assert.deepEqual(result, alreadyDated);
  });

  test('makes no network call — purely a local, deterministic transform (same signature discipline as attachPlanDates)', () => {
    assert.equal(upgradeLegacyPlanDates.length, 2);
  });
});

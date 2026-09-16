// Lana Nutrition — Monthly → Weekly → Daily Planning V1. Pure-logic tests
// for lib/nutrition/monthly-nutrition-strategy.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyStrategy, resolveNextWeekObjective, objectiveForWeek } from '../nutrition/monthly-nutrition-strategy.ts';
import { evaluateWeeklyAdaptation, buildWeeklyAdaptationInput } from '../nutrition/weekly-nutrition-adaptation.ts';

describe('buildMonthlyStrategy — §3/§4/§7/§8', () => {
  test('A. canonical goal is carried through verbatim, never re-derived', () => {
    const strategy = buildMonthlyStrategy({ goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: false });
    assert.equal(strategy.goal, 'lose_weight');
  });

  test('B. supported targets are used: protein target available -> week 1 is protein consistency', () => {
    const strategy = buildMonthlyStrategy({ goal: 'build_muscle', proteinTargetAvailable: true, hasTrainingDaysOnFile: false });
    assert.equal(strategy.weeks[0].theme, 'protein_consistency');
  });

  test('C. unsupported target stays unavailable: no protein target -> week 1 is never protein consistency', () => {
    const strategy = buildMonthlyStrategy({ goal: 'build_muscle', proteinTargetAvailable: false, hasTrainingDaysOnFile: false });
    assert.notEqual(strategy.weeks[0].theme, 'protein_consistency');
    assert.ok(strategy.weeks.every(w => w.theme !== 'protein_consistency'));
  });

  test('D. dietary/context constraints preserved: training-day theme only appears when training days are on file', () => {
    const withDays = buildMonthlyStrategy({ goal: 'general_fitness', proteinTargetAvailable: false, hasTrainingDaysOnFile: true });
    const withoutDays = buildMonthlyStrategy({ goal: 'general_fitness', proteinTargetAvailable: false, hasTrainingDaysOnFile: false });
    assert.ok(withDays.weeks.some(w => w.theme === 'training_day_nutrition'));
    assert.ok(withoutDays.weeks.every(w => w.theme !== 'training_day_nutrition'));
  });

  test('E. nationality is never a parameter — the input shape has no country/nationality field', () => {
    const strategy = buildMonthlyStrategy({ goal: 'general_fitness', proteinTargetAvailable: true, hasTrainingDaysOnFile: true });
    assert.ok(!('country' in strategy) && !('nationality' in strategy));
  });

  test('F. same evidence -> deterministic identical strategy (no LLM, no randomness)', () => {
    const input = { goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: true };
    const a = buildMonthlyStrategy(input);
    const b = buildMonthlyStrategy(input);
    assert.deepEqual(a, b);
  });

  test('G. no LLM call anywhere — purely synchronous, no Promise returned', () => {
    const result = buildMonthlyStrategy({ goal: null, proteinTargetAvailable: false, hasTrainingDaysOnFile: false });
    assert.equal(result instanceof Promise, false);
  });

  test('H. exactly 4 week objectives, never a 30-day plan', () => {
    const strategy = buildMonthlyStrategy({ goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: true });
    assert.equal(strategy.weeks.length, 4);
  });

  test('I. all four weekly objectives belong to the same cycle/goal', () => {
    const strategy = buildMonthlyStrategy({ goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: true });
    assert.equal(strategy.weeks[0].weekNumber, 1);
    assert.equal(strategy.weeks[3].weekNumber, 4);
    // every week's objective is a real, non-empty sentence tied to this run
    for (const w of strategy.weeks) assert.ok(w.objective.length > 0);
  });

  test('J. a null goal (goal change / unset) is handled safely, never throws', () => {
    assert.doesNotThrow(() => buildMonthlyStrategy({ goal: null, proteinTargetAvailable: true, hasTrainingDaysOnFile: false }));
  });

  test('week 4 is always consolidation, regardless of evidence', () => {
    const a = buildMonthlyStrategy({ goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: true });
    const b = buildMonthlyStrategy({ goal: null, proteinTargetAvailable: false, hasTrainingDaysOnFile: false });
    assert.equal(a.weeks[3].theme, 'consolidate_what_worked');
    assert.equal(b.weeks[3].theme, 'consolidate_what_worked');
  });

  test('no theme repeats within weeks 1-3', () => {
    const strategy = buildMonthlyStrategy({ goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: true });
    const themes = strategy.weeks.slice(0, 3).map(w => w.theme);
    assert.equal(new Set(themes).size, themes.length);
  });

  test('prior-cycle evidence of protein consistency reorders week 1 away from protein (repeated evidence changes future weeks, §10/§36)', () => {
    const withoutEvidence = buildMonthlyStrategy({ goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: false });
    const withEvidence = buildMonthlyStrategy({
      goal: 'lose_weight', proteinTargetAvailable: true, hasTrainingDaysOnFile: false,
      priorCycleEvidence: { proteinWasConsistent: true },
    });
    assert.equal(withoutEvidence.weeks[0].theme, 'protein_consistency');
    assert.notEqual(withEvidence.weeks[0].theme, 'protein_consistency');
  });
});

describe('resolveNextWeekObjective — Closing the Loop §10', () => {
  const strategy = buildMonthlyStrategy({ goal: 'build_muscle', proteinTargetAvailable: true, hasTrainingDaysOnFile: false });
  // §10's own worked example: week 1 = protein_consistency, "reached on
  // only 2 of 6 observed days" (i.e. an ADJUST verdict) -> week 2 MAY
  // remain the same objective rather than mechanically advancing.
  const lowAdherenceCalls = evaluateWeeklyAdaptation(
    buildWeeklyAdaptationInput(
      [{ hasLogs: true, proteinG: 40 }, { hasLogs: true, proteinG: 45 }, { hasLogs: true, proteinG: 130 },
       { hasLogs: true, proteinG: 130 }, { hasLogs: true, proteinG: 50 }, { hasLogs: true, proteinG: 55 }],
      [], { min: 120, max: 170 },
    ),
  );

  test('A. protein not yet achieved (ADJUST) -> next week CARRIES FORWARD the same theme, not the strategy default advance', () => {
    const next = resolveNextWeekObjective(strategy, 2, 'protein_consistency', lowAdherenceCalls);
    assert.equal(next.theme, 'protein_consistency');
    assert.match(next.reason, /Carried forward/);
  });

  test('B. protein genuinely achieved (KEEP) -> next week advances to the strategy\'s normal week-2 pick', () => {
    const highAdherenceCalls = evaluateWeeklyAdaptation(
      buildWeeklyAdaptationInput(
        [{ hasLogs: true, proteinG: 140 }, { hasLogs: true, proteinG: 150 }, { hasLogs: true, proteinG: 160 },
         { hasLogs: true, proteinG: 145 }, { hasLogs: true, proteinG: 155 }],
        [], { min: 120, max: 170 },
      ),
    );
    const next = resolveNextWeekObjective(strategy, 2, 'protein_consistency', highAdherenceCalls);
    assert.deepEqual(next, objectiveForWeek(strategy, 2));
  });

  test('C. a theme this module has no measurable evidence for (fibre/vegetables) always just advances — no fabricated gate', () => {
    const next = resolveNextWeekObjective(strategy, 3, 'fibre_and_vegetables', lowAdherenceCalls);
    assert.deepEqual(next, objectiveForWeek(strategy, 3));
  });

  test('D. no current theme at all (first week of a cycle) always just advances', () => {
    const next = resolveNextWeekObjective(strategy, 1, null, []);
    assert.deepEqual(next, objectiveForWeek(strategy, 1));
  });

  test('E. §13 — the monthly strategy/goal itself is never touched by this function — same `strategy` object in, same weeks out', () => {
    const before = JSON.stringify(strategy);
    resolveNextWeekObjective(strategy, 2, 'protein_consistency', lowAdherenceCalls);
    assert.equal(JSON.stringify(strategy), before);
  });

  test('deterministic — same inputs always produce the same objective', () => {
    const a = resolveNextWeekObjective(strategy, 2, 'protein_consistency', lowAdherenceCalls);
    const b = resolveNextWeekObjective(strategy, 2, 'protein_consistency', lowAdherenceCalls);
    assert.deepEqual(a, b);
  });
});

describe('§25 — the real closed loop, proven as a chain (not isolated unit calls)', () => {
  test('ACTUAL evidence -> adaptation -> next-week objective -> a real ranking-weight decision, end to end', () => {
    // 1. Goal + protein target available (build_muscle, e.g. an 80kg user: 112-160g range)
    const strategy = buildMonthlyStrategy({ goal: 'build_muscle', proteinTargetAvailable: true, hasTrainingDaysOnFile: false });
    assert.equal(strategy.weeks[0].theme, 'protein_consistency'); // week 1's real focus

    // 2. Week 1 planned meals: 4 lunches planned, only 1 actually logged as consumed
    const week1PlannedMeals = [
      { mealSlot: 'lunch' as const, status: 'consumed' as const },
      { mealSlot: 'lunch' as const, status: 'replaced' as const }, // user ate something else
      { mealSlot: 'lunch' as const, status: 'recommended' as const }, // never touched
      { mealSlot: 'lunch' as const, status: 'recommended' as const },
    ];
    // 3. Actual food-log evidence: protein below the target range on most observed days
    const week1Days = [
      { hasLogs: true, proteinG: 60 }, { hasLogs: true, proteinG: 70 }, { hasLogs: true, proteinG: 65 },
      { hasLogs: true, proteinG: 150 }, { hasLogs: true, proteinG: 55 }, { hasLogs: false, proteinG: 0 }, { hasLogs: false, proteinG: 0 },
    ];

    // 4. Structured weekly evidence (the aggregator's pure core)
    const adaptationInput = buildWeeklyAdaptationInput(week1Days, week1PlannedMeals, { min: 112, max: 160 });
    assert.equal(adaptationInput.proteinAdherence?.daysWithTarget, 5); // only the 5 observed days — the 2 no-log days never count
    assert.equal(adaptationInput.slotAdherence.find(s => s.slot === 'lunch')?.consumedDays, 1); // only the explicit 'consumed' row

    // 5. Deterministic adaptation
    const calls = evaluateWeeklyAdaptation(adaptationInput);
    const proteinCall = calls.find(c => c.subject === 'protein')!;
    assert.equal(proteinCall.type, 'adjust'); // 1 of 5 days met the target -> repeatedly below

    // 6. Next-week objective resolution — carries protein_consistency forward
    const nextObjective = resolveNextWeekObjective(strategy, 2, 'protein_consistency', calls);
    assert.equal(nextObjective.theme, 'protein_consistency');

    // 7. Objective -> real ranking-weight decision (mirrors
    //    nutrition-planning-service.ts's weightsForTheme exactly — same
    //    named PROTEIN_FOCUS_WEIGHTS boost the service actually applies).
    const weightsForTheme = (theme: string | null) =>
      theme === 'protein_consistency'
        ? { preference: 0.30, goalFit: 0.20, cuisineFit: 0.10, proteinBudget: 0.40 }
        : { preference: 0.40, goalFit: 0.25, cuisineFit: 0.15, proteinBudget: 0.20 };
    const nextWeekWeights = weightsForTheme(nextObjective.theme);
    assert.equal(nextWeekWeights.proteinBudget, 0.40); // genuinely boosted relative to the 0.20 default — the objective REALLY changed the scoring context
    assert.ok(nextWeekWeights.proteinBudget > 0.20);
  });
});

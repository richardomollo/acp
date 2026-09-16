// Lana Nutrition — Monthly → Weekly → Daily Planning V1. The monthly
// STRATEGY layer (product spec §3/§4/§7/§8).
//
// A "month" here is a rolling 4-week cycle (§6) — never assumed to equal a
// calendar month. This module does NOT generate 30 rigid days of meals
// (§3/§30); it produces four week-level OBJECTIVES from deterministic
// evidence, never an LLM. The set of possible objective sentences is fixed
// and reviewable (like every other fixed-copy mapping in this codebase —
// e.g. today-nutrition.tsx's REASON_TEXT); WHICH one is picked for which
// week is what's evidence-conditioned, never hardcoded to always return the
// same four strings regardless of input.
//
// No LLM, no network, no randomness — a pure function of its arguments.

import type { WeeklyAdaptationCall } from './weekly-nutrition-adaptation.ts';

export type NutritionGoal = string | null;

export interface MonthlyStrategyInput {
  /** fitness_profile.goal, verbatim — never re-derived, never guessed. */
  goal: NutritionGoal;
  /** Whether lib/nutrition/daily-macro-targets.ts currently resolves a real
   *  protein target for this user (age 18+, weight on file). Drives whether
   *  a "build consistent protein intake" objective is even meaningful to
   *  set — there's nothing to build consistency TOWARD without a target. */
  proteinTargetAvailable: boolean;
  /** Whether the user has declared preferred training days
   *  (fitness_profile.preferred_training_days) — the only defensible signal
   *  that "nutrition around training days" is a real, applicable concept
   *  for this user (§41 — no invented training context). */
  hasTrainingDaysOnFile: boolean;
  /** Evidence from a PRIOR completed cycle, if one exists — never fabricated
   *  for a user's first-ever cycle. When present, lets week 1 skip a focus
   *  the user has already demonstrated (repeated evidence, §11/§36), rather
   *  than always restarting at the same fixed starting point. */
  priorCycleEvidence?: {
    /** true only when a prior cycle's weekly-adaptation evidence repeatedly
     *  showed protein consistency (see weekly-nutrition-adaptation.ts) —
     *  never a single day's observation. */
    proteinWasConsistent: boolean;
  };
}

export type WeekObjectiveTheme =
  | 'protein_consistency' | 'fibre_and_vegetables' | 'training_day_nutrition' | 'consolidate_what_worked';

export interface WeekObjective {
  weekNumber: 1 | 2 | 3 | 4;
  theme: WeekObjectiveTheme;
  objective: string;
  /** Internal evidence trail — why this theme was picked for this week.
   *  Never shown to the user as a "reason code" (§11/§16). */
  reason: string;
}

export interface MonthlyStrategy {
  goal: NutritionGoal;
  weeks: [WeekObjective, WeekObjective, WeekObjective, WeekObjective];
}

const OBJECTIVE_TEXT: Record<WeekObjectiveTheme, string> = {
  protein_consistency: 'Build consistent protein intake.',
  fibre_and_vegetables: 'Improve fibre and vegetable coverage.',
  training_day_nutrition: 'Improve nutrition around training days.',
  consolidate_what_worked: 'Consolidate the routines that worked this cycle.',
};

/**
 * §4/§8 — four week objectives for one 4-week cycle, deterministic and
 * evidence-conditioned. The final week is always consolidation (§4's own
 * illustration puts "consolidate" last, and it's the only theme that
 * genuinely only makes sense once 3 weeks of evidence exist). Weeks 1-3
 * otherwise follow a fixed priority order, skipping any theme this user's
 * available evidence can't support (§9 — never pretend an unsupported
 * target/context exists) and never repeating a theme already used earlier
 * in the same cycle.
 */
export function buildMonthlyStrategy(input: MonthlyStrategyInput): MonthlyStrategy {
  const available: { theme: WeekObjectiveTheme; reason: string }[] = [];

  // Priority 1 — protein consistency, but only when there's a real target
  // to build toward, and only when a prior cycle hasn't already
  // demonstrated it repeatedly (§11/§36 — single-cycle evidence isn't
  // durable enough to permanently retire a theme, but repeated evidence
  // from an actual completed cycle is allowed to reorder this one).
  if (input.proteinTargetAvailable && !input.priorCycleEvidence?.proteinWasConsistent) {
    available.push({ theme: 'protein_consistency', reason: 'A personalised protein target is available and prior-cycle evidence does not yet show consistency.' });
  }

  // Priority 2 — fibre/vegetable coverage: a generic, always-applicable
  // nutrition-quality objective (N3 has a fibre population reference for
  // every eligible adult), used whenever protein consistency isn't this
  // week's focus.
  available.push({ theme: 'fibre_and_vegetables', reason: 'A generally applicable nutrition-quality objective.' });

  // Priority 3 — training-day nutrition, only when the user has actually
  // declared training days (never invented from a goal alone).
  if (input.hasTrainingDaysOnFile) {
    available.push({ theme: 'training_day_nutrition', reason: 'Preferred training days are on file.' });
  }

  const weeks: WeekObjective[] = [];
  const used = new Set<WeekObjectiveTheme>();
  for (let weekNumber = 1; weekNumber <= 3; weekNumber++) {
    const pick = available.find(a => !used.has(a.theme)) ?? available[available.length - 1];
    used.add(pick.theme);
    weeks.push({ weekNumber: weekNumber as 1 | 2 | 3, theme: pick.theme, objective: OBJECTIVE_TEXT[pick.theme], reason: pick.reason });
  }

  // Week 4 is always consolidation (§4) — the one theme that only makes
  // sense with 3 prior weeks of this SAME cycle's evidence to consolidate.
  weeks.push({
    weekNumber: 4, theme: 'consolidate_what_worked',
    objective: OBJECTIVE_TEXT.consolidate_what_worked,
    reason: 'Final week of the cycle — consolidates whichever of weeks 1-3 the user actually followed.',
  });

  return { goal: input.goal, weeks: weeks as MonthlyStrategy['weeks'] };
}

/** The single week-objective helper both buildMonthlyStrategy's own week-4
 *  handling and prepareNextWeek use to pick "this cycle's default objective
 *  for week N" — exported so the service layer never re-derives it. */
export function objectiveForWeek(strategy: MonthlyStrategy, weekNumber: 1 | 2 | 3 | 4): WeekObjective {
  return strategy.weeks[weekNumber - 1];
}

/**
 * Closing the loop (§10) — deterministic next-week objective. Defaults to
 * the monthly strategy's own pick for the upcoming week number; but if the
 * CURRENT week's own focus was protein consistency and adaptation evidence
 * shows it wasn't yet achieved ('adjust') or is still forming ('watch'),
 * the SAME objective carries forward instead of mechanically advancing —
 * the task's own worked example ("protein target reached on only 2 of 6
 * days... next week MAY remain: build protein consistency"). Only a 'keep'
 * verdict (the focus is already working) lets the strategy's normal
 * week-number progression take over. Themes this module has no measurable
 * evidence for (fibre/vegetables, training-day nutrition) always just
 * advance — there's no fabricated signal to gate on.
 */
export function resolveNextWeekObjective(
  strategy: MonthlyStrategy, weekNumber: 1 | 2 | 3 | 4,
  currentTheme: WeekObjectiveTheme | null, adaptationCalls: WeeklyAdaptationCall[],
): WeekObjective {
  if (currentTheme === 'protein_consistency') {
    const proteinCall = adaptationCalls.find(c => c.subject === 'protein');
    if (proteinCall && proteinCall.type !== 'keep') {
      return {
        weekNumber, theme: 'protein_consistency', objective: OBJECTIVE_TEXT.protein_consistency,
        reason: `Carried forward from the prior week — ${proteinCall.message}`,
      };
    }
  }
  return objectiveForWeek(strategy, weekNumber);
}

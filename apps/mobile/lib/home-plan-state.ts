// Beta Feedback #021 — Home continuity, plan maturity & rest-day experience.
// Beta Feedback #021B — runtime precedence fix: a fully-completed week must
// still read as a REST DAY, not "programme transition", while today is
// genuinely covered by the active plan.
//
// Pure Home-state classifier. Home must answer, every time it opens:
//   1. WHERE AM I IN MY PLAN?   2. WHAT MATTERS TODAY?   3. WHAT'S NEXT?
//
// A rest day is a valid programme state — REST DAY != EMPTY DAY, != NO PLAN,
// != ERROR, != onboarding. This module only DECIDES which state Home is in;
// presentation (copy, cards) stays in the screen. No network, no LLM.

export type HomePlanState =
  | 'first_plan'               // genuine initial-plan period (§3)
  | 'training_today'           // an activity is scheduled today, not yet resolved
  | 'training_completed_today' // today's activity is completed or skipped
  | 'rest_day'                 // active plan covers today, deliberately nothing scheduled
  | 'programme_transition'     // no active plan covers today (week over, nothing next)
  | 'no_active_plan'           // no assessment/plan exists at all — distinct from rest (§17)
  | 'load_error';              // the programme query failed — distinct from rest (§17)

/**
 * §021B.3 — whether the CURRENT active plan's week actually covers today.
 * 'unknown' when the plan predates week_start_date/week_end_date being
 * recorded (the lazy date-upgrade in index.tsx hasn't landed for it yet) —
 * callers fall back to the pre-#021B upcoming-activity heuristic rather than
 * guessing, so an undated plan never regresses to programme_transition.
 */
export type PlanCoverage = 'within' | 'before' | 'after' | 'unknown';

/** Pure string-compare over local ISO (YYYY-MM-DD) dates — no Date math, no tz. */
export function resolvePlanCoverage(
  weekStartDate: string | null | undefined,
  weekEndDate: string | null | undefined,
  todayLocalDate: string,
): PlanCoverage {
  if (!weekStartDate || !weekEndDate) return 'unknown';
  if (todayLocalDate < weekStartDate) return 'before';
  if (todayLocalDate > weekEndDate) return 'after';
  return 'within';
}

export interface HomePlanStateInput {
  /** the programme/completions query genuinely failed this load */
  loadError: boolean;
  /** a valid ai_assessment exists for this user */
  hasAssessment: boolean;
  /**
   * Canonical lifecycle evidence that this is NOT the user's first plan —
   * e.g. a previous week's fitness_plans row exists, or any
   * plan_activity_completions row exists (any plan_id, ever). Deliberately
   * NOT "this week's completions are non-zero" and NOT elapsed account age
   * (§3/§20) — both are unreliable on a week that starts with a rest day.
   */
  isEstablished: boolean;
  /** findTodayActivity(...) resolved a plan activity for today (rest is INFERRED from this being false — §1.F) */
  hasTodayActivity: boolean;
  todayCompleted: boolean;
  todaySkipped: boolean;
  /** the existing #012 selectNextActivity() result for today/upcoming — reused, not re-derived */
  nextKind: 'today' | 'upcoming' | 'none';
  /**
   * §021B.3 — does the CURRENT active plan's dated week actually cover
   * today? This is the primary signal for rest vs. transition once there is
   * no today activity: a fully-completed week with nothing left to show
   * (nextKind === 'none') is still a rest day for as long as the active
   * plan's own week says today is still inside it.
   */
  planCoverage: PlanCoverage;
}

export interface HomePlanStateResult {
  state: HomePlanState;
  /** today's activity (if any) is completed or skipped */
  todayResolved: boolean;
}

/**
 * Classifies which Home state applies. Order matters and is deliberately a
 * priority chain, never independent booleans that could contradict each
 * other (§9):
 *   load failure → no plan → not established (first plan) → today's activity
 *   (training/completed) → rest vs programme-transition, decided FIRST by
 *   active-plan date coverage (§021B.2/3), falling back to the #021
 *   upcoming-activity heuristic only when coverage can't be determined.
 *
 * A missed PAST activity (e.g. an unresolved Monday session, evaluated on
 * Wednesday) never affects today's classification — `hasTodayActivity` only
 * ever reflects TODAY's slot (§1.F/§9.E: rest day is never confused with a
 * missed day from earlier in the week; this repo has no catch-up/reschedule
 * concept to surface, so #021 does not invent one — §12/§20).
 */
export function resolveHomePlanState(input: HomePlanStateInput): HomePlanStateResult {
  if (input.loadError) return { state: 'load_error', todayResolved: false };
  if (!input.hasAssessment) return { state: 'no_active_plan', todayResolved: false };
  if (!input.isEstablished) {
    return { state: 'first_plan', todayResolved: input.todayCompleted || input.todaySkipped };
  }

  const todayResolved = input.todayCompleted || input.todaySkipped;

  if (input.hasTodayActivity) {
    return { state: todayResolved ? 'training_completed_today' : 'training_today', todayResolved };
  }

  // Nothing scheduled today. §021B.2 — a finished week does NOT override a
  // day the active plan still owns: date coverage decides first.
  if (input.planCoverage === 'within') return { state: 'rest_day', todayResolved };
  if (input.planCoverage === 'after') return { state: 'programme_transition', todayResolved };

  // 'before' (plan starts later) or 'unknown' (undated legacy plan) — no
  // reliable date signal, so fall back to the #021 upcoming-activity
  // heuristic rather than guessing (§3: "handle according to existing
  // semantics").
  return { state: input.nextKind === 'none' ? 'programme_transition' : 'rest_day', todayResolved };
}

/**
 * §6 — on a rest day, an "Exercises 0/N" ring must never read as a missed
 * target the programme itself didn't ask for. Only neutralise when there is
 * ALSO no other real scheduled item today (exercisesTotal === 0) — a
 * genuinely separate scheduled workout/task still shows its real count,
 * because that IS real, unmet behavioural evidence, not a fabricated one.
 */
export function shouldNeutraliseExerciseRing(state: HomePlanState, exercisesTotal: number): boolean {
  return state === 'rest_day' && exercisesTotal === 0;
}

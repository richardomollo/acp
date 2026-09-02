// ACP Intelligence™ — Nutrition N7. Fitness × Nutrition context: the PURE layer.
//
// N7 is an OBSERVATION layer (§4). It places the user's RECENT NUTRITION
// evidence (N2 days, N3 comparisons, N4 opportunities) alongside their
// ACTUAL COMPLETED training (plan_activity_completions), on a shared
// LOCAL-DATE key — and states only what the evidence supports.
//
// CROSS-DOMAIN ≠ CAUSAL (§2). Nothing here claims a nutrient caused a
// training outcome, prescribes calories or a workout-protein target,
// infers recovery, or changes a plan. Absence of a food log means
// "not logged", never "not eaten" (§33). Absence of a completion means
// "no completed activity recorded", never "sedentary" (§34).
//
// Fully deterministic — no LLM, no network, no RAG (§27/§29). Every function
// is a pure function of its arguments, unit-tested with `node --test`.

import type { ActivityCategory } from '../ai-assessment.ts';
import type { CompletionSource } from '../completion.ts';
import type { MealSlot } from './food-types.ts';
import type { NutritionCoachingOpportunity } from './nutrition-coaching-opportunity.ts';
import { addLocalDays } from './nutrition-history.ts';

// ── Shared time model (§5) ───────────────────────────────────────────────
// Fitness completions carry `plannedDate` (local YYYY-MM-DD); nutrition
// entries carry `localDate` (local YYYY-MM-DD). Both are authored by the
// same app convention (lib/fulfilment.localISODate) in the user's own
// timezone. The join is STRING EQUALITY on the calendar date — no UTC
// arithmetic, so it is inherently correct across Europe/Amsterdam,
// Africa/Nairobi, midnight boundaries and DST changes.

export interface CrossDomainWindow {
  windowDays: 7 | 14;
  /** inclusive, YYYY-MM-DD */
  startLocalDate: string;
  /** inclusive, YYYY-MM-DD (the user's "today" in their local timezone) */
  endLocalDate: string;
}

export function crossDomainWindow(endLocalDate: string, windowDays: 7 | 14): CrossDomainWindow {
  return { windowDays, endLocalDate, startLocalDate: addLocalDays(endLocalDate, -(windowDays - 1)) };
}

/** Every calendar date in the window, oldest first. */
export function datesInWindow(w: CrossDomainWindow): string[] {
  const out: string[] = [];
  for (let i = w.windowDays - 1; i >= 0; i--) out.push(addLocalDays(w.endLocalDate, -i));
  return out;
}

function inWindow(localDate: string, w: CrossDomainWindow): boolean {
  return localDate >= w.startLocalDate && localDate <= w.endLocalDate; // ISO date strings sort lexically
}

// ── Daily fitness evidence (§7) — ACTUAL, not planned ────────────────────

/** Categories that count as "training" for N7's observations. Mobility /
 *  recovery-only days are "active" but not a training day — N7 makes no
 *  physiological claim from category beyond this coarse split (§15). */
const TRAINING_CATEGORIES: ReadonlySet<ActivityCategory> = new Set(['strength', 'cardio', 'sport']);

/** Completion sources with a genuinely externally-recorded duration
 *  (mirrors weekly-review's DURATION_KNOWN_SOURCES). */
const DURATION_KNOWN_SOURCES: ReadonlySet<CompletionSource> = new Set(['strava', 'healthkit', 'exercise_db']);

export interface CompletedActivityInput {
  planId: string;
  activityIndex: number;
  /** the plan's local date for this activity (plan_activity_completions.planned_date) */
  plannedDate: string;
  completionSource: CompletionSource;
}

export interface FitnessDayEvidence {
  localDate: string;
  completed: { activityIndex: number; category: ActivityCategory | null; source: CompletionSource }[];
  anyCompleted: boolean;
  /** ≥1 completed activity in {strength, cardio, sport} */
  isTrainingDay: boolean;
  /** ≥1 completed activity of category 'strength' */
  strengthCompleted: boolean;
  /** sum of externally-recorded minutes for completed activities on this day, or null */
  verifiedDurationMinutes: number | null;
  evidenceSources: CompletionSource[];
}

/**
 * Deterministic per-day fitness evidence across the window, from ACTUAL
 * completions only. A planned-but-uncompleted activity contributes nothing
 * (§17). Category is looked up from the completion's own plan (activities by
 * plan_id, since a 14-day window can span two weekly plans); `null` when the
 * plan/activity is no longer resolvable — such a completion still counts as
 * "an activity" but not as strength/training.
 * The `(user, plan, activity_index)` uniqueness of plan_activity_completions
 * already prevents one activity being double-counted across sources (§43).
 */
export function buildFitnessDayEvidence(
  activitiesByPlanId: Map<string, { category: ActivityCategory }[]>,
  completions: CompletedActivityInput[],
  durationByKey: Map<string, number>, // `${planId}#${activityIndex}` -> externally-recorded minutes
  window: CrossDomainWindow,
): FitnessDayEvidence[] {
  const byDate = new Map<string, FitnessDayEvidence>();
  for (const d of datesInWindow(window)) {
    byDate.set(d, {
      localDate: d, completed: [], anyCompleted: false, isTrainingDay: false,
      strengthCompleted: false, verifiedDurationMinutes: null, evidenceSources: [],
    });
  }

  for (const c of completions) {
    if (!inWindow(c.plannedDate, window)) continue;
    const day = byDate.get(c.plannedDate);
    if (!day) continue;
    const category = activitiesByPlanId.get(c.planId)?.[c.activityIndex]?.category ?? null;
    day.completed.push({ activityIndex: c.activityIndex, category, source: c.completionSource });
    day.anyCompleted = true;
    if (category === 'strength') day.strengthCompleted = true;
    if (category && TRAINING_CATEGORIES.has(category)) day.isTrainingDay = true;
    if (!day.evidenceSources.includes(c.completionSource)) day.evidenceSources.push(c.completionSource);
    if (DURATION_KNOWN_SOURCES.has(c.completionSource)) {
      const mins = durationByKey.get(`${c.planId}#${c.activityIndex}`);
      if (mins != null && mins > 0) day.verifiedDurationMinutes = (day.verifiedDurationMinutes ?? 0) + mins;
    }
  }

  return datesInWindow(window).map(d => byDate.get(d)!);
}

// ── Nutrition day slot evidence (reuses N2 entries) ──────────────────────

/** Dates within the window on which a `breakfast`-slot entry was logged.
 *  Logged, not eaten (§33) — the caller phrases it accordingly. */
export function breakfastLoggedDates(
  entriesByLocalDate: Record<string, { mealSlot: MealSlot | null }[]>,
  window: CrossDomainWindow,
): Set<string> {
  const out = new Set<string>();
  for (const [date, entries] of Object.entries(entriesByLocalDate)) {
    if (!inWindow(date, window)) continue;
    if (entries.some(e => e.mealSlot === 'breakfast')) out.add(date);
  }
  return out;
}

export function loggedDatesInWindow(
  entriesByLocalDate: Record<string, unknown[]>,
  window: CrossDomainWindow,
): Set<string> {
  const out = new Set<string>();
  for (const [date, entries] of Object.entries(entriesByLocalDate)) {
    if (inWindow(date, window) && entries.length > 0) out.add(date);
  }
  return out;
}

// ── Cross-domain observation model (§20) ─────────────────────────────────

export type CrossDomainObservationType =
  | 'training_protein_context'
  | 'training_logging_regularity'
  | 'training_activity_nutrition_consistency';

export type CrossDomainReadiness = 'insufficient' | 'early' | 'moderate' | 'strong';

export type CrossDomainAction =
  | 'review_recent_nutrition'   // → nutrition-history
  | 'review_training_week'      // → my-plan
  | 'log_food';                 // → log-food

export interface CrossDomainNutritionObservation {
  id: string;
  type: CrossDomainObservationType;
  readiness: CrossDomainReadiness;
  window: CrossDomainWindow;
  fitness: {
    trainingDayCount: number;
    strengthDayCount: number;
    activeDayCount: number;
    sources: CompletionSource[];
  };
  nutrition: {
    loggedDayCount: number;
    nutrient?: 'proteinG' | 'fibreG';
    nutrientLabel?: string;
    averageLabel?: string;
    referenceLabel?: string;
    comparison?: NutritionCoachingOpportunity['comparison'];
    coverageBand?: 'high' | 'moderate';
  };
  /** deterministic, non-causal, non-moralising */
  title: string;
  body: string;
  /** deterministic "Why am I seeing this?" — evidence only, never LLM (§21) */
  why: string;
  action: CrossDomainAction;
}

// Sample-size gates (§18). Chosen consistent with N2's evidence tiers
// (2 = early, 4 = emerging, 6 = recent pattern) and N3's MIN_LOGGED_DAYS 2.
export const CROSS_DOMAIN_GATES = {
  proteinContext: { minStrengthDays7: 2, minLoggedDays: 4 },
  loggingRegularity: { minTrainingDays7: 3, minLoggedDays7: 3, minNoBreakfastDays: 2 },
  consistency: { minTrainingDays14: 4, minTrainingDaysPerHalf: 1, minLoggedDays: 5 },
} as const;

function count<T>(xs: T[], pred: (x: T) => boolean): number {
  return xs.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
}

const READINESS_ORDER: CrossDomainReadiness[] = ['insufficient', 'early', 'moderate', 'strong'];
function weakest(a: CrossDomainReadiness, b: CrossDomainReadiness): CrossDomainReadiness {
  return READINESS_ORDER.indexOf(a) <= READINESS_ORDER.indexOf(b) ? a : b;
}
function fitnessReadiness(trainingDays: number): CrossDomainReadiness {
  if (trainingDays >= 4) return 'strong';
  if (trainingDays >= 2) return 'moderate';
  return 'early';
}
function nutritionReadiness(loggedDays: number, band: 'high' | 'moderate'): CrossDomainReadiness {
  if (loggedDays >= 6 && band === 'high') return 'strong';
  if (loggedDays >= 4) return 'moderate';
  return 'early';
}

function proteinOrFibreGap(
  opportunities: NutritionCoachingOpportunity[],
  nutrient: 'proteinG' | 'fibreG',
  minLoggedDays: number,
): NutritionCoachingOpportunity | null {
  const o = opportunities.find(x => x.nutrient === nutrient);
  if (!o) return null;
  if (o.comparison !== 'below_range' && o.comparison !== 'below_reference') return null;
  if (o.readiness !== 'high' && o.readiness !== 'moderate') return null;
  if (o.evidenceSummary.loggedDays < minLoggedDays) return null;
  return o;
}

export interface BuildObservationsInput {
  window7: CrossDomainWindow;
  window14: CrossDomainWindow;
  fitnessDays7: FitnessDayEvidence[];
  fitnessDays14: FitnessDayEvidence[];
  /** N4 deterministic opportunities over the 7-day window */
  opportunities7: NutritionCoachingOpportunity[];
  /** N4 deterministic opportunities over the 14-day window */
  opportunities14: NutritionCoachingOpportunity[];
  /** N2 entries grouped by local date, for slot analysis */
  entriesByLocalDate: Record<string, { mealSlot: MealSlot | null }[]>;
}

/**
 * Build 0–2 cross-domain observations from deterministic evidence. Small,
 * deliberate taxonomy (§9/§20). Every gate is a hard minimum in BOTH
 * domains — a single-day pairing can never become a pattern (§18).
 */
export function buildCrossDomainObservations(input: BuildObservationsInput): CrossDomainNutritionObservation[] {
  const { window7, window14, fitnessDays7, fitnessDays14, opportunities7, opportunities14, entriesByLocalDate } = input;
  const out: CrossDomainNutritionObservation[] = [];

  const strengthDays7 = count(fitnessDays7, d => d.strengthCompleted);
  const trainingDays7 = count(fitnessDays7, d => d.isTrainingDay);
  const activeDays7 = count(fitnessDays7, d => d.anyCompleted);
  const trainingDays14 = count(fitnessDays14, d => d.isTrainingDay);
  const activeDays14 = count(fitnessDays14, d => d.anyCompleted);
  const sources7 = [...new Set(fitnessDays7.flatMap(d => d.evidenceSources))];
  const sources14 = [...new Set(fitnessDays14.flatMap(d => d.evidenceSources))];

  const logged7 = loggedDatesInWindow(entriesByLocalDate, window7);

  // ── C. training_activity_nutrition_consistency (14-day) ────────────────
  // Requires activity in BOTH 7-day halves so "consistent" is earned.
  const midpoint = addLocalDays(window14.endLocalDate, -6); // first day of the recent half
  const trainedRecentHalf = count(fitnessDays14, d => d.isTrainingDay && d.localDate >= midpoint);
  const trainedOlderHalf = count(fitnessDays14, d => d.isTrainingDay && d.localDate < midpoint);
  let consistencyNutrient: 'proteinG' | 'fibreG' | null = null;
  if (
    trainingDays14 >= CROSS_DOMAIN_GATES.consistency.minTrainingDays14 &&
    trainedRecentHalf >= CROSS_DOMAIN_GATES.consistency.minTrainingDaysPerHalf &&
    trainedOlderHalf >= CROSS_DOMAIN_GATES.consistency.minTrainingDaysPerHalf
  ) {
    const gap = proteinOrFibreGap(opportunities14, 'proteinG', CROSS_DOMAIN_GATES.consistency.minLoggedDays)
      ?? proteinOrFibreGap(opportunities14, 'fibreG', CROSS_DOMAIN_GATES.consistency.minLoggedDays);
    if (gap) {
      consistencyNutrient = gap.nutrient as 'proteinG' | 'fibreG';
      const n = gap.nutrientLabel.toLowerCase();
      out.push({
        id: `training_activity_nutrition_consistency-${gap.nutrient}`,
        type: 'training_activity_nutrition_consistency',
        readiness: weakest(fitnessReadiness(trainingDays14), nutritionReadiness(gap.evidenceSummary.loggedDays, gap.evidenceSummary.coverageBand)),
        window: window14,
        fitness: { trainingDayCount: trainingDays14, strengthDayCount: count(fitnessDays14, d => d.strengthCompleted), activeDayCount: activeDays14, sources: sources14 },
        nutrition: {
          loggedDayCount: gap.evidenceSummary.loggedDays,
          nutrient: gap.nutrient as 'proteinG' | 'fibreG',
          nutrientLabel: gap.nutrientLabel,
          averageLabel: gap.evidenceSummary.averageLoggedLabel,
          referenceLabel: gap.evidenceSummary.referenceLabel,
          comparison: gap.comparison,
          coverageBand: gap.evidenceSummary.coverageBand,
        },
        title: `Your recent training and ${n}`,
        body: `You trained on ${trainingDays14} days across the last 14 days. Across your logged days in that window, ${n} stayed below its reference range.`,
        why: `Training was completed on ${trainingDays14} of the last 14 days, with at least one completed session in each of the last two weeks. Across ${gap.evidenceSummary.loggedDays} logged nutrition days, average logged ${n} was ${gap.evidenceSummary.averageLoggedLabel}; your current reference is ${gap.evidenceSummary.referenceLabel}.`,
        action: 'review_recent_nutrition',
      });
    }
  }

  // ── A. training_protein_context (7-day) ──────────────────────────────
  // Suppressed when C already covers protein — C is the stronger window.
  if (!(consistencyNutrient === 'proteinG')) {
    const gap = proteinOrFibreGap(opportunities7, 'proteinG', CROSS_DOMAIN_GATES.proteinContext.minLoggedDays);
    if (gap && strengthDays7 >= CROSS_DOMAIN_GATES.proteinContext.minStrengthDays7) {
      const s = strengthDays7;
      out.push({
        id: `training_protein_context-${gap.nutrient}`,
        type: 'training_protein_context',
        readiness: weakest(fitnessReadiness(strengthDays7), nutritionReadiness(gap.evidenceSummary.loggedDays, gap.evidenceSummary.coverageBand)),
        window: window7,
        fitness: { trainingDayCount: trainingDays7, strengthDayCount: s, activeDayCount: activeDays7, sources: sources7 },
        nutrition: {
          loggedDayCount: gap.evidenceSummary.loggedDays,
          nutrient: 'proteinG',
          nutrientLabel: gap.nutrientLabel,
          averageLabel: gap.evidenceSummary.averageLoggedLabel,
          referenceLabel: gap.evidenceSummary.referenceLabel,
          comparison: gap.comparison,
          coverageBand: gap.evidenceSummary.coverageBand,
        },
        title: 'Training and protein',
        body: `You completed ${s} strength session${s === 1 ? '' : 's'} across the last 7 days. Across ${gap.evidenceSummary.loggedDays} logged nutrition days, protein stayed below your current reference range.`,
        why: `Across the last 7 days you completed ${s} strength session${s === 1 ? '' : 's'}. Nutrition was logged on ${gap.evidenceSummary.loggedDays} days. Average logged protein was ${gap.evidenceSummary.averageLoggedLabel}; your current reference is ${gap.evidenceSummary.referenceLabel}.`,
        action: 'review_recent_nutrition',
      });
    }
  }

  // ── B. training_logging_regularity (7-day) ──────────────────────────
  if (
    trainingDays7 >= CROSS_DOMAIN_GATES.loggingRegularity.minTrainingDays7 &&
    logged7.size >= CROSS_DOMAIN_GATES.loggingRegularity.minLoggedDays7
  ) {
    const trainingDates7 = fitnessDays7.filter(d => d.isTrainingDay).map(d => d.localDate);
    const withBreakfast = breakfastLoggedDates(entriesByLocalDate, window7);
    const noBreakfast = trainingDates7.filter(d => !withBreakfast.has(d));
    if (noBreakfast.length >= CROSS_DOMAIN_GATES.loggingRegularity.minNoBreakfastDays && noBreakfast.length > trainingDates7.length / 2) {
      out.push({
        id: 'training_logging_regularity-breakfast',
        type: 'training_logging_regularity',
        readiness: weakest(fitnessReadiness(trainingDays7), logged7.size >= 6 ? 'strong' : 'moderate'),
        window: window7,
        fitness: { trainingDayCount: trainingDays7, strengthDayCount: strengthDays7, activeDayCount: activeDays7, sources: sources7 },
        nutrition: { loggedDayCount: logged7.size },
        title: 'Food logging on training days',
        body: `Breakfast wasn’t logged on ${noBreakfast.length} of the ${trainingDates7.length} days you trained in the last 7 days.`,
        why: `On ${noBreakfast.length} of ${trainingDates7.length} training days in this window, no food was logged in the breakfast slot. This reflects what was logged, not necessarily what was eaten.`,
        action: 'log_food',
      });
    }
  }

  // Small, deliberate surface — at most two, strongest first (§20/§30).
  const priority: CrossDomainObservationType[] = [
    'training_activity_nutrition_consistency',
    'training_protein_context',
    'training_logging_regularity',
  ];
  return out
    .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))
    .slice(0, 2);
}

// ── Safety: defence-in-depth string check (§46) ─────────────────────────
// Structural prevention is primary — every string above is a deterministic
// template. This list is a test-time backstop against a future edit that
// introduces a causal / calorie / recovery / moralising claim.
const CROSS_DOMAIN_BANNED: { label: string; re: RegExp }[] = [
  { label: 'causal', re: /\b(caused|because your (diet|nutrition|training)|due to your (diet|nutrition)|led to|resulted in)\b/i },
  { label: 'recovery', re: /\b(recovery is (impaired|compromised)|under[- ]?fuel|overtrained|glycogen|anabolic window)\b/i },
  { label: 'deficiency', re: /\b(deficien(t|cy)|explains (your )?fatigue|hormone disruption|injury risk)\b/i },
  { label: 'calorie-comp', re: /\b(eat back|calorie deficit|burned .* calories|eat .* calories|calorie budget|eat more because|fuel your workout)\b/i },
  { label: 'skipped-meal', re: /\byou (skipped|missed) (breakfast|lunch|dinner|a meal)\b/i },
  { label: 'moralising', re: /\b(poor (diet|nutrition)|bad (nutrition|eating|training)|unhealthy|you must\b|you should\b|not eating enough)\b/i },
  { label: 'protein-target', re: /\b(2\.2\s*g\/?kg|workout protein target|per kg on (strength|training) days)\b/i },
];

export function findUnsafeCrossDomainPhrases(text: string): string[] {
  return CROSS_DOMAIN_BANNED.filter(p => p.re.test(text)).map(p => p.label);
}

export function assertSafeCrossDomainObservation(o: CrossDomainNutritionObservation): void {
  for (const field of [o.title, o.body, o.why] as const) {
    const hits = findUnsafeCrossDomainPhrases(field);
    if (hits.length > 0) throw new Error(`Unsafe N7 copy "${field}" matched [${hits.join(', ')}]`);
  }
}

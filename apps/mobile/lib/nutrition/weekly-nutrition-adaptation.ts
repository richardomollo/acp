// Lana Nutrition — Monthly → Weekly → Daily Planning V1. Weekly adaptation
// (product spec §35-39).
//
// Modeled on two already-proven patterns (audited before writing this):
//   • lib/adaptation-engine.ts's evaluateAdaptation() — a pure, zero-LLM,
//     deterministic function over structured evidence. No server route, no
//     RAG, no generated prose.
//   • apps/web/app/api/ai/weekly-adaptation/longitudinal.ts's
//     CoachingPattern shape ({ type, subject, confidence, evidence,
//     user_message }) — reused here for KEEP/ADJUST/WATCH legibility.
//
// This module does NOT write to `coaching_memory` (that requires a
// service-role server route this V1 doesn't build — see the completion
// report's Known Limitations) and does NOT call an LLM. It reasons over
// ONE week's structured adherence evidence at a time — "one unusual day
// does not establish a pattern" (§36) is enforced via MIN_DAYS_FOR_SIGNAL
// below, the same "repeated evidence required" principle N9
// (nutrition-outcome-intelligence.ts) already applies at the multi-week
// layer.
//
// No LLM, no network, no randomness — a pure function of its arguments.

import type { MealSlot } from './food-types.ts';

// ── Evidence gates — explicit, named, reviewable (mirrors N9's OUTCOME_GATES
//    and the longitudinal module's named threshold constants). ───────────
export const ADAPTATION_GATES = {
  /** Fewer planned days than this for a slot/nutrient this week -> not even
   *  enough to WATCH confidently; the item is omitted entirely (§36). */
  minDaysForAnySignal: 2,
  /** At least this many planned days before a signal can read 'moderate' or
   *  above rather than 'emerging'. */
  minDaysForSignal: 3,
  /** At or above this many days, a strong signal is possible. */
  strongDays: 5,
  /** Adherence/consistency rate at or above this -> KEEP. */
  keepRate: 0.75,
  /** Adherence/consistency rate at or below this -> ADJUST. */
  adjustRate: 0.4,
} as const;

export interface SlotAdherenceEvidence {
  slot: MealSlot;
  /** Days this slot had a planned meal this week. */
  plannedDays: number;
  /** Of those, days the user actually logged the planned meal (status='consumed'). */
  consumedDays: number;
}

export interface ProteinAdherenceEvidence {
  /** Days a real protein target existed this week (age/weight on file). */
  daysWithTarget: number;
  /** Of those, days actual logged protein met or exceeded the target's min. */
  daysAtOrAboveMin: number;
}

export interface WeeklyAdaptationInput {
  slotAdherence: SlotAdherenceEvidence[];
  /** null when no protein target existed at all this week — never a
   *  fabricated signal (mirrors daily-macro-targets.ts's own honesty rule). */
  proteinAdherence: ProteinAdherenceEvidence | null;
}

// ── §3/§4/§6/§7/§8 — the pure ACTUAL-evidence → WeeklyAdaptationInput
//    mapping, extracted so it's testable without a database. The service
//    layer (nutrition-planning-service.ts's aggregateWeeklyEvidence) is a
//    thin wrapper: fetch the rows, call this, nothing else. ──────────────

/** The minimal shape of one day's N2 evidence this module needs — never the
 *  whole DayNutrition object, so this stays decoupled from N2's own type. */
export interface DayObservation {
  hasLogs: boolean;
  proteinG: number;
}

/** The minimal shape of one planned-meal row this module needs. */
export interface PlannedMealObservation {
  mealSlot: MealSlot;
  status: 'recommended' | 'planned' | 'consumed' | 'replaced' | 'skipped';
}

const CANONICAL_SLOTS_FOR_ADHERENCE: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Builds the adaptation input from real evidence rows for one week.
 *   - slot adherence counts ONLY status='consumed' rows (§7) — set
 *     exclusively by an explicit "Log this" action with a real
 *     consumed_log_group_id link (never inferred from a same-slot food log
 *     that merely LOOKS similar, §8).
 *   - protein adherence only ever considers days with `hasLogs === true`
 *     (§6 — a day with nothing logged is NO OBSERVATION, never a 0g
 *     reading) and only exists at all when `proteinTarget` is non-null (§5).
 */
export function buildWeeklyAdaptationInput(
  days: DayObservation[],
  plannedMeals: PlannedMealObservation[],
  proteinTarget: { min: number; max: number } | null,
): WeeklyAdaptationInput {
  const observedDays = days.filter(d => d.hasLogs);

  const slotAdherence: SlotAdherenceEvidence[] = CANONICAL_SLOTS_FOR_ADHERENCE.map(slot => {
    const rowsForSlot = plannedMeals.filter(m => m.mealSlot === slot);
    return { slot, plannedDays: rowsForSlot.length, consumedDays: rowsForSlot.filter(m => m.status === 'consumed').length };
  });

  const proteinAdherence: ProteinAdherenceEvidence | null = proteinTarget
    ? { daysWithTarget: observedDays.length, daysAtOrAboveMin: observedDays.filter(d => d.proteinG >= proteinTarget.min).length }
    : null;

  return { slotAdherence, proteinAdherence };
}

export type AdaptationCallType = 'keep' | 'adjust' | 'watch';
export type AdaptationConfidence = 'emerging' | 'moderate' | 'strong';

export interface WeeklyAdaptationCall {
  type: AdaptationCallType;
  /** A meal slot name, or 'protein'. */
  subject: string;
  confidence: AdaptationConfidence;
  evidence: { days: number; rate: number | null };
  /** Fixed, deterministic template text — never LLM-generated. */
  message: string;
}

function confidenceForDays(days: number): AdaptationConfidence {
  if (days >= ADAPTATION_GATES.strongDays) return 'strong';
  if (days >= ADAPTATION_GATES.minDaysForSignal) return 'moderate';
  return 'emerging';
}

function callForRate(subject: string, days: number, rate: number, keepLabel: string, adjustLabel: string, watchLabel: string): WeeklyAdaptationCall {
  const confidence = confidenceForDays(days);
  if (rate >= ADAPTATION_GATES.keepRate) {
    return { type: 'keep', subject, confidence, evidence: { days, rate }, message: keepLabel };
  }
  if (rate <= ADAPTATION_GATES.adjustRate) {
    return { type: 'adjust', subject, confidence, evidence: { days, rate }, message: adjustLabel };
  }
  return { type: 'watch', subject, confidence, evidence: { days, rate }, message: watchLabel };
}

/**
 * §35-39 — one week's structured KEEP/ADJUST/WATCH calls. Deterministic,
 * evidence-gated, never more than one call per subject (slot or protein).
 * The CALLER decides how many ADJUST calls actually change next week's
 * objective (the monthly strategy stays stable otherwise, §38) — this
 * module only reports evidence, exactly like N7/N8/N9 never decide UI or
 * mutate a plan themselves.
 */
export function evaluateWeeklyAdaptation(input: WeeklyAdaptationInput): WeeklyAdaptationCall[] {
  const calls: WeeklyAdaptationCall[] = [];

  for (const s of input.slotAdherence) {
    if (s.plannedDays < ADAPTATION_GATES.minDaysForAnySignal) continue; // not enough evidence to say anything at all
    if (s.plannedDays < ADAPTATION_GATES.minDaysForSignal) {
      calls.push({
        type: 'watch', subject: s.slot, confidence: 'emerging',
        evidence: { days: s.plannedDays, rate: null },
        message: `${s.slot} adherence was inconsistent, but evidence is insufficient to establish a durable pattern.`,
      });
      continue;
    }
    const rate = s.consumedDays / s.plannedDays;
    calls.push(callForRate(
      s.slot, s.plannedDays, rate,
      `${s.slot} pattern appears workable.`,
      `${s.slot} adherence has repeatedly fallen below what was planned.`,
      `${s.slot} adherence was mixed this week.`,
    ));
  }

  if (input.proteinAdherence) {
    const p = input.proteinAdherence;
    if (p.daysWithTarget >= ADAPTATION_GATES.minDaysForAnySignal) {
      if (p.daysWithTarget < ADAPTATION_GATES.minDaysForSignal) {
        calls.push({
          type: 'watch', subject: 'protein', confidence: 'emerging',
          evidence: { days: p.daysWithTarget, rate: null },
          message: 'Protein consistency was mixed, but evidence is insufficient to establish a durable pattern.',
        });
      } else {
        const rate = p.daysAtOrAboveMin / p.daysWithTarget;
        calls.push(callForRate(
          'protein', p.daysWithTarget, rate,
          'Protein consistency appears workable.',
          'Protein coverage has repeatedly fallen below the supported target range.',
          'Protein consistency was mixed this week.',
        ));
      }
    }
  }

  return calls;
}

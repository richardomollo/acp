// Lana Nutrition — Daily Macro Targets V1. TARGET vs ACTUAL for Today.
//
// This module NEVER computes a target itself — it is a thin, pure adapter
// over the EXISTING N3 reference engine (nutrition-reference-engine.ts),
// which is the one place Lana resolves personalised nutrition reference
// numbers. See that module's own header for why: N3's completion report
// explicitly decided NOT to model energy (no BMR/TDEE engine — that would
// cross into the medically-adjacent territory nutrition-coaching-safety.ts
// already bans from coaching copy), and protein is the ONLY macro with a
// vetted, non-diagnostic personalised reference (a 1.4–2.0 g/kg/day RANGE
// from the ISSN Position Stand, resolved against the user's own current
// body weight — PROTEIN_PERFORMANCE_REFERENCE in nutrition-reference-data.ts).
// Carbohydrate and fat have NO reference row in that file at all — nothing
// to resolve, so their targets stay permanently unavailable here rather
// than being derived from an energy split that doesn't exist.
//
// No LLM, no network, no randomness — a pure function of the SAME
// UserReferenceContext today-nutrition.tsx already resolves once per load
// (nutrition-reference-service.ts) for the (currently hidden) N3 references
// section. No new fetch, no new persistence.

import { getNutritionReferences, type UserReferenceContext } from './nutrition-reference-engine.ts';

export interface MacroTargetRange {
  min: number;
  max: number;
}

/**
 * §5/§10 — each target independently exists or doesn't; nothing here ever
 * invents a missing one. `carbsTargetG`/`fatTargetG`/`energyTargetKcal` are
 * typed `null` (not just possibly null) because Lana's current architecture
 * has categorically no reference for them — not "unavailable for this
 * user", unavailable for every user, today. Kept as explicit fields (rather
 * than omitted) so a future genuinely evidence-grounded addition slots in
 * without a UI rewrite — see this file's own header.
 */
export interface DailyMacroTargets {
  proteinTargetG: MacroTargetRange | null;
  carbsTargetG: null;
  fatTargetG: null;
  energyTargetKcal: null;
}

/**
 * The ONE macro target Lana currently supports, resolved from the existing
 * N3 protein reference (age 18+, current body weight on file). Returns
 * `null` when either is missing — never a fabricated number, never a
 * silently-picked single value out of the 1.4–2.0 g/kg range (N3 §8
 * explicitly warns against inventing a goal→number mapping).
 */
export function resolveDailyMacroTargets(context: UserReferenceContext): DailyMacroTargets {
  const protein = getNutritionReferences(context).proteinG;
  const proteinTargetG =
    protein.status === 'available' && protein.reference.referenceType === 'range'
      ? { min: protein.reference.min!, max: protein.reference.max! }
      : null;
  return { proteinTargetG, carbsTargetG: null, fatTargetG: null, energyTargetKcal: null };
}

/**
 * §16/§17 — progress toward the top of the range, capped at 100%. Exceeding
 * the target is not an error state; the caller decides how (or whether) to
 * show that visually, this only returns the fraction. `null` when there's
 * no target to compare against — never treated as 0%.
 */
export function macroProgressFraction(consumed: number, target: MacroTargetRange | null): number | null {
  if (!target || !(target.max > 0)) return null;
  return Math.min(1, Math.max(0, consumed / target.max));
}

/**
 * §13/§14 — the compact display string. `consumed / min–max{unit}` when a
 * target exists, otherwise the honest consumed-only form (never
 * `consumed / 0` or `consumed / --`, per §14's explicit "no confusing
 * visual noise" instruction).
 */
export function formatMacroWithTarget(consumed: number, target: MacroTargetRange | null, unit: string): string {
  const c = Math.round(consumed);
  if (!target) return `${c}${unit}`;
  return `${c} / ${Math.round(target.min)}–${Math.round(target.max)}${unit}`;
}

// ACP Intelligence™ — Nutrition N8. Advice effectiveness: the PURE layer.
//
// N8 measures, OBSERVATIONALLY, how a user's SUBSEQUENT logged nutrition
// moved relative to the FROZEN evidence snapshot taken when an N4 coaching
// card was actually shown (N8 §2). It never claims the advice worked, was
// followed, or caused anything (§10/§27). It writes no coaching_memory (§44),
// adapts no plan (§45), and uses no LLM (§42).
//
// The intervention identity is the STRUCTURED N4 opportunity — nutrient +
// comparison — never the (possibly LLM-rephrased) sentence the user read
// (§7/§20). Every function here is a pure function of its arguments.

import type { NutrientRefKey } from './nutrition-reference-data.ts';
import type { NutritionCoachingOpportunity } from './nutrition-coaching-opportunity.ts';
import type { NutritionReferenceComparison } from './nutrition-reference-engine.ts';
import type { DayNutrition } from './nutrition-history.ts';
import type { FoodLogEntry } from './food-types.ts';
import { addLocalDays } from './nutrition-history.ts';

// N8 only evaluates the two macro nutrients N4 coaches on (§19/§S). Micros
// are deliberately out of N8 MVP — a below-reference micro is never a
// coaching card N8 would have tracked.
export type EffectivenessNutrient = Extract<NutrientRefKey, 'proteinG' | 'fibreG'>;
export const EFFECTIVENESS_NUTRIENTS: readonly EffectivenessNutrient[] = ['proteinG', 'fibreG'];

/** Only below-reference gaps are trackable interventions (§19). */
export type TrackedComparison = 'below_range' | 'below_reference';

/** Calendar days after which an exposure is no longer evaluated (§34). Aligned
 *  with N2's 14-day recent window + a week of slack. */
export const EXPOSURE_HORIZON_DAYS = 21;

/** Subsequent-logged-day gates (§13/§30). Consistent with N2's evidence tiers
 *  (2 = early, 4 = emerging, 6/7 = recent pattern). Below `early` → not
 *  surfaced at all (§30 — no "not enough evidence yet" noise). */
export const AFTER_GATES = { early: 2, moderate: 4, strong: 6 } as const;

/** Conservative meaningful-change threshold per nutrient (§16/§53). A move
 *  counts only if it exceeds BOTH an absolute floor and a small relative
 *  fraction of the before average — 108.0 → 108.2 is never "improvement". */
export const MEANINGFUL_CHANGE: Record<EffectivenessNutrient, { abs: number; rel: number }> = {
  proteinG: { abs: 5, rel: 0.05 },
  fibreG: { abs: 3, rel: 0.05 },
};

// ── Identity (§8/§9) ─────────────────────────────────────────────────────

export function opportunityKey(nutrient: string, comparison: string): string {
  return `nutrition:${nutrient}:${comparison}`;
}
export function episodeKey(oppKey: string, shownLocalDate: string): string {
  return `${oppKey}:${shownLocalDate}`;
}

// ── Frozen "before" snapshot (§11) ──────────────────────────────────────

export interface ExposureBeforeSnapshot {
  opportunityKey: string;
  nutrient: EffectivenessNutrient;
  comparison: TrackedComparison;
  actionKind: string | null;
  beforeAverage: number | null;
  beforeLoggedDays: number;
  beforeWindowDays: number;
  beforeCoverageBand: 'high' | 'moderate';
  beforeReadiness: 'high' | 'moderate';
  referenceType: 'exact' | 'range';
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceUnit: string;
}

/**
 * Build the frozen snapshot for one shown card, from the N4 opportunity that
 * produced it plus the matching N3 comparison (for the numeric reference
 * bounds). Returns null when the pairing is not a trackable below-reference
 * macro gap — such a card must never create an exposure (§19).
 */
export function buildBeforeSnapshot(
  opportunity: Pick<NutritionCoachingOpportunity, 'nutrient' | 'comparison' | 'readiness' | 'evidenceSummary' | 'action'>,
  comparison: Pick<NutritionReferenceComparison, 'reference' | 'state'> | undefined,
): ExposureBeforeSnapshot | null {
  const nutrient = opportunity.nutrient as EffectivenessNutrient;
  if (!EFFECTIVENESS_NUTRIENTS.includes(nutrient)) return null;
  if (opportunity.comparison !== 'below_range' && opportunity.comparison !== 'below_reference') return null;
  if (opportunity.readiness !== 'high' && opportunity.readiness !== 'moderate') return null;
  if (!comparison || comparison.reference.status !== 'available') return null;

  const ref = comparison.reference.reference;
  const referenceLow = ref.referenceType === 'range' ? (ref.min ?? null) : (ref.value ?? null);
  const referenceHigh = ref.referenceType === 'range' ? (ref.max ?? null) : null;

  return {
    opportunityKey: opportunityKey(nutrient, opportunity.comparison),
    nutrient,
    comparison: opportunity.comparison,
    actionKind: opportunity.action?.route ?? null,
    beforeAverage: opportunity.evidenceSummary.averageLogged,
    beforeLoggedDays: opportunity.evidenceSummary.loggedDays,
    beforeWindowDays: opportunity.evidenceSummary.windowDays,
    beforeCoverageBand: opportunity.evidenceSummary.coverageBand,
    beforeReadiness: opportunity.readiness,
    referenceType: ref.referenceType,
    referenceLow,
    referenceHigh,
    referenceUnit: ref.unit,
  };
}

// ── Effectiveness evaluation (§15/§16/§28) ──────────────────────────────

export type EffectivenessDirection =
  | 'toward_reference'
  | 'within_reference'
  | 'above_reference'      // moved past the upper bound — described NEUTRALLY, never "excess" (§18/§57)
  | 'no_clear_change'
  | 'away_from_reference'  // computed, but NOT surfaced in N8 MVP (§28)
  | 'insufficient_evidence';

export type EffectivenessReadiness = 'insufficient' | 'early' | 'moderate' | 'strong';

/** A persisted exposure row, mapped to camelCase. */
export interface ExposureRecord extends ExposureBeforeSnapshot {
  id: string;
  episodeKey: string;
  shownLocalDate: string;
}

export interface NutritionAdviceEffectiveness {
  exposureId: string;
  opportunityKey: string;
  episodeKey: string;
  nutrient: EffectivenessNutrient;
  comparison: TrackedComparison;
  readiness: EffectivenessReadiness;
  direction: EffectivenessDirection;
  before: { average: number | null; loggedDays: number; windowDays: number; referenceLow: number | null; referenceHigh: number | null; referenceUnit: string; referenceType: 'exact' | 'range' };
  after: { average: number | null; loggedDays: number; elapsedDays: number };
  /** deterministic, observational, non-causal */
  summary: string;
  /** deterministic "Why am I seeing this?" — frozen before + subsequent after (§31) */
  why: string;
}

function afterState(avg: number, s: ExposureBeforeSnapshot): 'below' | 'within' | 'above' {
  if (s.referenceType === 'range') {
    if (s.referenceLow != null && avg < s.referenceLow) return 'below';
    if (s.referenceHigh != null && avg > s.referenceHigh) return 'above';
    return 'within';
  }
  // exact / floor
  return s.referenceLow != null && avg >= s.referenceLow ? 'within' : 'below';
}

export function afterReadiness(afterLoggedDays: number): EffectivenessReadiness {
  if (afterLoggedDays >= AFTER_GATES.strong) return 'strong';
  if (afterLoggedDays >= AFTER_GATES.moderate) return 'moderate';
  if (afterLoggedDays >= AFTER_GATES.early) return 'early';
  return 'insufficient';
}

const NUTRIENT_LABEL: Record<EffectivenessNutrient, string> = { proteinG: 'protein', fibreG: 'fibre' };

function refLabel(s: ExposureBeforeSnapshot): string {
  if (s.referenceType === 'range' && s.referenceLow != null && s.referenceHigh != null) {
    return `${round(s.referenceLow)}–${round(s.referenceHigh)} ${s.referenceUnit}/day`;
  }
  if (s.referenceLow != null) return `${round(s.referenceLow)} ${s.referenceUnit}/day`;
  return 'your current reference';
}
function round(v: number): number { return Math.round(v); }
function amount(v: number, unit: string): string { return `${round(v)} ${unit}/day`; }

/**
 * Evaluate one exposure episode against the subsequent logged nutrition days.
 * `afterDays` MUST already be limited to days strictly AFTER shown_local_date
 * (§12) and within the horizon. Returns null when the episode is expired,
 * or has too little subsequent evidence to surface (§30/§34), or the
 * direction is one N8 does not surface (§28).
 */
/**
 * The raw per-episode classification, WITHOUT the N8-surface gate. Returns
 * `null` only when the episode is expired (§34) or has too few subsequent
 * logged days to evaluate at all (§30). N9 aggregates these across many
 * episodes (§22 — one shared evaluator); N8's `evaluateEffectiveness`
 * additionally drops `away_from_reference` / `insufficient_evidence` for its
 * own UI (§28).
 */
export interface EpisodeClassification {
  direction: EffectivenessDirection;
  readiness: EffectivenessReadiness;
  afterLoggedDays: number;
  afterAverage: number | null;
  elapsedDays: number;
}

export function classifyEpisode(
  exposure: ExposureRecord,
  afterDays: DayNutrition[],
  nowLocalDate: string,
): EpisodeClassification | null {
  const elapsedDays = daysBetween(exposure.shownLocalDate, nowLocalDate);
  if (elapsedDays > EXPOSURE_HORIZON_DAYS) return null; // expired (§34)

  const logged = afterDays.filter(d => d.hasLogs);
  const afterLoggedDays = logged.length;
  const readiness = afterReadiness(afterLoggedDays);
  if (readiness === 'insufficient') return null; // too little subsequent evidence (§30)

  // The after average is the mean over subsequent LOGGED days of each day's
  // known nutrient total — byte-for-byte N2's `averagesPerLoggedDay` (a
  // DayNutrition already carries that per-day macro total, 0 when the day
  // knew nothing), including N2's one-decimal rounding. Never treat a
  // non-logged day as zero intake (§14/§50).
  const afterAverage = afterLoggedDays > 0
    ? Math.round((logged.reduce((acc, d) => acc + macroOf(d, exposure.nutrient), 0) / afterLoggedDays) * 10) / 10
    : null;

  const before = exposure.beforeAverage;
  let direction: EffectivenessDirection;
  if (afterAverage == null || before == null) {
    direction = 'insufficient_evidence';
  } else {
    const st = afterState(afterAverage, exposure);
    if (st === 'within') direction = 'within_reference';
    else if (st === 'above') direction = 'above_reference';
    else if (afterAverage - before >= threshold(exposure.nutrient, before)) direction = 'toward_reference';
    else if (before - afterAverage >= threshold(exposure.nutrient, before)) direction = 'away_from_reference';
    else direction = 'no_clear_change';
  }

  return { direction, readiness, afterLoggedDays, afterAverage, elapsedDays };
}

export function evaluateEffectiveness(
  exposure: ExposureRecord,
  afterDays: DayNutrition[],
  nowLocalDate: string,
): NutritionAdviceEffectiveness | null {
  const cls = classifyEpisode(exposure, afterDays, nowLocalDate);
  if (!cls) return null; // expired or too little subsequent evidence
  const { direction, readiness, afterLoggedDays, afterAverage: afterAvg, elapsedDays } = cls;

  if (direction === 'insufficient_evidence' || direction === 'away_from_reference') return null; // §28

  const before = exposure.beforeAverage;

  const n = NUTRIENT_LABEL[exposure.nutrient];
  const rl = refLabel(exposure);
  const summary = buildSummary(direction, n);
  const why = before != null && afterAvg != null
    ? `When this suggestion was first shown, average logged ${n} was ${amount(before, exposure.referenceUnit)} across ${exposure.beforeLoggedDays} logged ${plural(exposure.beforeLoggedDays, 'day')}. Across ${afterLoggedDays} subsequent logged ${plural(afterLoggedDays, 'day')} it averaged ${amount(afterAvg, exposure.referenceUnit)}. The reference used for this comparison is ${rl}.`
    : `When this suggestion was first shown there were ${exposure.beforeLoggedDays} logged ${plural(exposure.beforeLoggedDays, 'day')}. There are now ${afterLoggedDays} subsequent logged ${plural(afterLoggedDays, 'day')}.`;

  return {
    exposureId: exposure.id,
    opportunityKey: exposure.opportunityKey,
    episodeKey: exposure.episodeKey,
    nutrient: exposure.nutrient,
    comparison: exposure.comparison,
    readiness,
    direction,
    before: {
      average: before,
      loggedDays: exposure.beforeLoggedDays,
      windowDays: exposure.beforeWindowDays,
      referenceLow: exposure.referenceLow,
      referenceHigh: exposure.referenceHigh,
      referenceUnit: exposure.referenceUnit,
      referenceType: exposure.referenceType,
    },
    after: { average: afterAvg, loggedDays: afterLoggedDays, elapsedDays },
    summary,
    why,
  };
}

function threshold(nutrient: EffectivenessNutrient, before: number): number {
  const t = MEANINGFUL_CHANGE[nutrient];
  return Math.max(t.abs, t.rel * before);
}
function macroOf(d: DayNutrition, nutrient: EffectivenessNutrient): number {
  return nutrient === 'proteinG' ? d.proteinG : d.fibreG;
}
function daysBetween(aIso: string, bIso: string): number {
  const a = Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10));
  const b = Date.UTC(+bIso.slice(0, 4), +bIso.slice(5, 7) - 1, +bIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
function plural(n: number, w: string): string { return n === 1 ? w : `${w}s`; }

function buildSummary(direction: EffectivenessDirection, n: string): string {
  switch (direction) {
    case 'within_reference':
      return `Across your recent logged days, ${n} is now within your current reference range.`;
    case 'toward_reference':
      return `Since this suggestion was shown, your average logged ${n} has moved closer to your current reference range.`;
    case 'above_reference':
      return `Across your recent logged days, ${n} is now above your current reference range.`;
    case 'no_clear_change':
    default:
      return `Your recent logged ${n} is similar to the period before this suggestion.`;
  }
}

// ── After-window date helper (§12 — begins the NEXT local calendar day) ──

export function afterWindowStart(shownLocalDate: string): string {
  return addLocalDays(shownLocalDate, 1);
}

/** Filter a set of N2 DayNutrition to the strictly-after, within-horizon window. */
export function afterWindowDays(
  allDays: DayNutrition[],
  shownLocalDate: string,
  nowLocalDate: string,
): DayNutrition[] {
  const start = afterWindowStart(shownLocalDate);
  const end = addLocalDays(shownLocalDate, EXPOSURE_HORIZON_DAYS);
  const cap = end < nowLocalDate ? end : nowLocalDate;
  return allDays.filter(d => d.localDate >= start && d.localDate <= cap);
}

/** Entries strictly after the exposure day, for building `afterDays` via N2. */
export function afterWindowEntries(
  entries: FoodLogEntry[],
  shownLocalDate: string,
  nowLocalDate: string,
): FoodLogEntry[] {
  const start = afterWindowStart(shownLocalDate);
  const end = addLocalDays(shownLocalDate, EXPOSURE_HORIZON_DAYS);
  const cap = end < nowLocalDate ? end : nowLocalDate;
  return entries.filter(e => e.localDate >= start && e.localDate <= cap);
}

// ── Safety: defence-in-depth string check (§27/§61) ─────────────────────
const BANNED: { label: string; re: RegExp }[] = [
  { label: 'efficacy-verdict', re: /\b(worked|failed|effective|ineffective|success(ful)?|fixed|solved|made you)\b/i },
  { label: 'causal', re: /\b(caused|because acp|because of acp|thanks to|resulted in|due to (the |our )?(advice|suggestion|recommendation)|our recommendation)\b/i },
  { label: 'attribution', re: /\b(acp|we|our (advice|suggestion|coaching|recommendation)) (improved|helped|boosted|raised|increased|changed|fixed) your\b/i },
  { label: 'improved-your', re: /\bimproved your (diet|nutrition|protein|fibre|intake|eating)\b/i },
  { label: 'adherence', re: /\b(complied|you followed|followed (our|the) advice|adhered)\b/i },
  { label: 'clinical-moralising', re: /\b(deficien(t|cy)|unhealthy|bad diet|poor diet|you must\b|you should\b|excessive|harmful)\b/i },
];
export function findUnsafeEffectivenessPhrases(text: string): string[] {
  return BANNED.filter(p => p.re.test(text)).map(p => p.label);
}
export function assertSafeEffectiveness(e: NutritionAdviceEffectiveness): void {
  for (const field of [e.summary, e.why] as const) {
    const hits = findUnsafeEffectivenessPhrases(field);
    if (hits.length > 0) throw new Error(`Unsafe N8 copy "${field}" matched [${hits.join(', ')}]`);
  }
}

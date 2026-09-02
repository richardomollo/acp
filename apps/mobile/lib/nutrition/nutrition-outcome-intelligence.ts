// ACP Intelligence™ — Nutrition N9. Outcome Intelligence: the PURE layer.
//
// N9 moves from "what happened after this one suggestion?" (N8) to "what
// repeatedly appears to fit this user's life over time?". It is LONGITUDINAL
// and OBSERVATIONAL: repeated association, temporal sequence, coaching-
// response recurrence — NEVER causality, treatment effect, or outcome
// attribution (§2). No LLM, no RAG, no durable memory write in this MVP —
// every observation is derived on read from N8 episodes + weekly fitness
// evidence + the user's preferred training days.
//
// Every function here is a pure function of its arguments.

import type { EffectivenessDirection } from './nutrition-advice-effectiveness.ts';
import type { ComparisonState } from './nutrition-reference-engine.ts';

// ── Confidence — reuses coaching_memory's vocabulary (§10) ───────────────
export type OutcomeConfidence = 'emerging' | 'moderate' | 'strong';

// Minimum repeated evidence (§9). Aligned with N8's AFTER_GATES (2/4/6) and
// coaching_memory's confidence tiers.
export const OUTCOME_GATES = {
  minEpisodes: 2,          // ≥2 comparable evaluable episodes before mentioning recurrence
  strongEpisodes: 4,       // ≥4 for stronger confidence
  minWeeks: 3,             // ≥3 observed weeks for an emerging weekly pattern
  moderateWeeks: 4,
  strongWeeks: 6,
  /** a week with at least this many completed sessions is a "consistent" week */
  consistentWeekSessions: 3,
  /** fraction of consistent weeks that must show the association to surface it */
  weeklyAssociationShare: 0.6,
  /** the recent-episodes window for contradiction detection (§29/§46) */
  recentEpisodeWindow: 3,
} as const;

// ── Inputs ─────────────────────────────────────────────────────────────

/** One N8 coaching-response episode, already classified by N8's evaluator. */
export interface EpisodeOutcome {
  nutrient: 'proteinG' | 'fibreG';
  shownLocalDate: string;             // YYYY-MM-DD — for recency ordering
  /** null = expired / too little subsequent evidence → NOT evaluable */
  direction: EffectivenessDirection | null;
}

/** One observed plan week, from existing fitness + nutrition evidence. */
export interface OutcomeWeekEvidence {
  weekStart: string;                  // YYYY-MM-DD (Monday)
  completedSessions: number;
  /** of the completed sessions, how many fell on a preferred training weekday */
  completedOnPreferredDays: number;
  /** true when preferred training days are on file (else routine-fit can't be judged) */
  hasPreferredDays: boolean;
  /** that week's protein comparison state (N3), or null when nutrition evidence was insufficient */
  proteinState: ComparisonState | null;
}

// ── Observation model ──────────────────────────────────────────────────
export type OutcomeObservationType =
  | 'repeated_nutrient_response'
  | 'routine_fit'
  | 'training_consistency_nutrition_context';

export interface OutcomeObservation {
  id: string;
  type: OutcomeObservationType;
  confidence: OutcomeConfidence;
  /** deterministic, observational, non-causal */
  title: string;
  body: string;
  /** deterministic "Why am I seeing this?" — the counts + windows (§32) */
  why: string;
}

// ── Helpers ────────────────────────────────────────────────────────────
const NUTRIENT_LABEL: Record<'proteinG' | 'fibreG', string> = { proteinG: 'protein', fibreG: 'fibre' };
const POSITIVE_DIRECTIONS: ReadonlySet<EffectivenessDirection> = new Set(['toward_reference', 'within_reference']);
/** protein "at or moving toward" its reference for a given week */
const PROTEIN_OK_STATES: ReadonlySet<ComparisonState> = new Set(['within_range', 'meets_or_exceeds_reference', 'above_range']);

function count<T>(xs: readonly T[], pred: (x: T) => boolean): number {
  return xs.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
}
function plural(n: number, w: string): string { return n === 1 ? w : `${w}s`; }

// ── Local-date week bucketing (Monday-start, matches fitness_plans) ─────
const DAY_MS = 86_400_000;
function utcOf(localDate: string): number {
  return Date.UTC(+localDate.slice(0, 4), +localDate.slice(5, 7) - 1, +localDate.slice(8, 10));
}
/** The Monday (YYYY-MM-DD) of the ISO week containing `localDate`. Pure — no
 *  timezone, string in / string out. */
export function mondayOf(localDate: string): string {
  const t = utcOf(localDate);
  const dow = new Date(t).getUTCDay();        // 0 = Sun … 6 = Sat
  const backToMonday = (dow + 6) % 7;         // Mon → 0, Sun → 6
  return new Date(t - backToMonday * DAY_MS).toISOString().slice(0, 10);
}
/** lowercase weekday name for `localDate`, matching fitness_profile.preferred_training_days. */
export function weekdayName(localDate: string): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(utcOf(localDate)).getUTCDay()];
}

// ── A/B — repeated nutrient coaching response (§8/§23/§39/§44/§45/§46) ───

export interface NutrientResponseAggregate {
  nutrient: 'proteinG' | 'fibreG';
  episodes: number;                   // total episodes for this nutrient
  evaluable: number;                  // episodes with a usable direction (excludes insufficient_evidence)
  positive: number;                   // toward_reference + within_reference
  noClearChange: number;              // no_clear_change + above_reference
  away: number;
  /** true when the most recent `recentEpisodeWindow` evaluable episodes are all non-positive
   *  while earlier ones were positive — a contradiction that must weaken/reframe (§29/§46) */
  recentContradiction: boolean;
}

const USABLE_DIRECTIONS: ReadonlySet<EffectivenessDirection> = new Set([
  'toward_reference', 'within_reference', 'above_reference', 'no_clear_change', 'away_from_reference',
]);

/** Group episodes by nutrient (protein with protein, fibre with fibre — never
 *  merged, never averaged across reference types — §23/§45) and tally the
 *  N8 outcome directions. */
export function aggregateNutrientResponses(episodes: readonly EpisodeOutcome[]): NutrientResponseAggregate[] {
  const out: NutrientResponseAggregate[] = [];
  for (const nutrient of ['proteinG', 'fibreG'] as const) {
    const forNutrient = episodes
      .filter(e => e.nutrient === nutrient)
      .slice()
      .sort((a, b) => a.shownLocalDate.localeCompare(b.shownLocalDate)); // oldest → newest
    if (forNutrient.length === 0) continue;

    const evaluableEps = forNutrient.filter(
      (e): e is EpisodeOutcome & { direction: EffectivenessDirection } =>
        e.direction != null && USABLE_DIRECTIONS.has(e.direction),
    );
    const positive = count(evaluableEps, e => POSITIVE_DIRECTIONS.has(e.direction));
    const away = count(evaluableEps, e => e.direction === 'away_from_reference');
    const noClearChange = evaluableEps.length - positive - away;

    // Contradiction: recent window all non-positive, but the earlier ones weren't (§46).
    const w = OUTCOME_GATES.recentEpisodeWindow;
    const recent = evaluableEps.slice(-w);
    const earlier = evaluableEps.slice(0, -w);
    const recentContradiction =
      evaluableEps.length >= w + 2 &&
      recent.length === w &&
      recent.every(e => !POSITIVE_DIRECTIONS.has(e.direction)) &&
      count(earlier, e => POSITIVE_DIRECTIONS.has(e.direction)) >= 2;

    out.push({
      nutrient,
      episodes: forNutrient.length,
      evaluable: evaluableEps.length,
      positive,
      noClearChange,
      away,
      recentContradiction,
    });
  }
  return out;
}

function nutrientResponseConfidence(a: NutrientResponseAggregate): OutcomeConfidence {
  if (a.recentContradiction) return 'emerging';                 // recent evidence contradicts — never strong (§29)
  if (a.evaluable >= OUTCOME_GATES.strongEpisodes && a.positive >= a.evaluable - 1) return 'strong';
  if (a.evaluable >= OUTCOME_GATES.strongEpisodes) return 'moderate';
  return 'emerging';
}

function nutrientResponseObservation(a: NutrientResponseAggregate): OutcomeObservation | null {
  if (a.evaluable < OUTCOME_GATES.minEpisodes) return null;     // repetition required (§9/§43)
  const n = NUTRIENT_LABEL[a.nutrient];
  const confidence = nutrientResponseConfidence(a);

  // Neutral reframing when recent evidence has stopped moving (§30/§46) —
  // never "the suggestions aren't working".
  const body = a.recentContradiction
    ? `Logged ${n} has stayed fairly similar across the most recent ${n}-coaching periods, after moving toward the reference range in earlier ones.`
    : `In ${a.positive} of ${a.evaluable} evaluable ${n}-coaching ${plural(a.evaluable, 'episode')}, subsequent logged ${n} moved toward or into the reference range.`;

  const why = `${n[0].toUpperCase()}${n.slice(1)}-focused coaching appeared in ${a.episodes} ${plural(a.episodes, 'episode')}; ${a.evaluable} had enough subsequent logged days to evaluate. Of those, ${a.positive} moved toward or into the reference range, ${a.noClearChange} stayed similar or already sat above it${a.away > 0 ? `, and ${a.away} moved lower` : ''}. This counts what was logged after each suggestion — it is a sequence in time, not a measure of cause and effect.`;

  return {
    id: `repeated_nutrient_response-${a.nutrient}`,
    type: 'repeated_nutrient_response',
    confidence,
    title: a.nutrient === 'proteinG' ? 'Protein' : 'Fibre',
    body,
    why,
  };
}

// ── C — routine fit (§40/§48) ──────────────────────────────────────────

export function routineFitObservation(weeks: readonly OutcomeWeekEvidence[]): OutcomeObservation | null {
  const withPrefs = weeks.filter(w => w.hasPreferredDays);
  const consistent = withPrefs.filter(w => w.completedSessions >= OUTCOME_GATES.consistentWeekSessions);
  if (consistent.length < OUTCOME_GATES.minWeeks) return null;  // too little fitness history (§47)

  const aligned = consistent.filter(w => w.completedOnPreferredDays > w.completedSessions / 2);
  const share = aligned.length / consistent.length;
  if (share < OUTCOME_GATES.weeklyAssociationShare) return null; // no clear alignment (§48)

  const confidence: OutcomeConfidence =
    consistent.length >= OUTCOME_GATES.strongWeeks ? 'strong'
    : consistent.length >= OUTCOME_GATES.moderateWeeks ? 'moderate'
    : 'emerging';

  return {
    id: 'routine_fit',
    type: 'routine_fit',
    confidence,
    title: 'Your training routine',
    body: 'Your most consistent recent weeks have largely matched your preferred training days.',
    why: `Across ${withPrefs.length} observed ${plural(withPrefs.length, 'week')}, ${consistent.length} had at least ${OUTCOME_GATES.consistentWeekSessions} completed sessions. In ${aligned.length} of those ${consistent.length}, most completed sessions fell on the weekdays you said you prefer to train. This is an observed alignment, not a rule ACP has applied.`,
  };
}

// ── A — training consistency × nutrition context (§11A) ────────────────

export function trainingNutritionContextObservation(weeks: readonly OutcomeWeekEvidence[]): OutcomeObservation | null {
  const withNutrition = weeks.filter(w => w.proteinState != null);
  if (withNutrition.length < OUTCOME_GATES.minWeeks) return null;

  const consistent = withNutrition.filter(w => w.completedSessions >= OUTCOME_GATES.consistentWeekSessions);
  const lessConsistent = withNutrition.filter(w => w.completedSessions < OUTCOME_GATES.consistentWeekSessions);
  if (consistent.length < 2 || lessConsistent.length < 1) return null; // need a contrast (§7)

  const consistentProteinOk = count(consistent, w => PROTEIN_OK_STATES.has(w.proteinState!));
  const share = consistentProteinOk / consistent.length;
  if (share < OUTCOME_GATES.weeklyAssociationShare) return null;

  const confidence: OutcomeConfidence =
    withNutrition.length >= OUTCOME_GATES.strongWeeks ? 'moderate' : 'emerging'; // this cross-domain link stays cautious

  return {
    id: 'training_consistency_nutrition_context',
    type: 'training_consistency_nutrition_context',
    confidence,
    title: 'Training and protein',
    body: 'Across your recent weeks, your strongest training-consistency weeks have also tended to include protein at or closer to its reference.',
    why: `Of ${withNutrition.length} observed weeks with enough nutrition evidence, ${consistent.length} had at least ${OUTCOME_GATES.consistentWeekSessions} completed sessions. In ${consistentProteinOk} of those ${consistent.length}, that week's logged protein was within, above, or below its reference range (not clearly short). These two patterns appeared over the same weeks — neither is shown to cause the other.`,
  };
}

// ── Top-level build (§11 — deliberately small, max 3) ──────────────────

export interface BuildOutcomeInput {
  episodes: readonly EpisodeOutcome[];
  weeks: readonly OutcomeWeekEvidence[];
}

export function buildOutcomeObservations(input: BuildOutcomeInput): OutcomeObservation[] {
  const out: OutcomeObservation[] = [];
  for (const agg of aggregateNutrientResponses(input.episodes)) {
    const o = nutrientResponseObservation(agg);
    if (o) out.push(o);
  }
  const routine = routineFitObservation(input.weeks);
  if (routine) out.push(routine);
  const context = trainingNutritionContextObservation(input.weeks);
  if (context) out.push(context);

  // Small surface: nutrient-response first (the mandatory N9 signal), then
  // routine fit, then the cautious cross-domain context. Cap at 3 (§11/§31).
  const priority: OutcomeObservationType[] = [
    'repeated_nutrient_response', 'routine_fit', 'training_consistency_nutrition_context',
  ];
  return out
    .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))
    .slice(0, 3);
}

// ── Safety: defence-in-depth string check (§2/§50) ────────────────────
const BANNED: { label: string; re: RegExp }[] = [
  { label: 'causal', re: /\b(caused|led to|resulted in|because of (your|acp)|drove|made you|thanks to|responsible for|due to (your|the) (advice|training|protein|nutrition))\b/i },
  { label: 'efficacy-verdict', re: /\b(works for you|it works|effective|ineffective|proven|proof that|guaranteed)\b/i },
  { label: 'outcome-attribution', re: /\b(helped you lose|improved your weight|improved your body|burned fat|lost weight because|training (drove|caused))\b/i },
  { label: 'clinical-moralising', re: /\b(deficien(t|cy)|unhealthy|bad diet|poor diet|you must\b|you should\b)\b/i },
];
export function findUnsafeOutcomePhrases(text: string): string[] {
  return BANNED.filter(p => p.re.test(text)).map(p => p.label);
}
export function assertSafeOutcomeObservation(o: OutcomeObservation): void {
  for (const field of [o.title, o.body, o.why] as const) {
    const hits = findUnsafeOutcomePhrases(field);
    if (hits.length > 0) throw new Error(`Unsafe N9 copy "${field}" matched [${hits.join(', ')}]`);
  }
}

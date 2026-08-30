// Day 6 — ACP Intelligence™ longitudinal coaching memory. Pure, framework-free
// (no Next.js/Supabase imports here — same split as adaptation.ts/assessment.ts).
//
// Non-negotiable principle this whole module protects: build a deterministic
// evidence layer FIRST. Nothing here is an LLM call — every count, rate,
// confidence tier and user_message is computed from real fitness_plans/
// plan_activity_completions rows. This is NOT chat/vector/RAG memory.
import type { StartingPlanActivity, NutritionFocusType, SupportType } from '../onboarding-assessment/assessment.ts';

export interface LongitudinalPlanInput {
  planId: string;
  weekStartDate: string;
  weekEndDate: string;
  activities: StartingPlanActivity[];
  nutritionFocusType: NutritionFocusType | null;
  supportTypes: SupportType[];
}

export interface LongitudinalCompletionInput {
  planId: string;
  activityIndex: number;
}

// ── Day 6.5 — Outcome Intelligence: a second evidence stream (what changed)
// alongside the existing behavioural one (what the user did). Reuses the
// exact same rolling window/weeks — never a separate window/date system.
export type OutcomeMetric = 'weight' | 'body_fat' | 'muscle_mass' | 'waist';

export interface MeasurementInput {
  loggedAt: string; // ISO timestamp
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  waistCm: number | null;
}

export type OutcomeDirection = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

export interface MeasurementTrend {
  first: number;
  latest: number;
  change: number;
  direction: OutcomeDirection;
  observations: number;
}

export interface OutcomesSummary {
  measurements_available: number;
  weight?: MeasurementTrend;
  body_fat?: MeasurementTrend;
  muscle_mass?: MeasurementTrend;
  waist?: MeasurementTrend;
}

// 'body_composition_progressing' is only ever used for muscle_mass moving
// toward a build-strength goal — kept distinct from 'outcome_progressing'
// (weight/waist/body_fat) purely for clearer downstream copy, not different
// evidence rules.
export type OutcomePatternType =
  | 'outcome_progressing' | 'outcome_stable' | 'outcome_away_from_target' | 'body_composition_progressing';

export interface OutcomePattern {
  type: OutcomePatternType;
  metric: OutcomeMetric;
  confidence: Confidence;
  evidence: {
    first: number; latest: number; change: number; observations: number;
    window_start: string; window_end: string; goal: string | null;
  };
  user_message: string;
}

export type PatternType =
  | 'category_success' | 'category_difficulty'
  | 'day_success' | 'day_difficulty'
  | 'duration_success' | 'duration_difficulty';

export type Confidence = 'emerging' | 'moderate' | 'strong';

export interface CoachingPattern {
  type: PatternType;
  subject: string;
  confidence: Confidence;
  evidence: { planned: number; completed: number; rate: number; weeks: number };
  user_message: string;
}

export interface PersistenceFact {
  type: 'nutrition_focus_persistence' | 'support_opportunity_persistence';
  subject: string;
  confidence: Confidence;
  evidence: { weeks: number };
  user_message: string;
}

export interface LongitudinalSummary {
  window: { weeks_available: number; weeks_used: number; start_date: string; end_date: string };
  overall: { planned_sessions: number; completed_sessions: number; completion_rate: number; planned_minutes: number; completed_minutes: number };
  by_category: { category: string; planned: number; completed: number; completion_rate: number }[];
  by_day_of_week: { day: string; planned: number; completed: number; completion_rate: number }[];
  by_duration_band: { band: 'short' | 'medium' | 'long'; planned: number; completed: number; completion_rate: number }[];
  recent_trend: { direction: 'improving' | 'stable' | 'declining' | 'insufficient_data'; evidence: string };
  patterns: CoachingPattern[];
  persistence_facts: PersistenceFact[];
  outcomes: OutcomesSummary;
  outcome_patterns: OutcomePattern[];
}

// ── Thresholds (Day 6 report section G) — starting values, chosen from the
// spec's own guidance and verified against every scenario in section 38. ────
const ROLLING_WINDOW_WEEKS = 4;      // "rolling 4 completed weeks when available"

const EMERGING_MIN_OBSERVATIONS = 2; // below this: no pattern at all, regardless of rate (Scenario C)
const MODERATE_MIN_OBSERVATIONS = 3;
const MODERATE_MIN_WEEKS = 2;
const STRONG_MIN_OBSERVATIONS = 4;
const STRONG_MIN_WEEKS = 3;

const SUCCESS_RATE_THRESHOLD = 0.75;
const DIFFICULTY_RATE_THRESHOLD = 0.40; // strictly between the two thresholds: ambiguous, no conclusion (Scenario F)

const TREND_MIN_WEEKS = 2;
const TREND_THRESHOLD_PP = 0.15; // 15 percentage points, applied to the second-half-vs-first-half average (Scenarios G/H)

const PERSISTENCE_MODERATE_WEEKS = 3;
const PERSISTENCE_STRONG_WEEKS = 4;

// ── Outcome Intelligence thresholds (section 9/10) ──────────────────────────
// "1 observation -> baseline only, 2 -> direction may be emerging,
// 3+ -> trend may become meaningful" — mirrors the behavioural
// emerging/moderate/strong tiers exactly, just on observation count alone
// (an outcome pattern has no separate "weeks" axis the way a behavioural
// bucket does; each observation already IS one week, per section 8).
const OUTCOME_EMERGING_MIN_OBSERVATIONS = 2;
const OUTCOME_MODERATE_MIN_OBSERVATIONS = 3;
const OUTCOME_STRONG_MIN_OBSERVATIONS = 4;

// Conservative "is this just noise" epsilons, in each metric's own unit —
// deliberately simple fixed thresholds (no ML, section 10), sized so
// ordinary day-to-day fluctuation (hydration, food, measurement variance)
// doesn't read as a real trend.
const OUTCOME_EPSILON: Record<OutcomeMetric, number> = {
  weight: 0.5,       // kg
  body_fat: 0.5,     // percentage points
  muscle_mass: 0.3,  // kg
  waist: 1,          // cm
};

const OUTCOME_METRIC_LABEL: Record<OutcomeMetric, string> = {
  weight: 'Your weight', body_fat: 'Your body fat', muscle_mass: 'Your muscle mass', waist: 'Your waist measurement',
};

function durationBand(minutes: number): 'short' | 'medium' | 'long' {
  if (minutes <= 30) return 'short';
  if (minutes <= 60) return 'medium';
  return 'long';
}

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'Strength', cardio: 'Cardio', recovery: 'Recovery', mobility: 'Mobility', sport: 'Sport',
};
const DAY_LABEL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};
const DURATION_LABEL: Record<string, string> = { short: 'Shorter', medium: 'Medium-length', long: 'Longer' };

function pct(rate: number): number {
  return Math.round(rate * 100);
}

interface Bucket { planned: number; completed: number; weeks: Set<string> }
function newBucket(): Bucket {
  return { planned: 0, completed: 0, weeks: new Set() };
}

/**
 * Evidence-quantity gate first (emerging/moderate/strong, or null = no
 * pattern at all), then rate classification (success/difficulty/ambiguous) —
 * both must clear for a pattern to exist. Observational language only; the
 * caller attaches type/subject/user_message.
 */
function classify(bucket: Bucket): { confidence: Confidence; rate: number } | null {
  if (bucket.planned < EMERGING_MIN_OBSERVATIONS) return null;
  const rate = bucket.completed / bucket.planned;
  if (rate > DIFFICULTY_RATE_THRESHOLD && rate < SUCCESS_RATE_THRESHOLD) return null; // ambiguous — avoid overinterpreting (section 10)

  const weeks = bucket.weeks.size;
  let confidence: Confidence = 'emerging';
  if (bucket.planned >= MODERATE_MIN_OBSERVATIONS && weeks >= MODERATE_MIN_WEEKS) confidence = 'moderate';
  if (bucket.planned >= STRONG_MIN_OBSERVATIONS && weeks >= STRONG_MIN_WEEKS) confidence = 'strong';
  return { confidence, rate };
}

function userMessage(type: PatternType, subject: string): string {
  switch (type) {
    case 'category_success': return `${CATEGORY_LABEL[subject] ?? subject} has been one of your most consistent activities.`;
    case 'category_difficulty': return `${CATEGORY_LABEL[subject] ?? subject} has been harder to maintain recently.`;
    case 'day_success': return `${DAY_LABEL[subject] ?? subject} sessions have been a reliable training day.`;
    case 'day_difficulty': return `${DAY_LABEL[subject] ?? subject} sessions have been harder to fit into your routine.`;
    case 'duration_success': return `${DURATION_LABEL[subject] ?? subject} sessions have been easier to maintain.`;
    case 'duration_difficulty': return `${DURATION_LABEL[subject] ?? subject} sessions have been harder to fit into your routine.`;
  }
}

const OUTCOME_FIELD: Record<OutcomeMetric, keyof MeasurementInput> = {
  weight: 'weightKg', body_fat: 'bodyFatPct', muscle_mass: 'muscleMassKg', waist: 'waistCm',
};

/**
 * Section 8 — normalizes arbitrary logging frequency to exactly one
 * observation per plan week: the LATEST measurement whose date falls within
 * that week. A week with zero measurements simply contributes nothing
 * (never synthesized/interpolated) — same "missing = absent" rule as
 * behavioural buckets. Reuses the exact same `usedPlans` window, so outcome
 * and behavioural evidence are always describing the same weeks.
 */
function weeklyOutcomeObservations(measurements: MeasurementInput[], usedPlans: LongitudinalPlanInput[], metric: OutcomeMetric): number[] {
  const field = OUTCOME_FIELD[metric];
  const observations: number[] = [];
  for (const plan of usedPlans) {
    let latest: MeasurementInput | null = null;
    for (const m of measurements) {
      const value = m[field];
      if (value == null) continue; // missing != 0 (section 36)
      const loggedDate = m.loggedAt.slice(0, 10);
      if (loggedDate < plan.weekStartDate || loggedDate > plan.weekEndDate) continue;
      if (!latest || m.loggedAt > latest.loggedAt) latest = m;
    }
    if (latest) observations.push(latest[field] as number);
  }
  return observations;
}

/** Section 9/10 — 1 observation is a baseline only (insufficient_data), never a direction; below the epsilon for its metric, a real multi-observation change still reads as 'stable'. */
function computeMeasurementTrend(observations: number[], metric: OutcomeMetric): MeasurementTrend | null {
  if (observations.length === 0) return null;
  const first = observations[0];
  const latest = observations[observations.length - 1];
  if (observations.length === 1) {
    return { first, latest, change: 0, direction: 'insufficient_data', observations: 1 };
  }
  const change = Math.round((latest - first) * 100) / 100;
  const direction: OutcomeDirection = Math.abs(change) < OUTCOME_EPSILON[metric]
    ? 'stable'
    : change > 0 ? 'increasing' : 'decreasing';
  return { first, latest, change, direction, observations: observations.length };
}

// Sections 11-15 — outcome relevance depends on the user's primary goal;
// "weight down = good" is never applied universally. Only the metric/goal
// combinations named in the spec produce a goal-aware read at all — any
// other combination (including every metric under 'reduce_stress', section
// 15) is deliberately left neutral, which means no pattern is ever created
// for it (see classifyOutcome below).
function goalAlignment(
  metric: OutcomeMetric, direction: OutcomeDirection, goal: string | null,
  targetWeightKg: number | null, firstWeight: number | null,
): 'aligned' | 'away' | 'neutral' {
  if (direction === 'insufficient_data') return 'neutral';

  // Weight is evaluated against the user's own stated target when one
  // exists (section 13: "weight trend relative to stated target") — this
  // is what correctly handles a weight-GAIN target (no such literal
  // PrimaryGoal enum value exists; a higher goal_weight_kg than starting
  // weight IS the signal) without hardcoding "increasing = good" globally.
  if (metric === 'weight' && targetWeightKg != null && firstWeight != null && targetWeightKg !== firstWeight) {
    const wantsDecrease = targetWeightKg < firstWeight;
    if (direction === 'stable') return 'neutral';
    if (wantsDecrease) return direction === 'decreasing' ? 'aligned' : 'away';
    return direction === 'increasing' ? 'aligned' : 'away';
  }

  if (goal === 'lose_weight' && (metric === 'weight' || metric === 'waist' || metric === 'body_fat')) {
    if (direction === 'decreasing') return 'aligned';
    if (direction === 'increasing') return 'away';
    return 'neutral'; // stable — not a failure, just not "progressing"; still surfaced via outcome_stable below
  }
  if (goal === 'build_muscle' && metric === 'muscle_mass') {
    if (direction === 'increasing') return 'aligned';
    if (direction === 'decreasing') return 'away';
    return 'neutral';
  }
  if (goal === 'maintain_weight' && metric === 'weight') {
    if (direction === 'stable') return 'aligned';
    if (direction === 'increasing' || direction === 'decreasing') return 'away';
  }
  // 'reduce_stress' (section 15) and every unlisted metric/goal combination:
  // never goal-aware, on purpose — no pattern is generated for it.
  return 'neutral';
}

function outcomeUserMessage(type: OutcomePatternType, metric: OutcomeMetric): string {
  const label = OUTCOME_METRIC_LABEL[metric];
  switch (type) {
    case 'outcome_progressing': return `${label} has been moving toward your goal over your recent check-ins.`;
    case 'body_composition_progressing': return `${label} has been increasing over your recent check-ins.`;
    case 'outcome_stable': return `${label} has stayed steady over your recent check-ins.`;
    case 'outcome_away_from_target': return `${label} has been moving away from your intended direction over your recent check-ins.`;
  }
}

/**
 * Only creates a pattern when there's a goal-aware, evidence-backed
 * conclusion to draw (section 20) — 'reduce_stress' and any metric/goal
 * combination not explicitly named in sections 11-15 never produces one,
 * regardless of how clean the raw trend looks (section 11: never "weight
 * down = good" universally).
 */
function classifyOutcome(
  metric: OutcomeMetric, trend: MeasurementTrend, goal: string | null,
  windowStart: string, windowEnd: string, targetWeightKg: number | null,
): OutcomePattern | null {
  if (trend.observations < OUTCOME_EMERGING_MIN_OBSERVATIONS) return null;
  if (goal === 'reduce_stress') return null; // section 15 — never a high-priority weight/body-comp pattern for this goal

  const alignment = goalAlignment(metric, trend.direction, goal, targetWeightKg, trend.first);
  let type: OutcomePatternType | null = null;
  if (trend.direction === 'stable') {
    type = alignment === 'away' ? 'outcome_away_from_target' : 'outcome_stable';
  } else if (alignment === 'aligned') {
    type = metric === 'muscle_mass' ? 'body_composition_progressing' : 'outcome_progressing';
  } else if (alignment === 'away') {
    type = 'outcome_away_from_target';
  }
  if (!type) return null; // neutral/unrecognized goal — no conclusion drawn

  const confidence: Confidence = trend.observations >= OUTCOME_STRONG_MIN_OBSERVATIONS ? 'strong'
    : trend.observations >= OUTCOME_MODERATE_MIN_OBSERVATIONS ? 'moderate' : 'emerging';

  return {
    type, metric, confidence,
    evidence: { first: trend.first, latest: trend.latest, change: trend.change, observations: trend.observations, window_start: windowStart, window_end: windowEnd, goal },
    user_message: outcomeUserMessage(type, metric),
  };
}

/**
 * Deterministic multi-week aggregation. `plans` need not be pre-filtered —
 * only plans whose week has genuinely ended (`weekEndDate < now`) are ever
 * considered (section 37: no partial/future current-week activities count
 * as missed). A missing week (no row for it) is simply absent, never
 * synthesized as 0% (section 36). Completion counting reuses Day 4 semantics
 * exactly: a completion row's existence is already-verified evidence, deduped
 * by activityIndex per plan (same as getCompletionProgress).
 */
export function buildLongitudinalSummary(
  plans: LongitudinalPlanInput[],
  completions: LongitudinalCompletionInput[],
  now: Date,
  measurements: MeasurementInput[] = [],
  goal: string | null = null,
  targetWeightKg: number | null = null,
): LongitudinalSummary {
  const nowIso = now.toISOString().split('T')[0];

  const completedPlans = plans
    .filter(p => p.weekEndDate < nowIso)
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  const weeksAvailable = completedPlans.length;
  const weeksUsed = Math.min(weeksAvailable, ROLLING_WINDOW_WEEKS);
  const usedPlans = completedPlans.slice(-weeksUsed);

  const completedByPlan = new Map<string, Set<number>>();
  for (const c of completions) {
    if (!completedByPlan.has(c.planId)) completedByPlan.set(c.planId, new Set());
    completedByPlan.get(c.planId)!.add(c.activityIndex);
  }

  const overall = { planned_sessions: 0, completed_sessions: 0, planned_minutes: 0, completed_minutes: 0 };
  const categoryBuckets = new Map<string, Bucket>();
  const dayBuckets = new Map<string, Bucket>();
  const durationBuckets = new Map<string, Bucket>();
  const weeklyRates: number[] = [];

  for (const plan of usedPlans) {
    const doneIndexes = completedByPlan.get(plan.planId) ?? new Set<number>();
    let weekPlanned = 0;
    let weekCompleted = 0;

    plan.activities.forEach((activity, index) => {
      const isDone = doneIndexes.has(index);
      weekPlanned += 1;
      if (isDone) weekCompleted += 1;

      overall.planned_sessions += 1;
      overall.planned_minutes += activity.duration_minutes;
      if (isDone) {
        overall.completed_sessions += 1;
        overall.completed_minutes += activity.duration_minutes;
      }

      const cat = categoryBuckets.get(activity.category) ?? newBucket();
      cat.planned += 1; if (isDone) cat.completed += 1; cat.weeks.add(plan.planId);
      categoryBuckets.set(activity.category, cat);

      const day = activity.day.toLowerCase();
      const dayB = dayBuckets.get(day) ?? newBucket();
      dayB.planned += 1; if (isDone) dayB.completed += 1; dayB.weeks.add(plan.planId);
      dayBuckets.set(day, dayB);

      const band = durationBand(activity.duration_minutes);
      const durB = durationBuckets.get(band) ?? newBucket();
      durB.planned += 1; if (isDone) durB.completed += 1; durB.weeks.add(plan.planId);
      durationBuckets.set(band, durB);
    });

    weeklyRates.push(weekPlanned > 0 ? weekCompleted / weekPlanned : 0);
  }

  const rate = (b: Bucket) => (b.planned > 0 ? Math.round((b.completed / b.planned) * 1000) / 1000 : 0);

  const by_category = Array.from(categoryBuckets.entries()).map(([category, b]) => (
    { category, planned: b.planned, completed: b.completed, completion_rate: rate(b) }
  ));
  const by_day_of_week = Array.from(dayBuckets.entries()).map(([day, b]) => (
    { day, planned: b.planned, completed: b.completed, completion_rate: rate(b) }
  ));
  const by_duration_band = Array.from(durationBuckets.entries()).map(([band, b]) => (
    { band: band as 'short' | 'medium' | 'long', planned: b.planned, completed: b.completed, completion_rate: rate(b) }
  ));

  let recent_trend: LongitudinalSummary['recent_trend'];
  if (weeklyRates.length < TREND_MIN_WEEKS) {
    recent_trend = { direction: 'insufficient_data', evidence: 'Not enough completed weeks yet to show a trend.' };
  } else {
    const mid = Math.floor(weeklyRates.length / 2);
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const firstAvg = avg(weeklyRates.slice(0, mid));
    const secondAvg = avg(weeklyRates.slice(mid));
    const diff = secondAvg - firstAvg;
    const direction = diff >= TREND_THRESHOLD_PP ? 'improving' : diff <= -TREND_THRESHOLD_PP ? 'declining' : 'stable';
    recent_trend = {
      direction,
      evidence: `Completion averaged ${pct(firstAvg)}% earlier and ${pct(secondAvg)}% more recently across your last ${weeksUsed} weeks.`,
    };
  }

  const patterns: CoachingPattern[] = [];
  const pushPattern = (axis: 'category' | 'day' | 'duration', subject: string, bucket: Bucket) => {
    const result = classify(bucket);
    if (!result) return;
    const type = (result.rate >= SUCCESS_RATE_THRESHOLD ? `${axis}_success` : `${axis}_difficulty`) as PatternType;
    patterns.push({
      type, subject, confidence: result.confidence,
      evidence: { planned: bucket.planned, completed: bucket.completed, rate: Math.round(result.rate * 1000) / 1000, weeks: bucket.weeks.size },
      user_message: userMessage(type, subject),
    });
  };
  for (const [subject, bucket] of categoryBuckets) pushPattern('category', subject, bucket);
  for (const [subject, bucket] of dayBuckets) pushPattern('day', subject, bucket);
  for (const [subject, bucket] of durationBuckets) pushPattern('duration', subject, bucket);

  // Persistence facts (sections 32-33) — stability only, never adherence.
  // Streak = consecutive most-recent used weeks sharing the same value.
  const persistence_facts: PersistenceFact[] = [];
  if (usedPlans.length > 0) {
    const latest = usedPlans[usedPlans.length - 1];

    if (latest.nutritionFocusType) {
      let streak = 0;
      for (let i = usedPlans.length - 1; i >= 0; i--) {
        if (usedPlans[i].nutritionFocusType === latest.nutritionFocusType) streak += 1; else break;
      }
      if (streak >= EMERGING_MIN_OBSERVATIONS) {
        const confidence: Confidence = streak >= PERSISTENCE_STRONG_WEEKS ? 'strong' : streak >= PERSISTENCE_MODERATE_WEEKS ? 'moderate' : 'emerging';
        const label = latest.nutritionFocusType.replace(/_/g, ' ');
        persistence_facts.push({
          type: 'nutrition_focus_persistence', subject: latest.nutritionFocusType, confidence,
          evidence: { weeks: streak },
          user_message: `${label.charAt(0).toUpperCase()}${label.slice(1)} has remained your nutrition focus for ${streak} weeks.`,
        });
      }
    }

    const latestSupportTypes = new Set(latest.supportTypes);
    for (const supportType of latestSupportTypes) {
      let streak = 0;
      for (let i = usedPlans.length - 1; i >= 0; i--) {
        if (usedPlans[i].supportTypes.includes(supportType)) streak += 1; else break;
      }
      if (streak >= EMERGING_MIN_OBSERVATIONS) {
        const confidence: Confidence = streak >= PERSISTENCE_STRONG_WEEKS ? 'strong' : streak >= PERSISTENCE_MODERATE_WEEKS ? 'moderate' : 'emerging';
        const label = supportType === 'personal_trainer' ? 'Personal training' : 'Nutrition';
        persistence_facts.push({
          type: 'support_opportunity_persistence', subject: supportType, confidence,
          evidence: { weeks: streak },
          user_message: `${label} support has come up as relevant for ${streak} weeks.`,
        });
      }
    }
  }

  // Outcome Intelligence (Day 6.5) — same usedPlans window as the
  // behavioural aggregation above; never a separate window/date system.
  const windowStart = usedPlans[0]?.weekStartDate ?? '';
  const windowEnd = usedPlans[usedPlans.length - 1]?.weekEndDate ?? '';
  const outcomes: OutcomesSummary = { measurements_available: measurements.length };
  const outcome_patterns: OutcomePattern[] = [];
  (['weight', 'body_fat', 'muscle_mass', 'waist'] as OutcomeMetric[]).forEach(metric => {
    const observations = weeklyOutcomeObservations(measurements, usedPlans, metric);
    const trend = computeMeasurementTrend(observations, metric);
    if (!trend) return;
    outcomes[metric] = trend;
    const pattern = classifyOutcome(metric, trend, goal, windowStart, windowEnd, targetWeightKg);
    if (pattern) outcome_patterns.push(pattern);
  });

  return {
    window: {
      weeks_available: weeksAvailable,
      weeks_used: weeksUsed,
      start_date: usedPlans[0]?.weekStartDate ?? '',
      end_date: usedPlans[usedPlans.length - 1]?.weekEndDate ?? '',
    },
    overall: {
      ...overall,
      completion_rate: overall.planned_sessions > 0 ? Math.round((overall.completed_sessions / overall.planned_sessions) * 1000) / 1000 : 0,
    },
    by_category, by_day_of_week, by_duration_band, recent_trend, patterns, persistence_facts,
    outcomes, outcome_patterns,
  };
}

// ── Coaching-memory sync (sections 15, 18, 19) ──────────────────────────────
export interface CoachingMemoryRow {
  memory_type: string;
  subject: string;
  confidence: Confidence;
  evidence: unknown;
  user_message?: string;
}
export interface MemoryIdentity { memory_type: string; subject: string }

/**
 * Every run recomputes the ENTIRE current window from scratch — nothing is
 * ever appended. `toUpsert` is this run's complete, current truth; any
 * previously-active identity NOT reconfirmed by this run (because its
 * subject flipped success<->difficulty, or became ambiguous, or rolled out
 * of the window) is deactivated. This single rule is what prevents
 * contradictory active memories (section 15) without needing a separate
 * conflict-resolution pass: a subject can only ever produce one type this
 * run, so the "loser" type's old row is simply not in the fresh set.
 */
export function resolveMemorySync(
  summary: LongitudinalSummary,
  existingActive: MemoryIdentity[],
  // Day 9 — additional already-resolved memory rows (execution patterns from
  // execution.ts). Kept as a generic CoachingMemoryRow[] so this module has
  // no dependency on the execution module. Folded into the same
  // upsert-by-identity + deactivate-if-absent lifecycle as every other row.
  extraMemoryRows: CoachingMemoryRow[] = [],
): { toUpsert: CoachingMemoryRow[]; toDeactivate: MemoryIdentity[] } {
  const toUpsert: CoachingMemoryRow[] = [];

  if (summary.window.weeks_used > 0) {
    const overallConfidence: Confidence = summary.window.weeks_used >= 4 ? 'strong' : summary.window.weeks_used >= 2 ? 'moderate' : 'emerging';
    toUpsert.push({
      memory_type: 'overall_summary', subject: 'overall', confidence: overallConfidence,
      evidence: { window: summary.window, overall: summary.overall, trend: summary.recent_trend },
    });
  }

  for (const p of summary.patterns) {
    toUpsert.push({ memory_type: p.type, subject: p.subject, confidence: p.confidence, evidence: p.evidence, user_message: p.user_message });
  }
  for (const f of summary.persistence_facts) {
    toUpsert.push({ memory_type: f.type, subject: f.subject, confidence: f.confidence, evidence: f.evidence, user_message: f.user_message });
  }
  // Outcome patterns (Day 6.5) — one generic memory_type ('outcome_progress')
  // for every metric, with the specific interpretation (progressing/stable/
  // away/body-composition) carried in evidence rather than the type itself.
  // Identity is (outcome_progress, metric), so a later week's different
  // direction for the SAME metric naturally replaces the old row through
  // the exact same upsert-by-identity mechanism (section 22) — no separate
  // conflict-resolution pass needed.
  for (const p of summary.outcome_patterns) {
    toUpsert.push({
      memory_type: 'outcome_progress', subject: p.metric, confidence: p.confidence,
      evidence: { ...p.evidence, direction: p.type }, user_message: p.user_message,
    });
  }

  for (const row of extraMemoryRows) toUpsert.push(row);

  const freshKeys = new Set(toUpsert.map(r => `${r.memory_type}:${r.subject}`));
  const toDeactivate = existingActive.filter(e => !freshKeys.has(`${e.memory_type}:${e.subject}`));

  return { toUpsert, toDeactivate };
}

/** Compact context for the OpenAI prompt/continuity guard — moderate+strong only (section 23/27/45), never the full summary. Never raw client_measurements rows — only the already-computed trend (section 24). */
export function buildCompactLongitudinalContext(summary: LongitudinalSummary): {
  weeks_observed: number;
  patterns: { type: PatternType; subject: string; confidence: Confidence; evidence: string }[];
  outcomes: { type: OutcomePatternType; metric: OutcomeMetric; confidence: Confidence; evidence: string }[];
} {
  return {
    weeks_observed: summary.window.weeks_used,
    patterns: summary.patterns
      .filter(p => p.confidence !== 'emerging')
      .map(p => ({ type: p.type, subject: p.subject, confidence: p.confidence, evidence: `${p.evidence.completed}/${p.evidence.planned} completed` })),
    outcomes: summary.outcome_patterns
      .filter(p => p.confidence !== 'emerging')
      .map(p => ({
        type: p.type, metric: p.metric, confidence: p.confidence,
        evidence: `${p.evidence.first} → ${p.evidence.latest} over ${p.evidence.observations} check-ins`,
      })),
  };
}

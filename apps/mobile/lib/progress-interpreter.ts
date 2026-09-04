// ACP Intelligence™ Day 4 — Progress Interpreter. Combines behavioural,
// performance and outcome progress (plus goal context) into ONE bounded
// insight state with supporting evidence. Observation only — never touches
// the programme (section 13). Every branch below is a documented, ordered
// priority rule, not an arbitrary "vibes" combination, so it stays testable
// and auditable as new personas turn up edge cases.
import type {
  ProgressSnapshot, ProgressInterpretation, ProgressInsightState,
  MetricTrend, ExercisePerformanceTrend,
} from './progress-types.ts';
import { MIN_SESSIONS_FOR_PERFORMANCE_PLATEAU, MIN_MEASUREMENTS_FOR_OUTCOME_PLATEAU, PLATEAU_MIN_SPAN_DAYS } from './progress-calculations.ts';
import { daysBetweenLocal, parseLocalDateOnly } from './workout-execution.ts';

const ADHERENCE_DECLINING_THRESHOLD = 0.6;
const ADHERENCE_STRONG_THRESHOLD = 0.8;
const ADHERENCE_BUILDING_THRESHOLD = 0.5;

// ── Goal-aware outcome reading (section 11) — never a generic "down=good" ───

type OutcomeReading = 'positive' | 'negative' | 'neutral';

const WEIGHT_LOSS_GOALS = new Set(['lose_weight', 'body_recomposition']);
const MAINTENANCE_GOALS = new Set(['maintain_weight']);
// build_muscle, improve_running, and anything else: weight direction alone
// is deliberately read as neutral — ambiguous or secondary to the goal.

function readOutcome(goal: string, metric: string, trend: MetricTrend): OutcomeReading {
  if (trend.direction === 'insufficient_data') return 'neutral';
  if (metric === 'weight') {
    if (WEIGHT_LOSS_GOALS.has(goal)) return trend.direction === 'down' ? 'positive' : trend.direction === 'up' ? 'negative' : 'neutral';
    if (MAINTENANCE_GOALS.has(goal)) return trend.direction === 'stable' ? 'positive' : 'neutral';
    return 'neutral'; // build_muscle, improve_running, etc. — weight alone proves nothing
  }
  if (metric === 'waist' || metric === 'bodyFat') {
    if (WEIGHT_LOSS_GOALS.has(goal)) return trend.direction === 'down' ? 'positive' : trend.direction === 'up' ? 'negative' : 'neutral';
  }
  return 'neutral';
}

function isPlateau(trend: MetricTrend, today: Date): boolean {
  if (trend.direction !== 'stable') return false;
  if (trend.measurementCount < MIN_MEASUREMENTS_FOR_OUTCOME_PLATEAU) return false;
  if (!trend.baselineDate) return false;
  return daysBetweenLocal(parseLocalDateOnly(trend.baselineDate), today) >= PLATEAU_MIN_SPAN_DAYS;
}

function outcomeSentence(metric: string, trend: MetricTrend): string {
  const label = metric === 'weight' ? 'Weight' : metric === 'waist' ? 'Waist' : 'Body fat';
  const unit = metric === 'waist' ? 'cm' : metric === 'bodyFat' ? '%' : 'kg';
  return `${label} trend: ${trend.baseline} → ${trend.latest} ${unit} since ${trend.baselineDate}.`;
}

function performanceSentence(t: ExercisePerformanceTrend): string {
  if (t.metric === 'weight_reps') {
    return `${t.exerciseName} load: ${t.firstLoadKg}kg → ${t.latestLoadKg}kg across ${t.sessionsCompared} sessions.`;
  }
  return `${t.exerciseName} reps: ${t.firstReps} → ${t.latestReps} across ${t.sessionsCompared} sessions.`;
}

export function interpretProgress(snapshot: ProgressSnapshot, today: Date = new Date()): ProgressInterpretation {
  const { behavioural, performance, outcomes, programme, dataQuality } = snapshot;
  const goal = programme?.goal ?? '';

  const recentRate = behavioural.recentPlanned > 0 ? behavioural.recentCompleted / behavioural.recentPlanned : null;
  const overallRate = behavioural.adherenceRate;

  const improvingExercises = performance.exerciseTrends.filter(t => t.direction === 'increased');
  const plateauExercises = performance.exerciseTrends.filter(t => t.direction === 'stable' && t.sessionsCompared >= MIN_SESSIONS_FOR_PERFORMANCE_PLATEAU);
  const consistentActivities = performance.activityTrends.filter(t => t.direction === 'consistent');

  const outcomeEntries: [string, MetricTrend | undefined][] = [['weight', outcomes.weight], ['waist', outcomes.waist], ['bodyFat', outcomes.bodyFat]];
  const readableOutcomes = outcomeEntries
    .filter((e): e is [string, MetricTrend] => !!e[1] && e[1].direction !== 'insufficient_data')
    .map(([metric, trend]) => ({ metric, trend, reading: readOutcome(goal, metric, trend) }));
  const positiveOutcomes = readableOutcomes.filter(o => o.reading === 'positive');
  const plateauOutcomes = readableOutcomes.filter(o => o.reading !== 'positive' && isPlateau(o.trend, today));

  const supporting: string[] = [];
  if (behavioural.plannedWorkouts > 0) {
    supporting.push(`${behavioural.recentCompleted} of your last ${behavioural.recentPlanned} planned workouts completed.`);
  }
  for (const t of improvingExercises.slice(0, 2)) supporting.push(performanceSentence(t));
  for (const a of consistentActivities.slice(0, 1)) supporting.push(`You completed ${a.completedCount} of ${a.plannedCount} planned ${a.label.toLowerCase()} sessions.`);
  for (const o of [...positiveOutcomes, ...plateauOutcomes].slice(0, 2)) supporting.push(outcomeSentence(o.metric, o.trend));

  const hasAnyRealSignal = dataQuality.hasEnoughBehaviouralData || dataQuality.hasEnoughPerformanceData || dataQuality.hasEnoughOutcomeData;

  let state: ProgressInsightState;
  let headline: string;

  // 1. No usable evidence anywhere — never fabricate a trend.
  if (!hasAnyRealSignal) {
    state = 'INSUFFICIENT_DATA';
    headline = "Still establishing your baseline";
    supporting.length = 0;
    supporting.push('Complete a few more workouts and update your measurements so Lana can identify meaningful trends.');
  }
  // 2. A real recent adherence drop always surfaces first — even when an
  //    outcome is improving, declining consistency is the more actionable
  //    fact (Persona C: outcome improving but adherence declining).
  else if (recentRate != null && behavioural.recentPlanned >= 2 && recentRate < ADHERENCE_DECLINING_THRESHOLD) {
    state = 'ADHERENCE_DECLINING';
    headline = 'Your workout consistency has dropped recently';
  }
  // 3. Strong adherence + a positive outcome + (performance improving OR no
  //    performance data to contradict it) — full alignment, the strongest
  //    positive read (Persona A).
  else if (
    ((overallRate != null && overallRate >= ADHERENCE_STRONG_THRESHOLD) || (recentRate != null && recentRate >= ADHERENCE_STRONG_THRESHOLD))
    && positiveOutcomes.length > 0
  ) {
    state = 'ON_TRACK';
    headline = "You're on track";
  }
  // 4. Strong adherence, but the outcome has plateaued despite enough
  //    evidence — if performance is ALSO improving, that's a genuinely mixed
  //    picture (training is working, outcome hasn't caught up yet); if
  //    performance has nothing to show either, the outcome plateau is the
  //    single dominant fact (Persona B).
  else if (
    ((overallRate != null && overallRate >= ADHERENCE_STRONG_THRESHOLD) || (recentRate != null && recentRate >= ADHERENCE_STRONG_THRESHOLD))
    && plateauOutcomes.length > 0
  ) {
    if (improvingExercises.length > 0) {
      state = 'MIXED_PROGRESS';
      headline = 'Your training is consistent, but your outcome has stalled';
    } else {
      state = 'OUTCOME_PLATEAU';
      headline = 'Your outcome has plateaued';
    }
  }
  // 5. No outcome signal to lean on, but performance is genuinely improving.
  else if (improvingExercises.length > 0 || consistentActivities.length > 0) {
    state = 'PERFORMANCE_IMPROVING';
    headline = 'Your performance is improving';
  }
  // 6. A real, evidenced performance plateau with nothing else positive.
  else if (plateauExercises.length > 0 && improvingExercises.length === 0) {
    state = 'PERFORMANCE_PLATEAU';
    headline = 'Your performance has held steady';
  }
  // 7. A positive outcome exists but adherence/performance data doesn't
  //    clearly back it yet — still worth naming, framed around the outcome.
  else if (positiveOutcomes.length > 0) {
    state = 'OUTCOME_IMPROVING';
    headline = 'Your outcome is moving in the right direction';
  }
  // 8. Building a habit — moderate adherence, nothing else to report yet.
  else if ((overallRate != null && overallRate >= ADHERENCE_BUILDING_THRESHOLD) || (recentRate != null && recentRate >= ADHERENCE_BUILDING_THRESHOLD)) {
    state = 'BUILDING_CONSISTENCY';
    headline = "You're building consistency";
  }
  // 9. Some data exists but nothing lines up cleanly enough for any of the above.
  else {
    state = 'MIXED_PROGRESS';
    headline = 'Your progress is mixed right now';
  }

  return { state, headline, supporting };
}

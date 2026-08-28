// ACP Intelligence™ Day 4 — Progress Intelligence domain types. Pure, zero
// dependencies. Deliberately keeps behavioural/performance/outcome as three
// separate structures that are never collapsed into one score — the whole
// point of Day 4 is that ACP can say "consistent but outcome stalled"
// without those two facts fighting for the same number.
export type WorkoutCompletionBucket = 'completed' | 'partial' | 'missed';

export interface BehaviouralProgress {
  plannedWorkouts: number;      // scheduled programme workouts whose day has fully elapsed (today's own workout is excluded — see ProgressService)
  completedWorkouts: number;    // completion_percentage >= COMPLETED_THRESHOLD
  partialWorkouts: number;      // 1..COMPLETED_THRESHOLD-1 %
  missedWorkouts: number;       // no completed session after the scheduled day
  adherenceRate: number | null; // completedWorkouts / plannedWorkouts, 0-1; null if plannedWorkouts === 0
  recentCompleted: number;      // completed among the most recent RECENT_WINDOW eligible workouts
  recentPlanned: number;
  currentStreak: number;        // reuses services/fitnessStats.ts's computeStreak
}

export type TrendDirection = 'increased' | 'decreased' | 'stable' | 'insufficient_data';

export interface ExercisePerformanceTrend {
  exerciseId: string;
  exerciseName: string;
  metric: 'weight_reps' | 'reps_only';
  sessionsCompared: number;
  firstDate: string;
  latestDate: string;
  firstLoadKg: number | null;
  latestLoadKg: number | null;
  firstReps: number | null;
  latestReps: number | null;
  direction: TrendDirection;
}

export type ActivityTrendDirection = 'consistent' | 'inconsistent' | 'insufficient_data';

export interface ActivityTrend {
  workoutType: string;
  label: string;
  plannedCount: number;
  completedCount: number;
  avgActualDurationMinutes: number | null;
  direction: ActivityTrendDirection;
}

export interface PerformanceProgress {
  exerciseTrends: ExercisePerformanceTrend[];
  activityTrends: ActivityTrend[];
}

export type OutcomeDirection = 'down' | 'up' | 'stable' | 'insufficient_data';

export interface MetricTrend {
  metric: string;
  baseline: number | null;
  baselineDate: string | null;
  latest: number | null;
  latestDate: string | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: OutcomeDirection;
  isStale: boolean;
  measurementCount: number;
}

export interface OutcomeProgress {
  weight?: MetricTrend;
  waist?: MetricTrend;
  bodyFat?: MetricTrend;
}

export interface ProgrammeContext {
  goal: string;
  source: string;
  startedAt: string;
}

export interface DataQuality {
  hasEnoughBehaviouralData: boolean;
  hasEnoughPerformanceData: boolean;
  hasEnoughOutcomeData: boolean;
}

export interface ProgressSnapshot {
  period: { start: string; end: string };
  behavioural: BehaviouralProgress;
  performance: PerformanceProgress;
  outcomes: OutcomeProgress;
  programme: ProgrammeContext | null;
  dataQuality: DataQuality;
}

// ── Interpretation ───────────────────────────────────────────────────────────

export type ProgressInsightState =
  | 'ON_TRACK'
  | 'BUILDING_CONSISTENCY'
  | 'PERFORMANCE_IMPROVING'
  | 'OUTCOME_IMPROVING'
  | 'ADHERENCE_DECLINING'
  | 'PERFORMANCE_PLATEAU'
  | 'OUTCOME_PLATEAU'
  | 'MIXED_PROGRESS'
  | 'INSUFFICIENT_DATA';

export interface ProgressInterpretation {
  state: ProgressInsightState;
  headline: string;
  supporting: string[];
}

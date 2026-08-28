// ACP Intelligence™ Day 6 — human-support detection domain types. Pure, zero
// dependencies beyond the existing ProgressSnapshot/adaptation/onboarding
// types this builds directly on top of (Days 3–5's structured coaching data
// — never an LLM judgment call).
import type { ProgressSnapshot } from './progress-types.ts';
import type { ProgrammeSource } from './programme-types.ts';
import type { CheckInDifficulty } from './adaptation-types.ts';

export type HumanSupportTrigger =
  | 'BEGINNER_TECHNIQUE_SUPPORT'
  | 'PROGRESS_PLATEAU'
  | 'REPEATED_LOW_ADHERENCE'
  | 'REPEATED_DIFFICULTY'
  | 'PAIN_REPORTED'
  | 'ACCOUNTABILITY_SUPPORT'
  | 'REPEATED_ADAPTATION'
  // Never emitted by the evaluator directly — substituted over the real
  // underlying trigger when the active programme is trainer-owned, so the
  // member is pointed back to their existing trainer rather than offered a
  // new one (section 17/18).
  | 'TRAINER_REVIEW_RECOMMENDED';

export type HumanSupportSeverity = 'INFO' | 'RECOMMENDED' | 'HIGH';

export interface HumanSupportSignal {
  trigger: HumanSupportTrigger;
  severity: HumanSupportSeverity;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface RecentCheckInSummary {
  weekNumber: number;
  difficulty: CheckInDifficulty;
  painReported: boolean;
}

export interface RecentAdaptationSummary {
  weekNumber: number;
  decisionTypes: string[];
}

export interface HumanSupportEvaluationInput {
  progress: ProgressSnapshot;
  /** Most recent first, small window (Day 5's check-ins). */
  recentCheckIns: RecentCheckInSummary[];
  /** Most recent first, small window (Day 5's adaptation history). */
  recentAdaptations: RecentAdaptationSummary[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  programmeSource: ProgrammeSource | null;
  hasActiveTrainerRelationship: boolean;
}

export interface HumanSupportEvaluation {
  signals: HumanSupportSignal[];
  primary: HumanSupportSignal | null;
  /** True whenever the active programme (or an existing trainer relationship) means "review with your trainer", never "here's a new PT". */
  trainerOwned: boolean;
}

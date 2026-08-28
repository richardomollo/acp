// ACP Intelligence™ Day 5 — Weekly Check-In + Adaptation domain types. Pure,
// zero dependencies except the existing ProgressSnapshot/ProgrammeSource
// types this builds directly on top of.
import type { ProgressSnapshot } from './progress-types.ts';
import type { ProgrammeSource } from './programme-types.ts';

export type CheckInDifficulty = 'easy' | 'about_right' | 'too_difficult';
export type CheckInEnergy = 'low' | 'normal' | 'high';

// The check-in asks only what ACP cannot already infer from ProgressSnapshot
// (section 4) — no workout counts, no "did you improve" questions.
export interface WeeklyCheckIn {
  difficulty: CheckInDifficulty;
  energy: CheckInEnergy;
  painReported: boolean;
  scheduleChanged: boolean;
}

export interface AdaptationProgrammeContext {
  source: ProgrammeSource;
  sessionsPerWeek: number;
  sessionDurationMinutes: number;
  currentWeek: number;
  durationWeeks: number;
  /** The most recent week number ACP already adapted, if any — the over-adaptation guard (section 21). */
  lastAdaptedWeek: number | null;
}

export interface AdaptationContext {
  progress: ProgressSnapshot;
  checkIn: WeeklyCheckIn;
  programme: AdaptationProgrammeContext;
}

export type AdaptationDecisionType =
  | 'KEEP' | 'PROGRESS' | 'REGRESS' | 'SUBSTITUTE' | 'RESCHEDULE'
  | 'CHANGE_VOLUME' | 'CHANGE_INTENSITY' | 'INSUFFICIENT_EVIDENCE';

export interface AdaptationDecision {
  type: AdaptationDecisionType;
  reason: string; // deterministic, template-driven, member-safe wording — never raw enum values shown to the member
}

export interface AdaptationResult {
  decisions: AdaptationDecision[];
  /** true only for ACP_GENERATED — TRAINER_CREATED/TRAINER_MODIFIED always get recommendation-only decisions (section 14). */
  canApplyAutomatically: boolean;
  signalsUsed: Record<string, unknown>;
}

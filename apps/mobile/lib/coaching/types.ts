// ACP Intelligence™ Day 8 — Coaching Experience & Explainability.
//
// Pure, deterministic types for the user-facing coaching/explanation layer.
// This layer CONSUMES the intelligence built in Days 1-7 (assessment,
// weekly adaptation, coaching_memory, outcome intelligence, plan history)
// and turns it into evidence-grounded plain-language coaching. It NEVER
// makes a network call, NEVER runs an LLM, and NEVER surfaces the internal
// adaptation decision label (keep / progress / simplify / rebalance /
// adjust) — Day 7.5E established that label is a diagnostic field whose
// semantics are not reliable for product use.
//
// Every user-facing string produced by this module must be traceable to
// real structured evidence (see CoachingProvenance) — see copy-safety.ts
// for the guard that enforces this in tests.

import type { ActivityCategory } from '../ai-assessment.ts';

// ── Evidence & provenance ────────────────────────────────────────────────────

/**
 * Where a coaching statement comes from. Priority order (section 8):
 *   1 behaviour  — this user's actual completion/adherence
 *   2 plan_change — an actual, deterministic difference between two plans
 *   3 outcome     — recorded measurement trend (outcome intelligence)
 *   4 memory      — a coaching_memory pattern (moderate/strong only)
 *   5 profile     — goal / preferences / barriers the user themselves gave
 *   6 principle   — generic coaching principle (lowest; never overrides 1-5)
 */
export type CoachingEvidenceSource =
  | 'behaviour'
  | 'plan_change'
  | 'outcome'
  | 'memory'
  | 'profile'
  | 'principle';

/**
 * A dev/test-only provenance record attached to every generated statement.
 * NEVER rendered to users, NEVER logged with raw measurement values.
 */
export interface CoachingProvenance {
  source: CoachingEvidenceSource;
  /** A stable, non-sensitive detail key, e.g. "completion", "minutes_delta", "goal". */
  detail: string;
  /** Small, non-sensitive numbers only (counts, deltas) — never a weight/bodyfat value. */
  values?: Record<string, number | string | boolean>;
}

export interface CoachingEvidence {
  /** Short factual line, e.g. "You completed 3 of 4 planned activities last week." */
  text: string;
  provenance: CoachingProvenance;
}

// ── 8.1 Weekly Coaching Brief ────────────────────────────────────────────────

export interface WeeklyCoachingBrief {
  /** e.g. "A strong week", "Make this week easier to complete". */
  headline: string;
  /** One factual observation grounded in real evidence. */
  observation: string;
  /** One actionable, non-shaming piece of guidance for this week. */
  guidance: string;
  /** Optional supporting facts (never more than 2 on Home). */
  evidence: CoachingEvidence[];
  primaryAction: { label: string; route: string };
  /** Dev/test only — which ranked branch produced this brief. Never rendered. */
  provenance: CoachingProvenance;
}

// ── 8.2 Why This Plan? ───────────────────────────────────────────────────────

export type PlanExplanationReasonType =
  | 'goal'
  | 'schedule'
  | 'adherence'
  | 'barrier'
  | 'recovery'
  | 'continuity'
  | 'outcome'
  | 'preference'
  | 'execution';

export interface PlanExplanationReason {
  type: PlanExplanationReasonType;
  /** Short card title, e.g. "Built around your goal". */
  title: string;
  /** 1-2 sentences, evidence-grounded, no outcome guarantees, no medical claims. */
  explanation: string;
  provenance: CoachingProvenance;
}

// ── 8.3 What Changed? ────────────────────────────────────────────────────────

export interface PlanActivityRef {
  day: string;
  category: ActivityCategory;
  activity: string;
  durationMinutes: number;
  intensity: string;
}

export interface ScheduleChange {
  category: ActivityCategory;
  activity: string;
  /** Canonical weekday name, or null when the source day string could not be normalized. */
  fromDay: string | null;
  toDay: string | null;
}

export interface WeeklyPlanDelta {
  previousMinutes: number;
  currentMinutes: number;
  minutesDelta: number;

  previousSessionCount: number;
  currentSessionCount: number;
  sessionCountDelta: number;

  addedActivities: PlanActivityRef[];
  removedActivities: PlanActivityRef[];
  retainedActivities: PlanActivityRef[];

  /** Same category+activity, different (normalized) weekday. */
  scheduleChanges: ScheduleChange[];
  /** Same category+activity+day, intensity stepped up or down. */
  intensityChanges: { category: ActivityCategory; activity: string; day: string | null; from: string; to: string }[];

  /** True when nothing crossed the meaningful-change threshold. */
  materiallyUnchanged: boolean;
}

// ── 8.4 Progress & "ACP noticed" ─────────────────────────────────────────────

export interface ProgressExplanation {
  /** Ordered per section 25: outcome → consistency → completion → pattern. */
  items: CoachingEvidence[];
  /** A single coaching_memory-derived "ACP noticed" line, or null. */
  noticed: { headline: string; body: string } | null;
  /** True when there is not yet enough data for any confident statement. */
  insufficientData: boolean;
}

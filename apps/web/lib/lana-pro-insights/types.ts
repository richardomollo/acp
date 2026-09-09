// LANA PRO — PT INTELLIGENCE, LEVEL 4: PT Insights.
//
// An insight turns L3 structured signals + L1/L2 factual context into ONE
// useful, explainable observation for the PT — a PATTERN, never a paraphrase
// of a single comment.
//
//   FACT (L1) → EVIDENCE (L2, verbatim) → SIGNAL (L3) → INSIGHT (L4, this file)
//     → SUGGESTION (L5, NOT built) → PT DECISION (L6, human)
//
// V1 builds exactly two families: `discomfort` (immediate, no repetition
// required) and `progression` (longitudinal — repeated evidence across
// distinct sessions). Deterministic, computed on read, no LLM, no DB, no
// writes, no programme mutation (§23).

export type PTInsightFamily = 'discomfort' | 'progression' | 'adherence';

/**
 * Evidence-count semantics — NOT a probability (§11). Only `progression` uses
 * it (it counts distinct qualifying sessions); `discomfort` is a single report
 * and carries `strength: null`.
 *   emerging   — 2 qualifying sessions
 *   consistent — 3 qualifying sessions
 *   strong     — 4+ qualifying sessions
 */
export type PTInsightStrength = 'emerging' | 'consistent' | 'strong';

/** What the insight is about, most-reliable structured subject available.
 *  Grouping priority: exercise → workout category → exact workout title. */
export interface PTInsightSubject {
  kind: 'exercise' | 'category' | 'workout' | 'overall';
  /** exercises.id / workouts.id / the raw workouts.category value, when known */
  id?: string;
  /** display label — exercise name, human category ("upper-body"), or workout
   *  title; null for 'overall' */
  label: string | null;
}

export interface PTInsightWindow {
  kind: 'session' | 'recent_sessions';
  /** distinct workout sessions the insight is based on */
  sessionCount: number;
  /** local dates ('YYYY-MM-DD') spanning the contributing evidence */
  from: string;
  to: string;
}

/** One dated planned occurrence, for the `adherence` family's drill-down
 *  ("why Lana noticed this", §20). Structured facts — never a comment. */
export interface PTInsightOccurrence {
  date: string; // 'YYYY-MM-DD'
  workoutTitle: string;
  status: 'completed' | 'missed';
  period: 'recent' | 'baseline';
}

/** One referenced piece of raw evidence, hydrated verbatim for the drill-down. */
export interface PTInsightEvidence {
  /** WorkoutFeedbackItem.id */
  feedbackId: string;
  /** the client's exact words — byte-for-byte, never rewritten */
  comment: string;
  workoutTitle: string;
  exerciseName?: string;
  /** local date of the session */
  date: string;
}

export interface PTInsight {
  /** deterministic — a function of family + subject + the contributing
   *  workout_history ids, so re-deriving the same evidence never yields a
   *  "new" insight. */
  id: string;
  clientId: string;
  family: PTInsightFamily;
  subject: PTInsightSubject;
  window: PTInsightWindow;

  /** WorkoutFeedbackItem.id[] — reach the raw comments */
  evidenceIds: string[];
  /** LanaSignal.id[] — reach the structured interpretation */
  signalIds: string[];
  /** factual anchors, e.g. "workout_history:<id>" for each session counted */
  progressRefs: string[];

  /** null for `discomfort` (single report) */
  strength: PTInsightStrength | null;

  /**
   * `discomfort` only: the factual wording this insight chose — 'pain' iff a
   * `pain_reported` signal backs it, else 'discomfort'. Lets L5 phrase a safe
   * review prompt without re-parsing `statement`. Absent on `progression`.
   */
  descriptor?: 'pain' | 'discomfort';

  /** PT-facing heading — plain text, never quoted */
  title: string;
  /**
   * PT-facing observation — a deterministic template describing the pattern.
   * "LANA OBSERVED", NOT "CLIENT SAID": it is never wrapped in quotation marks
   * and never contains a diagnosis, injury, severity, cause, treatment or any
   * load/volume/programme recommendation (§4/§9/§22).
   */
  statement: string;

  /** newest contributing signal's observedAt (ISO) */
  observedAt: string;

  /** hydrated raw evidence for the "See evidence" drill-down (verbatim) */
  evidence: PTInsightEvidence[];

  /** `adherence` only — the dated planned occurrences behind the statement,
   *  ascending. Absent on `discomfort` / `progression`. */
  occurrences?: PTInsightOccurrence[];
}

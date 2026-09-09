// LANA PRO — PT INTELLIGENCE, LEVEL 3: the shared "Lana Signal" contract.
//
// A signal is a STRUCTURED INTERPRETATION of a single piece of Level-2
// evidence. It is not a PT recommendation and not an insight. Every signal is
// fully traceable back to the exact raw evidence that produced it and records
// which classifier version produced it.
//
//   FACT (L1) → EVIDENCE (L2, verbatim) → SIGNAL (L3, this file)
//     → INSIGHT (L4, later) → SUGGESTION (L5, later) → PT DECISION (L6)
//
// Signals are COMPUTED ON READ from Level-2 evidence for V1 — there is no
// signal table (see the architecture report §H). This file is types + the
// enum only; the deterministic producer is `classifier.ts` and the mapper is
// `derive.ts`.

/**
 * The closed set of things Lana can structurally say about one comment /
 * one session's self-report. Deliberately conservative — a classification is
 * never more specific than the evidence supports (§6).
 */
export type LanaSignalType =
  | 'progression_candidate'
  | 'perceived_difficulty_low'
  | 'perceived_difficulty_high'
  | 'incomplete_volume'
  | 'time_constraint'
  | 'positive_response'
  | 'negative_response'
  | 'discomfort_reported'
  | 'pain_reported'
  | 'exercise_preference'
  | 'exercise_dislike'
  | 'technique_or_fit_issue';

/** What the signal is ABOUT. */
export type SignalSubjectType = 'session' | 'exercise';

/** Which piece of Level-2 evidence the signal was derived FROM. */
export type SignalSourceType =
  /** workout_history.notes / .exercise_notes — the client's verbatim words */
  | 'workout_feedback_comment'
  /** workout_history.perceived_difficulty — the 3-value self-report */
  | 'perceived_difficulty'
  /** workout_history.completion_percentage — computed logged-vs-prescribed */
  | 'completion_percentage';

/**
 * Honest, non-numeric signal strength (§17). A deterministic classifier does
 * not produce a probability — it records HOW it decided.
 *   'matched_rule'         — a keyword/phrase rule fired on the comment
 *   'explicit_self_report' — the client's structured perceived-difficulty pick
 *   'computed_threshold'   — a numeric threshold on real data (completion %)
 */
export type SignalStrength = 'matched_rule' | 'explicit_self_report' | 'computed_threshold';

export interface LanaSignal {
  /** deterministic synthetic id: `<sourceId>#<sourceType>#<type>` — stable for
   *  the same evidence + classifier, so re-deriving never creates a "new" one. */
  id: string;
  clientId: string;
  type: LanaSignalType;
  subjectType: SignalSubjectType;
  /** exercises.id when subjectType === 'exercise'; omitted for a session subject */
  subjectId?: string;
  /** the workout this evidence belongs to (workouts.id) */
  workoutId: string;

  sourceType: SignalSourceType;
  /** the id of the Level-2 evidence object (WorkoutFeedbackItem.id, or the
   *  workout_history row id for the two structured sources) */
  sourceId: string;
  /**
   * The RAW evidence, unchanged. For a comment this is the client's exact
   * words. NEVER a summary, NEVER rewritten — the PT must be able to read what
   * the client actually said by following `sourceId` and this string agrees
   * with it byte-for-byte.
   */
  sourceEvidence: string;

  /** ISO — when the underlying session/comment was submitted (not "now") */
  observedAt: string;
  /** how the classifier decided — never a fake probability */
  strength: SignalStrength;
  /** for a 'matched_rule' signal: the human-readable rule key that fired */
  matchedRule?: string;
  /** provenance — which classifier build produced this (§22) */
  classifierVersion: string;
}

// LANA PRO — PT INTELLIGENCE, LEVEL 5: Suggested Coaching Actions.
//
//   FACT (L1) → EVIDENCE (L2, verbatim) → SIGNAL (L3) → INSIGHT (L4)
//     → SUGGESTED COACHING ACTION (L5, this file) → PT DECISION (L6, human)
//
// An L5 action is a SAFE, ADVISORY review prompt mapped 1:1 from an L4
// PTInsight. It never decides the coaching response — it names the decision
// point and hands it to the PT (§CORE PRODUCT PRINCIPLE).
//
// V1 builds one family per L4 insight family:
//   • discomfort_review   — from a `discomfort` insight
//   • adherence_review    — from an `adherence` insight
//   • progression_review  — from a `progression` insight
//
// Deterministic. Computed on read. No DB, no LLM, no writes, no navigation,
// no programme mutation. Every action references an existing PTInsight; there
// are no orphan actions (§21/§34).

export type SuggestedCoachingActionFamily =
  | 'discomfort_review'
  | 'adherence_review'
  | 'progression_review';

/**
 * Advisory weight — NOT a clinical severity model (none exists in V1, §11).
 * Two values only; it exists solely to keep safety-relevant review ahead of
 * performance review in the list and to allow a light visual cue.
 *   attention — discomfort / pain review (look at this first)
 *   review    — progression review (a performance decision point)
 */
export type SuggestedCoachingActionPriority = 'attention' | 'review';

export interface SuggestedCoachingAction {
  /** deterministic: `${family}:${insightId}` — one insight yields at most one
   *  action, so re-deriving the same insights never makes a "new" action. */
  id: string;
  clientId: string;
  /** the L4 PTInsight this action was derived from — the ONLY provenance an
   *  action needs. Traverse: action → insight → signal → evidence. */
  insightId: string;
  family: SuggestedCoachingActionFamily;
  priority: SuggestedCoachingActionPriority;
  /** PT-facing heading — plain text, never quoted */
  title: string;
  /**
   * PT-facing suggestion — a deterministic advisory template. Uses only the
   * verbs Consider / Review / Discuss / Check in / Explore. NEVER contains a
   * prescription (load, sets, reps, volume, frequency, exercise swap), a
   * diagnosis, an injury, a severity, a cause, a treatment or a referral.
   */
  statement: string;
  /** the originating insight's title, for the "Based on: …" line (§20) */
  createdFrom: string;
  /**
   * WorkoutFeedbackItem.id[] — mirrored from the insight for convenience so a
   * card can offer "See evidence" without prop-drilling the whole insight.
   * These are IDs only; the action never carries hydrated raw evidence (§4/§20).
   */
  evidenceIds: string[];
}

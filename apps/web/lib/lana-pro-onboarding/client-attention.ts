// LANA PRO — Phase 3: Lana Intelligence evidence architecture (PURE, CONTRACT ONLY).
//
// The spec asks us to "establish the evidence architecture Lana Intelligence can
// eventually use" for questions like:
//   • Who needs attention?
//   • Who hasn't trained recently?
//   • Who follows their plan?
//   • Who hasn't checked in?
//   • What should I talk to them about?
// …but explicitly NOT to build the Intelligence experience yet, and NOT to
// invent health insights.
//
// So this module defines the SHAPE of the behavioural evidence and a pure
// classifier over it — and nothing in Phase 3 actually supplies real evidence
// yet, so `classifyClientAttention` returns `insufficient_evidence` for every
// real client today. When Lana's behavioural tables are wired in (workouts,
// check-ins, plan adherence), only the `ClientEvidence` producer changes; the
// classification rules and the dashboard consuming them do not.
//
// HARD RULES encoded here:
//   • Every signal is gated on `shareProgressConsent`. No consent → no signal →
//     `insufficient_evidence`. (Mirrors the `pt_clients.share_progress` RLS gate.)
//   • Absence of data is `insufficient_evidence`, NEVER `needs_attention`.
//     "We have no data" must not masquerade as "this client is struggling".
//   • No scores, no diagnoses, no predictions — only "is there a concrete,
//     consented, observed signal worth surfacing to the professional".
//
// Pure: no React, no DOM, no Supabase. Unit-tested with `node --test`.

export type AttentionVerdict =
  | 'needs_attention' // a concrete consented signal the professional should see
  | 'ok' // consented data exists and nothing stands out
  | 'insufficient_evidence'; // no consent, or not enough observed activity to say

/**
 * Behavioural evidence for ONE professional↔client relationship, assembled from
 * real Lana activity. Every field is optional: `undefined` means "not observed /
 * not available", which is different from a zero value.
 */
export interface ClientEvidence {
  /** `pt_clients.share_progress` — the consent gate. When false/undefined, the
   *  professional is not permitted to see progress signals and the classifier
   *  must not use any of the fields below. */
  shareProgressConsent?: boolean;

  /** Relationship state — an invited-but-not-accepted client can't have
   *  behavioural evidence yet. */
  relationshipStatus?: 'pending' | 'active' | 'inactive';

  /** Days since the client's last completed workout (from `workouts`). */
  daysSinceLastWorkout?: number;
  /** Days since the client's last check-in / message (from check-in data). */
  daysSinceLastCheckIn?: number;
  /** Planned sessions in the trailing window vs. completed, 0..1. */
  planAdherenceRatio?: number;
  /** How many days of history we actually have. Below `MIN_HISTORY_DAYS` we
   *  don't draw conclusions. */
  observedHistoryDays?: number;
}

export interface AttentionResult {
  verdict: AttentionVerdict;
  /** Machine-readable reasons (e.g. `no_workout_14d`, `no_consent`). Never
   *  free-text health claims. Empty for `ok`. */
  reasons: string[];
}

// Thresholds — deliberately conservative; tuned later against real data.
export const NO_WORKOUT_ATTENTION_DAYS = 14;
export const NO_CHECK_IN_ATTENTION_DAYS = 21;
export const LOW_ADHERENCE_RATIO = 0.5;
export const MIN_HISTORY_DAYS = 14;

/**
 * Classify one relationship. Phase 3: with no evidence producer wired in, the
 * `evidence` passed from the dashboard is `{}` for every client, so this returns
 * `insufficient_evidence` — which the UI renders as "Not enough activity data
 * yet", never as a problem.
 */
export function classifyClientAttention(evidence: ClientEvidence = {}): AttentionResult {
  // An invite that hasn't been accepted has no behavioural history by
  // definition.
  if (evidence.relationshipStatus && evidence.relationshipStatus !== 'active') {
    return { verdict: 'insufficient_evidence', reasons: ['relationship_not_active'] };
  }

  // Consent gate — no share_progress means we may not reason about progress.
  if (!evidence.shareProgressConsent) {
    return { verdict: 'insufficient_evidence', reasons: ['no_consent'] };
  }

  // Not enough observed history to say anything.
  const history = evidence.observedHistoryDays;
  const hasAnySignal =
    evidence.daysSinceLastWorkout != null ||
    evidence.daysSinceLastCheckIn != null ||
    evidence.planAdherenceRatio != null;
  if (!hasAnySignal || (history != null && history < MIN_HISTORY_DAYS)) {
    return { verdict: 'insufficient_evidence', reasons: ['not_enough_history'] };
  }

  const reasons: string[] = [];
  if (
    evidence.daysSinceLastWorkout != null &&
    evidence.daysSinceLastWorkout >= NO_WORKOUT_ATTENTION_DAYS
  ) {
    reasons.push(`no_workout_${NO_WORKOUT_ATTENTION_DAYS}d`);
  }
  if (
    evidence.daysSinceLastCheckIn != null &&
    evidence.daysSinceLastCheckIn >= NO_CHECK_IN_ATTENTION_DAYS
  ) {
    reasons.push(`no_check_in_${NO_CHECK_IN_ATTENTION_DAYS}d`);
  }
  if (
    evidence.planAdherenceRatio != null &&
    evidence.planAdherenceRatio < LOW_ADHERENCE_RATIO
  ) {
    reasons.push('low_plan_adherence');
  }

  return reasons.length > 0
    ? { verdict: 'needs_attention', reasons }
    : { verdict: 'ok', reasons: [] };
}

/** Bucket for the dashboard's "Your clients" grouping. Combines relationship
 *  state with the attention verdict:
 *   • invited      — pending invitation, not yet accepted
 *   • needs_attention — active + a consented signal worth seeing
 *   • active       — active, nothing standing out (incl. insufficient evidence)
 *   • inactive     — relationship marked inactive
 */
export type ClientBucket = 'invited' | 'needs_attention' | 'active' | 'inactive';

export function bucketForClient(args: {
  relationshipStatus: 'pending' | 'active' | 'inactive';
  hasAccount: boolean;
  evidence?: ClientEvidence;
}): ClientBucket {
  if (args.relationshipStatus === 'pending') return 'invited';
  if (args.relationshipStatus === 'inactive') return 'inactive';
  const verdict = classifyClientAttention({
    ...args.evidence,
    relationshipStatus: 'active',
  }).verdict;
  return verdict === 'needs_attention' ? 'needs_attention' : 'active';
}

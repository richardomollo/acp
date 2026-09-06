// LANA PRO — Phase 4.4: professional client-attention (PURE).
//
// Extends the Phase-3 `classifyClientAttention` reason set for Home's
// "clients may need your attention". Deterministic, conservative, evidence-only.
// No scores, no motivation/commitment inference (§15).
//
// Non-protected signals (the professional's own records / assigned tasks) are
// always available. Protected signals (measurements, activity) require an
// ACTIVE relationship AND share_progress = true.

export type AttentionReasonCode =
  | 'follow_up_due'
  | 'upcoming_session'
  | 'action_incomplete'
  | 'new_measurement'
  | 'low_recent_activity'
  | 'new_client'
  | 'no_shared_progress'
  | 'insufficient_evidence';

export interface AttentionReason {
  code: AttentionReasonCode;
  /** Conservative, factual. Rendered to the professional. */
  text: string;
}

export type ProAttentionVerdict = 'attention' | 'ok' | 'insufficient_evidence';

export interface ProAttentionResult {
  clientId: string;
  clientName: string;
  verdict: ProAttentionVerdict;
  reasons: AttentionReason[];
}

export interface ProAttentionEvidence {
  clientId: string;
  clientName: string;
  relationshipStatus: 'active' | 'pending' | 'inactive';
  shareProgress: boolean;
  /** days since the relationship was created (new_client) */
  relationshipAgeDays?: number;
  /** professional_session_records.follow_up_at ≤ today (own record) */
  followUpDueOn?: string | null;
  todayLocalDate: string;
  /** next pt_bookings for this client within N days (own record) */
  daysToNextBooking?: number | null;
  /** open client_tasks this professional assigned */
  openActionCount?: number;
  /** PROTECTED — days since most recent client_measurements */
  daysSinceLastMeasurement?: number;
  /** PROTECTED — completed activities/workouts in the trailing 14 days */
  activitiesLast14d?: number;
}

export const NEW_CLIENT_DAYS = 10;
export const UPCOMING_SESSION_DAYS = 2;
export const NEW_MEASUREMENT_DAYS = 3;
export const LOW_ACTIVITY_14D_THRESHOLD = 1;

export function classifyProfessionalAttention(e: ProAttentionEvidence): ProAttentionResult {
  const reasons: AttentionReason[] = [];
  const consented = e.relationshipStatus === 'active' && e.shareProgress === true;

  // ── non-protected ──
  if (e.followUpDueOn && e.followUpDueOn <= e.todayLocalDate) {
    reasons.push({ code: 'follow_up_due', text: 'Follow-up from your last session is due.' });
  }
  if (typeof e.daysToNextBooking === 'number' && e.daysToNextBooking >= 0 && e.daysToNextBooking <= UPCOMING_SESSION_DAYS) {
    reasons.push({
      code: 'upcoming_session',
      text: e.daysToNextBooking === 0 ? 'Session with you today.' : `Session with you in ${e.daysToNextBooking} day${e.daysToNextBooking === 1 ? '' : 's'}.`,
    });
  }
  if ((e.openActionCount ?? 0) > 0) {
    reasons.push({
      code: 'action_incomplete',
      text: `${e.openActionCount} action${e.openActionCount === 1 ? '' : 's'} you set ${e.openActionCount === 1 ? 'is' : 'are'} still open.`,
    });
  }
  if (typeof e.relationshipAgeDays === 'number' && e.relationshipAgeDays >= 0 && e.relationshipAgeDays <= NEW_CLIENT_DAYS) {
    reasons.push({ code: 'new_client', text: 'New client — recently connected.' });
  }

  // ── protected ──
  if (consented) {
    if (typeof e.daysSinceLastMeasurement === 'number' && e.daysSinceLastMeasurement <= NEW_MEASUREMENT_DAYS) {
      reasons.push({ code: 'new_measurement', text: 'New measurement logged since you last met.' });
    }
    if (typeof e.activitiesLast14d === 'number' && e.activitiesLast14d < LOW_ACTIVITY_14D_THRESHOLD) {
      // Conservative: describe what's measurable, not a state of mind.
      reasons.push({ code: 'low_recent_activity', text: 'Activity in the last two weeks appears lower than usual.' });
    }
  } else if (e.relationshipStatus === 'active') {
    // Active but not sharing — surface it once, gently, so the professional
    // knows why there's no progress context (never framed as a problem).
    reasons.push({ code: 'no_shared_progress', text: "Progress isn't shared with you yet." });
  }

  if (reasons.length === 0) {
    return { clientId: e.clientId, clientName: e.clientName, verdict: 'insufficient_evidence', reasons: [] };
  }

  // "attention" only when there is an actionable, time-relevant reason.
  const actionable = reasons.some((r) =>
    r.code === 'follow_up_due' || r.code === 'upcoming_session' || r.code === 'action_incomplete' || r.code === 'low_recent_activity',
  );
  return {
    clientId: e.clientId,
    clientName: e.clientName,
    verdict: actionable ? 'attention' : 'ok',
    reasons,
  };
}

/** Home list: only clients that actually need attention, most-relevant first. */
export function clientsNeedingAttention(results: readonly ProAttentionResult[]): ProAttentionResult[] {
  const RANK: AttentionReasonCode[] = ['follow_up_due', 'upcoming_session', 'action_incomplete', 'low_recent_activity', 'new_measurement', 'new_client', 'no_shared_progress', 'insufficient_evidence'];
  const topRank = (r: ProAttentionResult) => Math.min(...r.reasons.map((x) => RANK.indexOf(x.code)), RANK.length);
  return results
    .filter((r) => r.verdict === 'attention')
    .sort((a, b) => topRank(a) - topRank(b) || a.clientName.localeCompare(b.clientName));
}

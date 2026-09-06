// LANA PRO — Phase 4.3: consent-safety guarantees (PURE).
//
// The legacy `pt_bookings_upsert_client` DB trigger flips
// `pt_clients.status='active'` on any booking with a user_id. That is legacy
// marketplace relationship bookkeeping — it is NOT progress-sharing consent.
//
// Lana Pro must ALWAYS gate any client health/progress evidence on
// `pt_clients.share_progress` independently, and never on "a booking exists" or
// "the relationship is active". This module makes that explicit + testable.

/** A booking — of ANY status, marketplace or direct — never grants data
 *  sharing. Always false, by construction. */
export function bookingImpliesShareConsent(): boolean {
  return false;
}

/** An active relationship alone does not grant data sharing either. */
export function relationshipImpliesShareConsent(): boolean {
  return false;
}

/**
 * The ONLY gate for showing a client's health/progress evidence to a
 * professional. Every progress surface must call this.
 */
export function canViewClientProgress(input: {
  relationshipStatus: 'active' | 'pending' | 'inactive' | 'none';
  shareProgress: boolean;
}): boolean {
  return input.relationshipStatus === 'active' && input.shareProgress === true;
}

/**
 * What the "Start session" / booking-detail context panel may show, given
 * consent. Phase 4.3 shows nothing that isn't consented (§15).
 */
export interface SessionContextVisibility {
  showProgress: boolean;
  /** copy shown when progress is not available */
  placeholder: string;
}

export function sessionContextVisibility(input: {
  relationshipStatus: 'active' | 'pending' | 'inactive' | 'none';
  shareProgress: boolean;
}): SessionContextVisibility {
  const showProgress = canViewClientProgress(input);
  return {
    showProgress,
    placeholder: showProgress
      ? ''
      : 'Client context will appear here when they choose to share it.',
  };
}

// LANA PRO — Phase 6 (Step 1): SUGGESTED ACTIONS (PURE).
//
// Lana Intelligence helps the professional ACT, not read prose (§8). This maps
// a client's situation onto workflow links that ALREADY EXIST in Lana Pro.
// Never emits a route that isn't wired — the inspection's supported set for
// Steps 1–4 is: prepare_for_session, view_client, book_client.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

export type ActionId =
  | 'prepare_for_session'
  | 'view_client'
  | 'book_client';

export interface SuggestedAction {
  id: ActionId;
  label: string;
  href: string;
  /** short reason, or null. Never prescriptive. */
  rationale: string | null;
}

export interface ActionContext {
  clientId: string;
  /** the client's next booking with this professional, if one is imminent */
  nextSession: { source: 'appointment' | 'venue'; bookingId: string; withinPrepWindow: boolean } | null;
  followUpDue: boolean;
  hasUpcomingBooking: boolean;
  hasCompletedSessions: boolean;
  relationship: 'active' | 'pending' | 'inactive' | 'none';
  /** 'home' caps tighter than 'detail' */
  surface: 'home' | 'detail';
}

const HOME_MAX = 2;
const DETAIL_MAX = 3;

export function deriveSuggestedActions(ctx: ActionContext): SuggestedAction[] {
  const out: SuggestedAction[] = [];

  const viewClient: SuggestedAction = {
    id: 'view_client',
    label: 'View client',
    href: `/lana-pro/clients/${ctx.clientId}`,
    rationale: null,
  };

  if (ctx.relationship !== 'active') {
    // An invited-but-not-accepted client: nothing to prepare or book yet.
    return ctx.surface === 'home' ? [] : [viewClient];
  }

  if (ctx.nextSession && ctx.nextSession.withinPrepWindow) {
    out.push({
      id: 'prepare_for_session',
      label: 'Prepare for session',
      href: `/lana-pro/bookings/${ctx.nextSession.source}/${ctx.nextSession.bookingId}/session`,
      rationale: 'A session is coming up.',
    });
  }

  out.push(viewClient);

  if (ctx.followUpDue || (ctx.hasCompletedSessions && !ctx.hasUpcomingBooking)) {
    out.push({
      id: 'book_client',
      label: 'Book a session',
      href: '/lana-pro/bookings/new',
      rationale: ctx.followUpDue ? 'A follow-up is due.' : 'No upcoming session is booked.',
    });
  }

  const cap = ctx.surface === 'home' ? HOME_MAX : DETAIL_MAX;
  // de-dupe by id, keep first occurrence (priority order above), then cap.
  const seen = new Set<ActionId>();
  return out.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, cap);
}

/** The single action Home should show as the row's call-to-action. */
export function primaryAction(actions: readonly SuggestedAction[]): SuggestedAction | null {
  return (
    actions.find((a) => a.id === 'prepare_for_session') ??
    actions.find((a) => a.id === 'view_client') ??
    actions[0] ??
    null
  );
}

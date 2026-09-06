// LANA PRO — Phase 6 (Step 8): BUSINESS INTELLIGENCE suggested actions (PURE).
//
// Every business insight maps onto a route that ALREADY EXISTS in Lana Pro
// (§9). No fake buttons, and no routes back to the classic dashboards. Unit
// tests assert every href starts with "/lana-pro/".

import type { BusinessGapId } from './business-signals.ts';

export type BusinessActionId =
  | 'add_service'
  | 'set_schedule'
  | 'add_team_member'
  | 'review_schedule'
  | 'view_bookings'
  | 'view_services'
  | 'view_class';

export interface BusinessAction {
  id: BusinessActionId;
  label: string;
  href: string;
}

const ROUTES: Record<Exclude<BusinessActionId, 'view_class'>, string> = {
  add_service: '/lana-pro/services/new',
  set_schedule: '/lana-pro/schedule',
  add_team_member: '/lana-pro/team',
  review_schedule: '/lana-pro/schedule',
  view_bookings: '/lana-pro/bookings',
  view_services: '/lana-pro/services',
};

const LABELS: Record<BusinessActionId, string> = {
  add_service: 'Add service',
  set_schedule: 'Set schedule',
  add_team_member: 'Add team member',
  review_schedule: 'Review schedule',
  view_bookings: 'View bookings',
  view_services: 'Review services',
  view_class: 'View class',
};

export function businessAction(id: Exclude<BusinessActionId, 'view_class'>): BusinessAction {
  return { id, label: LABELS[id], href: ROUTES[id] };
}

/** The class-detail route already used by the schedule aggregator
 *  (`/lana-pro/bookings/class/<sessionId>`). */
export function viewClassAction(sessionId: string): BusinessAction {
  return { id: 'view_class', label: LABELS.view_class, href: `/lana-pro/bookings/class/${sessionId}` };
}

/** The action that resolves a given setup gap. */
export function actionForGap(id: BusinessGapId): BusinessAction {
  switch (id) {
    case 'no_service':
      return businessAction('add_service');
    case 'no_schedule':
      return businessAction('set_schedule');
    case 'no_team':
      return businessAction('add_team_member');
    case 'no_facility_access':
      return businessAction('add_service');
  }
}

export function isRealLanaProRoute(href: string): boolean {
  return href.startsWith('/lana-pro/');
}

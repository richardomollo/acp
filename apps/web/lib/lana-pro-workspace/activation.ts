// LANA PRO — Phase 4.1: activation checklist (PURE, evidence-derived).
//
// There is NO stored "checklist complete" flag anywhere in the product, and we
// do not add one. Each item's done-state is derived from canonical data the
// account already has (offerings, availability, clients, profile fields, payout
// requests). Home shows only the items that are NOT yet done.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

export interface ChecklistItem {
  id: string;
  label: string;
  /** Derived from real evidence — never persisted. */
  done: boolean;
  /** Where "do this" leads. */
  href: string;
}

// ── professional ──────────────────────────────────────────────────────────

export interface ProfessionalActivationEvidence {
  /** `pt_offerings` count > 0. */
  hasService: boolean;
  /** `pt_availability` rows > 0. */
  hasAvailability: boolean;
  /** `pt_clients` rows > 0 (invited OR active — both count as "started"). */
  hasClients: boolean;
  /** bio present AND ≥1 specialisation AND a profile photo. */
  profileComplete: boolean;
  /** Has ever submitted a payout request (the only payout signal that exists;
   *  there is no stored payout method). */
  payoutReady: boolean;
}

export function deriveProfessionalChecklist(e: ProfessionalActivationEvidence): ChecklistItem[] {
  return [
    { id: 'service', label: 'Add your first service', done: e.hasService, href: '/lana-pro/services' },
    { id: 'availability', label: 'Set your availability', done: e.hasAvailability, href: '/lana-pro/schedule' },
    { id: 'clients', label: 'Invite or add your clients', done: e.hasClients, href: '/lana-pro/clients' },
    { id: 'profile', label: 'Complete your public profile', done: e.profileComplete, href: '/lana-pro/profile' },
    { id: 'payouts', label: 'Set up payouts', done: e.payoutReady, href: '/lana-pro/business' },
  ];
}

// ── business ──────────────────────────────────────────────────────────────

export interface BusinessActivationEvidence {
  /** `sessions` count > 0 (classes / access inventory). */
  hasInventory: boolean;
  /** `sessions` with a future date > 0. */
  hasSchedule: boolean;
  /** `gym_trainers` rows > 0. Only surfaced when `teamRelevant`. */
  hasTeam: boolean;
  /** Whether a team item belongs in this business's checklist at all. */
  teamRelevant: boolean;
  /** gym description present AND an image. */
  profileComplete: boolean;
  /** Payout details/target configured — see limitation note; today this is
   *  "the venue is active", the closest canonical signal. */
  payoutReady: boolean;
}

export function deriveBusinessChecklist(e: BusinessActivationEvidence): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: 'inventory', label: 'Add your first service', done: e.hasInventory, href: '/lana-pro/services' },
    { id: 'schedule', label: 'Set your schedule', done: e.hasSchedule, href: '/lana-pro/schedule' },
  ];
  if (e.teamRelevant) {
    items.push({ id: 'team', label: 'Invite your team', done: e.hasTeam, href: '/lana-pro/team' });
  }
  items.push(
    { id: 'profile', label: 'Complete your business profile', done: e.profileComplete, href: '/lana-pro/business' },
    { id: 'payouts', label: 'Set up payouts', done: e.payoutReady, href: '/lana-pro/business' },
  );
  return items;
}

// ── shared helpers ────────────────────────────────────────────────────────

export function incompleteItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => !i.done);
}

/** 0..1 — how far through activation the account is. */
export function activationProgress(items: readonly ChecklistItem[]): number {
  if (items.length === 0) return 1;
  return items.filter((i) => i.done).length / items.length;
}

export function isFullyActivated(items: readonly ChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}

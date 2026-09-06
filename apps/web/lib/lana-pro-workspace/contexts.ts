// LANA PRO — Phase 4.6: workspace CONTEXTS (PURE).
//
// One human (auth.users) can participate in several professional contexts:
//   • MY PRACTICE   — an independent `personal_trainers` profile
//   • {VENUE} — Business     — a `gyms` they own via partners → partner_gyms
//   • {VENUE} — Professional  — a `gym_trainers` employment elsewhere
//
// This module turns the raw identity shape into an ordered list of contexts,
// resolves the active one (from a cookie / param, else the first), and derives
// the nav + Home variant for that context. It NEVER merges identities and is
// NOT an authorization boundary — the server still authorises every resource
// independently. No React, no DOM, no Supabase. Unit-tested with `node --test`.

import type { NavItemId, WorkspaceCapabilities } from './capabilities.ts';

export type WorkspaceContextKind = 'independent' | 'business' | 'employed';

export interface WorkspaceContextOption {
  /** stable id used in the cookie / switcher: 'practice' | 'gym:<id>' | 'emp:<gymTrainerId>' */
  id: string;
  kind: WorkspaceContextKind;
  /** switcher label, e.g. "My practice", "Lana Fitness — Business", "FitLab — Professional" */
  label: string;
  /** shell header display name for this context */
  displayName: string;
  gymId?: string;
  gymTrainerId?: string;
  ptId?: string;
}

export interface ContextInput {
  pt: { id: string; displayName: string } | null;
  gyms: { id: string; name: string | null }[];
  employments: { gymTrainerId: string; gymId: string; gymName: string | null }[];
}

const PROFESSIONAL_NAV: NavItemId[] = ['home', 'clients', 'bookings', 'services', 'schedule', 'profile'];
const BUSINESS_NAV: NavItemId[] = ['home', 'bookings', 'services', 'schedule', 'team', 'business'];
const EMPLOYED_NAV: NavItemId[] = ['home', 'clients', 'bookings', 'schedule', 'profile'];

/**
 * Ordered contexts for this account. Professional-first (independent, then the
 * venues they own, then employments elsewhere). An employment at a venue the
 * user ALSO owns is folded into the business context — the owner already sees
 * everything there.
 */
export function buildWorkspaceContexts(input: ContextInput): WorkspaceContextOption[] {
  const out: WorkspaceContextOption[] = [];
  const ownedGymIds = new Set(input.gyms.map((g) => g.id));

  if (input.pt) {
    out.push({
      id: 'practice',
      kind: 'independent',
      label: 'My practice',
      displayName: input.pt.displayName || 'My practice',
      ptId: input.pt.id,
    });
  }

  for (const g of input.gyms) {
    const name = g.name?.trim() || 'Your venue';
    out.push({
      id: `gym:${g.id}`,
      kind: 'business',
      label: `${name} — Business`,
      displayName: name,
      gymId: g.id,
    });
  }

  for (const e of input.employments) {
    if (ownedGymIds.has(e.gymId)) continue;
    const name = e.gymName?.trim() || 'Your venue';
    out.push({
      id: `emp:${e.gymTrainerId}`,
      kind: 'employed',
      label: `${name} — Professional`,
      displayName: name,
      gymId: e.gymId,
      gymTrainerId: e.gymTrainerId,
    });
  }

  return out;
}

/** The active context: the one whose id matches `requestedId`, else the first. */
export function resolveActiveContext(
  options: readonly WorkspaceContextOption[],
  requestedId?: string | null,
): WorkspaceContextOption | null {
  if (options.length === 0) return null;
  if (requestedId) {
    const hit = options.find((o) => o.id === requestedId);
    if (hit) return hit;
  }
  return options[0];
}

export function navForContextKind(kind: WorkspaceContextKind): NavItemId[] {
  switch (kind) {
    case 'business':
      return [...BUSINESS_NAV];
    case 'employed':
      return [...EMPLOYED_NAV];
    default:
      return [...PROFESSIONAL_NAV];
  }
}

/**
 * Overlay the active context onto the base capabilities: the nav + Home variant
 * follow the CONTEXT, everything else (needsOnboarding, marketplaceGated) is
 * kept from the base derivation.
 */
export function applyContextToCapabilities(
  base: WorkspaceCapabilities,
  context: WorkspaceContextOption | null,
): WorkspaceCapabilities {
  if (!context || base.needsOnboarding) return base;
  const nav = navForContextKind(context.kind);
  return {
    ...base,
    primaryRole: context.kind === 'business' ? 'business' : 'professional',
    homeVariant: context.kind === 'business' ? 'business' : 'professional',
    nav,
    showClients: nav.includes('clients'),
    showTeam: nav.includes('team'),
    showServices: nav.includes('services'),
  };
}

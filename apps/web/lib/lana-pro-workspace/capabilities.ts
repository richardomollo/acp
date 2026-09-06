// LANA PRO — Phase 4.1: capability-driven workspace model (PURE).
//
// One shell, not four dashboards. What a professional/business account can see
// is DERIVED from what they actually are — never hardcoded per provider type.
// No React, no DOM, no Supabase. Unit-tested with `node --test`.
//
// The server layout assembles `WorkspaceIdentityInput` from the DB
// (personal_trainers row, partner_gyms, gym_trainers) and this decides the nav.

export type WorkspaceRole = 'professional' | 'business';

export type ProfessionalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface WorkspaceIdentityInput {
  /** Has a `personal_trainers` row (independent / marketplace PT). */
  hasProfessionalProfile: boolean;
  /** `personal_trainers.status`, or null when there is no profile. */
  professionalStatus: ProfessionalStatus | null;
  /** Owns ≥1 venue (`partners` → `partner_gyms` → `gyms`). */
  ownsBusiness: boolean;
  /** `gyms.type` values across owned venues (lowercased). Informational — used
   *  only for copy, never to gate a module. */
  businessTypes: string[];
  /** Any owned venue is live on the marketplace (`gyms.is_active`). */
  anyVenueActive: boolean;
  /** The business employs staff (`gym_trainers` rows exist for an owned gym). */
  employsTrainers: boolean;
  /** This user is themselves a gym-employed staff trainer (`gym_trainers` row
   *  for their own `user_id`) without an independent profile. */
  isStaffTrainer: boolean;
}

export type NavItemId =
  | 'home'
  | 'clients'
  | 'bookings'
  | 'services'
  | 'schedule'
  | 'team'
  | 'business'
  | 'profile';

export interface WorkspaceCapabilities {
  /** Which Home to render + which primary identity the shell presents. */
  primaryRole: WorkspaceRole;
  homeVariant: 'professional' | 'business';
  /** Ordered nav for the sidebar. */
  nav: NavItemId[];
  /** Convenience flags (all also inferable from `nav`). */
  showClients: boolean;
  showTeam: boolean;
  showServices: boolean;
  /** True while the marketplace-facing side is not yet live. The internal
   *  workspace stays fully usable regardless. */
  marketplaceGated: boolean;
  /** True when the account has no professional profile, no venue and is not
   *  staff — i.e. should be sent back to onboarding. */
  needsOnboarding: boolean;
}

const PROFESSIONAL_NAV: NavItemId[] = ['home', 'clients', 'bookings', 'services', 'schedule', 'profile'];
const STAFF_NAV: NavItemId[] = ['home', 'clients', 'bookings', 'schedule', 'profile'];
const BUSINESS_NAV_BASE: NavItemId[] = ['home', 'bookings', 'services', 'schedule', 'team', 'business'];
const HYBRID_NAV: NavItemId[] = ['home', 'clients', 'bookings', 'services', 'schedule', 'team', 'business'];

/**
 * Derive everything the shell needs from the account's real shape.
 *
 * Rules (mirrors the spec's worked examples):
 *  - Solo PT / nutritionist → Home, Clients, Bookings, Services, Schedule, Profile
 *  - Class-only studio       → Home, Bookings, Services, Schedule, Team, Business
 *  - Gym with employed PTs   → + Clients (their staff carry client rosters)
 *  - Hybrid (PT + venue)     → union, professional-first
 *  - Staff trainer only      → Home, Clients, Bookings, Schedule, Profile (no
 *                              Services — they don't own the menu; no Team)
 */
export function deriveWorkspaceCapabilities(input: WorkspaceIdentityInput): WorkspaceCapabilities {
  const isPro = input.hasProfessionalProfile;
  const isBiz = input.ownsBusiness;

  const needsOnboarding = !isPro && !isBiz && !input.isStaffTrainer;

  if (needsOnboarding) {
    return {
      primaryRole: 'professional',
      homeVariant: 'professional',
      nav: ['home'],
      showClients: false,
      showTeam: false,
      showServices: false,
      marketplaceGated: true,
      needsOnboarding: true,
    };
  }

  // Hybrid: has both an independent profile and a venue.
  if (isPro && isBiz) {
    return {
      primaryRole: 'professional',
      homeVariant: 'professional',
      nav: HYBRID_NAV,
      showClients: true,
      showTeam: true,
      showServices: true,
      marketplaceGated: input.professionalStatus !== 'approved' || !input.anyVenueActive,
      needsOnboarding: false,
    };
  }

  if (isBiz) {
    const nav = [...BUSINESS_NAV_BASE];
    // A gym that employs PTs has client relationships worth surfacing.
    if (input.employsTrainers) nav.splice(1, 0, 'clients');
    return {
      primaryRole: 'business',
      homeVariant: 'business',
      nav,
      showClients: input.employsTrainers,
      showTeam: true,
      showServices: true,
      marketplaceGated: !input.anyVenueActive,
      needsOnboarding: false,
    };
  }

  if (isPro) {
    return {
      primaryRole: 'professional',
      homeVariant: 'professional',
      nav: [...PROFESSIONAL_NAV],
      showClients: true,
      showTeam: false,
      showServices: true,
      marketplaceGated: input.professionalStatus !== 'approved',
      needsOnboarding: false,
    };
  }

  // Staff trainer only.
  return {
    primaryRole: 'professional',
    homeVariant: 'professional',
    nav: [...STAFF_NAV],
    showClients: true,
    showTeam: false,
    showServices: false,
    // Staff trainers have no personal marketplace listing to gate.
    marketplaceGated: false,
    needsOnboarding: false,
  };
}

// ── Nav item presentation (labels + hrefs; icons live in the shell) ─────────

export interface NavItemMeta {
  id: NavItemId;
  label: string;
  href: string;
}

const NAV_META: Record<NavItemId, Omit<NavItemMeta, 'id'>> = {
  home: { label: 'Home', href: '/lana-pro/home' },
  clients: { label: 'Clients', href: '/lana-pro/clients' },
  bookings: { label: 'Bookings', href: '/lana-pro/bookings' },
  services: { label: 'Services', href: '/lana-pro/services' },
  schedule: { label: 'Schedule', href: '/lana-pro/schedule' },
  team: { label: 'Team', href: '/lana-pro/team' },
  business: { label: 'Business', href: '/lana-pro/business' },
  profile: { label: 'Profile', href: '/lana-pro/profile' },
};

export function navItemsFor(caps: WorkspaceCapabilities): NavItemMeta[] {
  return caps.nav.map((id) => ({ id, ...NAV_META[id] }));
}

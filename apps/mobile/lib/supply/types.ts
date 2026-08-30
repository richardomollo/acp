// ACP Intelligence™ Day 7.3 — unified structured supply-orchestration layer.
//
// This is NOT a RAG task. No embeddings, no pgvector, no LLM marketplace
// search/ranking/availability inference, no revenue/commission weighting —
// see lib/supply/orchestration.ts's header for the full architectural
// boundary. Reuses lib/fulfilment.ts (Day 3) and lib/professional-support.ts
// (Day 4) as the source-specific matchers rather than duplicating their
// keyword tables/eligibility logic (see the Day 7.3 report).
import type { ActivityCategory, StartingPlanActivity, SupportOpportunity } from '../ai-assessment.ts';
import type { PrimaryGoal, PreferredActivity, Barrier, StrengthExperience } from '../onboarding.ts';

export type SupplyCandidateType =
  | 'class' | 'session' | 'experience' | 'venue'
  | 'personal_trainer' | 'nutritionist' | 'community';

// Internal, structured-only reason codes (spec section 31) — never
// natural-language explanations. Communicated to the user (if at all) by a
// later LLM layer that reads these, never invents its own.
export type SupplyReasonCode =
  | 'activity_match' | 'same_day' | 'alternate_day' | 'similar_duration'
  | 'available_spots' | 'goal_match' | 'support_need_match'
  | 'specialisation_match' | 'preferred_activity' | 'nearby'
  | 'open_gym' | 'accountability_support' | 'consistency_support'
  | 'beginner_friendly';

export interface SupplyScoring {
  eligibility: boolean;
  activityFit: number;
  scheduleFit: number;
  goalFit: number;
  supportFit: number;
  availabilityFit: number;
  locationFit: number;
  overall: number;
}

export interface SupplyVenueRef {
  id: string;
  name: string;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SupplyProviderRef {
  id: string;
  name: string;
  specialisations?: string[];
}

export interface SupplyAvailability {
  /** false only ever means a HARD-ineligible item — see scoring.eligibility for the deterministic gate. */
  available: boolean;
  spotsLeft?: number | null;
}

export interface SupplyCandidate {
  id: string;
  type: SupplyCandidateType;
  title: string;

  category?: string | null;
  activity?: string | null;

  startsAt?: string | null; // ISO date or date+time — undefined for access-style/no-fixed-time supply
  endsAt?: string | null;
  durationMinutes?: number | null;

  availability?: SupplyAvailability;
  venue?: SupplyVenueRef;
  provider?: SupplyProviderRef;

  navigationTarget: { pathname: string; params: Record<string, string> };
  imageUrl?: string | null;

  scoring: SupplyScoring;
  reasons: SupplyReasonCode[];
}

// ── Inputs ───────────────────────────────────────────────────────────────

/** Only structured fields the app genuinely has — see the Day 7.3 report's finding I. No user coordinates exist anywhere in the product today. */
export interface SupplyUserContext {
  goal: PrimaryGoal | null;
  experience: StrengthExperience | null;
  preferredActivities: PreferredActivity[];
  barriers: Barrier[];
  location?: { text?: string | null; latitude?: number | null; longitude?: number | null };
}

/** Reuses the canonical weekly-plan activity shape verbatim — never a duplicate model (spec section 10). */
export type SupplyPlanActivityInput = Pick<
  StartingPlanActivity,
  'day' | 'category' | 'activity' | 'duration_minutes' | 'planned_date'
>;

export interface GetSupplyCandidatesParams {
  userContext: SupplyUserContext;
  planActivity?: SupplyPlanActivityInput;
  supportOpportunities?: SupportOpportunity[];
  /** Anchor "now" — injectable for deterministic tests (spec section 51), defaults to `new Date()` at the call site. */
  anchor: Date;
  limitPerType?: number;
}

export type { ActivityCategory, StartingPlanActivity, SupportOpportunity, PrimaryGoal, PreferredActivity, Barrier, StrengthExperience };

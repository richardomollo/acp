// ACP Intelligence™ Day 4 — optional professional-support matching.
//
// Secondary to plan tracking. Only ever invoked after the user explicitly
// taps "Explore support" (see my-plan.tsx) — provider data is never
// preloaded, never sent to OpenAI, and never influences what the plan or
// recommendation.approach already said. Matching is deterministic keyword
// overlap against real personal_trainers.specialisations data — no LLM, no
// embeddings, no invented signals.
//
// Nutrition classification reuses ACP's own existing convention (see
// apps/mobile/app/nutrition-hub.tsx's `hasNutritionist` check:
// `specialisations.includes('Nutrition')`) rather than inventing a new bar
// for "is this a qualified nutritionist" — that's the one classification
// this codebase already relies on elsewhere.
import type { PrimaryGoal, PreferredActivity } from './onboarding';

export interface ProfessionalProvider {
  id: string;
  name: string;
  specialisations: string[];
  photoUrl?: string | null;
}

export interface ProviderMatch {
  id: string;
  name: string;
  matchReasons: string[];
  score: number;
  navigationTarget: { pathname: string; params: Record<string, string> };
  photoUrl?: string | null;
}

// Keyword tables built from the real, live distinct personal_trainers
// .specialisations values (Weight Loss, Strength Training, HIIT, CrossFit,
// Swimming, Rehabilitation, Sports Performance, Nutrition, Functional
// Training, Running, Dance, Yoga, Martial Arts, Pilates) — not invented.
// Exported (Day 7.3) so the unified supply-orchestration layer can reuse
// the exact same, already-live keyword vocabulary for its own per-dimension
// provider scoring instead of duplicating it — see lib/supply/provider-candidates.ts.
export const GOAL_SPECIALISM_KEYWORDS: Partial<Record<PrimaryGoal, string[]>> = {
  lose_weight: ['weight loss', 'hiit', 'functional training'],
  build_muscle: ['strength training', 'functional training', 'sports performance'],
  maintain_weight: ['functional training', 'sports performance'],
  reduce_stress: ['yoga', 'pilates'],
};

export const ACTIVITY_SPECIALISM_KEYWORDS: Partial<Record<PreferredActivity, string[]>> = {
  gym: ['strength training', 'functional training', 'crossfit'],
  running: ['running', 'sports performance'],
  cycling: ['sports performance'],
  yoga: ['yoga'],
  swimming: ['swimming'],
  boxing: ['martial arts'],
  football: ['sports performance'],
};

/**
 * Marketplace matching fulfils an independently generated
 * ACP Intelligence™ plan.
 *
 * Commercial terms must never influence organic ranking. Nothing in
 * ProfessionalProvider carries a commission/revenue/sponsorship field — the
 * scorer below has nothing such to read even if it wanted to.
 *
 * `isNutritionRequest` takes an entirely separate path (exact-match on the
 * "Nutrition" specialism only) rather than sharing the goal/activity
 * scoring — nutrition support should never surface a provider who merely
 * has an unrelated specialism.
 */
export function matchProfessionalProviders(
  goal: PrimaryGoal | null,
  preferredActivities: PreferredActivity[],
  isNutritionRequest: boolean,
  providers: ProfessionalProvider[],
): ProviderMatch[] {
  const scored = providers
    .map(provider => {
      if (isNutritionRequest) {
        const hasNutrition = provider.specialisations.some(s => s.toLowerCase() === 'nutrition');
        return hasNutrition ? { provider, score: 1, reasons: ['Nutrition'] } : null;
      }

      const reasons = new Set<string>();
      let score = 0;
      const goalKeywords = goal ? (GOAL_SPECIALISM_KEYWORDS[goal] ?? []) : [];

      for (const spec of provider.specialisations) {
        const specLower = spec.toLowerCase();
        if (goalKeywords.includes(specLower)) { score += 1; reasons.add(spec); }
        for (const activity of preferredActivities) {
          if ((ACTIVITY_SPECIALISM_KEYWORDS[activity] ?? []).includes(specLower)) {
            score += 1;
            reasons.add(spec);
          }
        }
      }
      return score > 0 ? { provider, score, reasons: Array.from(reasons) } : null;
    })
    .filter((x): x is { provider: ProfessionalProvider; score: number; reasons: string[] } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Day 4 spec: max 3 — never a provider marketplace

  return scored.map(({ provider, score, reasons }) => ({
    id: provider.id,
    name: provider.name,
    matchReasons: reasons,
    score,
    navigationTarget: { pathname: '/trainer-profile', params: { id: provider.id } },
    photoUrl: provider.photoUrl ?? null,
  }));
}

// ── Beta Feedback #019D — professional-support geography ───────────────────
//
// #019 established the marketplace geography contract for venues/classes/
// trainers; this surfaced a screenshot proving named-professional
// RECOMMENDATIONS (My Plan/Nutrition/Log Progress/Fitness Journey/Activity
// Fulfilment) had escaped it — an Amsterdam user was shown specific
// Kenya-based nutritionists as if bookable. Three call sites
// (trainers.tsx/discover.tsx/my-plan.tsx) had already independently arrived
// at the same correct query shape; this is that shape extracted ONCE so
// every consumer (existing and new) shares one eligibility rule instead of
// re-deriving it — see services/professional-eligibility-service.ts for the
// query side (network) that calls this pure merge.
//
// Contract: a professional is eligible when EITHER —
//   • they have an explicit ACTIVE, non-draft ONLINE pt_offering (crosses
//     geography — never inferred from profession/bio/country/lack of venue), OR
//   • they are reachable in-person within the CURRENT marketplace scope
//     (a pt_venue_links row, or an active/non-draft offering, at a venue
//     inside venueScopeIds).
//
// `venueScopeIds`:
//   • string[] — scope to these venues (may be [] — in-person contributes nothing)
//   • null     — kill switch off (pre-#019 behaviour): no filter, return null

/** Pure merge of the three raw id lists into the final eligible-id set (or
 *  `null` when geo-gating is off). Kept separate from the network calls so
 *  the actual eligibility logic is unit-testable without a database. */
export function mergeEligiblePtIds(
  venueScopeIds: string[] | null,
  linkedVenuePtIds: string[],
  geoOfferingPtIds: string[],
  onlineOfferingPtIds: string[],
): string[] | null {
  if (venueScopeIds === null) return null; // kill switch off — no filter at all
  return Array.from(new Set([...linkedVenuePtIds, ...geoOfferingPtIds, ...onlineOfferingPtIds])).filter(Boolean);
}

// ── Beta Feedback #019E — location-aware professional-support empty states ─
//
// #019D correctly hides ineligible professionals, but collapsed every reason
// for an empty result into one generic "No matching professionals were found
// right now" — which reads as a search failure even when the real reason is
// "Lana has no coverage here yet." This is the ONE shared state every
// professional-support surface (Nutrition, Log Progress, My Plan, Fitness
// Journey, Activity Fulfilment) resolves to before choosing its copy —
// see components/marketplace/marketplace-gate.tsx's
// ProfessionalSupportUnavailableNotice for the shared presentation of it.
export type ProfessionalSupportAvailability =
  | 'available'                  // ≥1 professional survived eligibility + goal/category matching
  | 'no_local_or_online_support' // location is known; genuinely zero eligible professionals
  | 'location_unknown'           // the marketplace location itself hasn't resolved (never guessed)
  | 'error';                     // the eligibility/provider query itself failed

/**
 * Pure state resolution — no network, no geography inference from a
 * professional's own data (bio/name/country/specialisation). `locationKnown`
 * and `queryFailed` must come from the existing #019 marketplace-location
 * state and #019D eligibility query respectively; `matchCount` is the final,
 * already-matched/ranked professional list length.
 */
export function resolveProfessionalSupportAvailability(input: {
  locationKnown: boolean;
  queryFailed: boolean;
  matchCount: number;
}): ProfessionalSupportAvailability {
  // §6/§019D — an already-resolved match (which can only ever be an explicit
  // online offering while location is unresolved — mergeEligiblePtIds never
  // surfaces an in-person id without a real venue scope) proves eligibility
  // outright; checked first so online support is never hidden behind an
  // unresolved location. queryFailed can never coexist with matchCount > 0
  // in practice (a failed query never got far enough to match anyone).
  if (input.matchCount > 0) return 'available';
  if (input.queryFailed) return 'error';
  if (!input.locationKnown) return 'location_unknown';
  return 'no_local_or_online_support';
}

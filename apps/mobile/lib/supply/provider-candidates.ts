// ACP Intelligence™ Day 7.3 — personal_trainers row → PT / nutritionist
// SupplyCandidates.
//
// Reuses lib/professional-support.ts's exported GOAL_SPECIALISM_KEYWORDS /
// ACTIVITY_SPECIALISM_KEYWORDS (Day 4) rather than a second keyword table —
// same live, inspected personal_trainers.specialisations vocabulary.
// Nutrition identification stays the one existing exact-match convention
// this codebase already relies on elsewhere (specialisations includes
// 'Nutrition', case-insensitive) — never a loose semantic classifier
// (spec section 17).
import { GOAL_SPECIALISM_KEYWORDS, ACTIVITY_SPECIALISM_KEYWORDS } from '../professional-support.ts';
import { locationFit } from './location.ts';
import type { SupplyCandidate, SupplyUserContext, SupplyReasonCode, SupportOpportunity } from './types.ts';

export interface ProviderCandidateRow {
  id: string;
  name: string;
  specialisations: string[];
  photoUrl?: string | null;
  serviceAreas?: string[] | null;
  /** Only 'approved' rows are ever eligible (spec section 55/95) — hard filter, applied by the caller or here. */
  status: string;
}

function supportRelevanceScore(opportunities: SupportOpportunity[] | undefined, type: 'personal_trainer' | 'nutrition'): { score: number; reason: SupplyReasonCode | null } {
  const match = opportunities?.find(o => o.type === type);
  if (!match) return { score: type === 'personal_trainer' ? 0.4 : 0, reason: null }; // PT stays a valid, un-promoted candidate with no opportunity (Test Q); nutrition has no path without one (section 46)
  return { score: match.relevance === 'high' ? 1 : 0.6, reason: 'support_need_match' };
}

function bestLocationText(serviceAreas: string[] | null | undefined, userText: string | null | undefined) {
  if (!userText || !serviceAreas || serviceAreas.length === 0) return locationFit(undefined, undefined);
  const hit = serviceAreas.find(a => a.toLowerCase().includes(userText.toLowerCase()) || userText.toLowerCase().includes(a.toLowerCase()));
  return hit ? { score: 1, nearby: true } : { score: 0.5, nearby: false };
}

const PT_WEIGHTS = { supportFit: 0.30, goalFit: 0.25, activityFit: 0.20, locationFit: 0.15, availabilityFit: 0.10 };

/** General PT matching — goal/activity specialism overlap, exactly mirroring the existing hard "zero overlap = not a candidate at all" rule (spec: no forced matches). */
export function buildPersonalTrainerCandidates(
  providers: ProviderCandidateRow[],
  userContext: SupplyUserContext,
  supportOpportunities: SupportOpportunity[] | undefined,
): SupplyCandidate[] {
  const goalKeywords = userContext.goal ? (GOAL_SPECIALISM_KEYWORDS[userContext.goal] ?? []) : [];
  const support = supportRelevanceScore(supportOpportunities, 'personal_trainer');

  const candidates: SupplyCandidate[] = [];
  for (const p of providers) {
    if (p.status !== 'approved') continue; // hard filter (section 55/95)

    const reasons: SupplyReasonCode[] = [];
    let goalFit = 0;
    let activityFit = 0;
    const specLower = p.specialisations.map(s => s.toLowerCase());

    if (goalKeywords.some(k => specLower.includes(k))) { goalFit = 1; reasons.push('goal_match'); }
    for (const activity of userContext.preferredActivities) {
      if ((ACTIVITY_SPECIALISM_KEYWORDS[activity] ?? []).some(k => specLower.includes(k))) {
        activityFit = 1;
        reasons.push('preferred_activity', 'specialisation_match');
        break;
      }
    }
    if (goalFit === 0 && activityFit === 0) continue; // no genuine overlap — not a candidate at all

    if (support.reason) reasons.push(support.reason);

    const loc = bestLocationText(p.serviceAreas, userContext.location?.text);
    if (loc.nearby) reasons.push('nearby');

    const availabilityFit = 0.7; // no structured PT availability data exists (section 56) — "unknown", never a false precise claim

    const overall =
      PT_WEIGHTS.supportFit * support.score +
      PT_WEIGHTS.goalFit * goalFit +
      PT_WEIGHTS.activityFit * activityFit +
      PT_WEIGHTS.locationFit * loc.score +
      PT_WEIGHTS.availabilityFit * availabilityFit;

    candidates.push({
      id: p.id, type: 'personal_trainer', title: p.name,
      provider: { id: p.id, name: p.name, specialisations: p.specialisations },
      navigationTarget: { pathname: '/trainer-profile', params: { id: p.id } },
      imageUrl: p.photoUrl ?? null,
      scoring: {
        eligibility: true, activityFit, scheduleFit: 0, goalFit, supportFit: support.score, availabilityFit, locationFit: loc.score,
        overall: Math.round(overall * 100) / 100,
      },
      reasons: Array.from(new Set(reasons)),
    });
  }
  return candidates.sort((a, b) => b.scoring.overall - a.scoring.overall || a.id.localeCompare(b.id));
}

const NUTRITIONIST_WEIGHTS = { supportFit: 0.8, locationFit: 0.2 };

/**
 * Nutritionist matching is gated ENTIRELY on a real nutrition support
 * opportunity — mirrors the exact existing product behaviour (my-plan.tsx's
 * `wantsNutrition` gate), never surfaced just because a qualified provider
 * happens to exist (spec section 46).
 */
export function buildNutritionistCandidates(
  providers: ProviderCandidateRow[],
  userContext: SupplyUserContext,
  supportOpportunities: SupportOpportunity[] | undefined,
): SupplyCandidate[] {
  const opportunity = supportOpportunities?.find(o => o.type === 'nutrition');
  if (!opportunity) return [];

  const supportScore = opportunity.relevance === 'high' ? 1 : 0.6;
  const candidates: SupplyCandidate[] = [];
  for (const p of providers) {
    if (p.status !== 'approved') continue;
    const hasNutrition = p.specialisations.some(s => s.toLowerCase() === 'nutrition');
    if (!hasNutrition) continue; // exact classification only — never a loose semantic guess (section 17)

    const loc = bestLocationText(p.serviceAreas, userContext.location?.text);
    const overall = NUTRITIONIST_WEIGHTS.supportFit * supportScore + NUTRITIONIST_WEIGHTS.locationFit * loc.score;

    candidates.push({
      id: p.id, type: 'nutritionist', title: p.name,
      provider: { id: p.id, name: p.name, specialisations: p.specialisations },
      navigationTarget: { pathname: '/trainer-profile', params: { id: p.id } },
      imageUrl: p.photoUrl ?? null,
      scoring: {
        eligibility: true, activityFit: 0, scheduleFit: 0, goalFit: 0, supportFit: supportScore, availabilityFit: 0.7, locationFit: loc.score,
        overall: Math.round(overall * 100) / 100,
      },
      reasons: ['support_need_match', ...(loc.nearby ? (['nearby'] as SupplyReasonCode[]) : [])],
    });
  }
  return candidates.sort((a, b) => b.scoring.overall - a.scoring.overall || a.id.localeCompare(b.id));
}

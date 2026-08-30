// ACP Intelligence™ Day 7.3 — communities row → SupplyCandidate.
//
// No prior-art matcher exists for communities (confirmed by inspection —
// (tabs)/communities.tsx is a plain browse/list screen with no ranking).
// communities.category is a real, enforced CHECK-constraint vocabulary
// ('running','walking','cycling','strength','boxing','yoga','pilates',
// 'hiking','dance','outdoor_fitness','football','other') — a different,
// non-overlapping vocabulary from fulfilment.ts's NormalizedActivityKey
// ('gym' not 'strength'), so this module maps between them explicitly
// rather than forcing a shared table onto two genuinely different enums.
import type { NormalizedActivityKey } from '../fulfilment.ts';
import { locationFit } from './location.ts';
import type { SupplyCandidate, SupplyUserContext, SupplyReasonCode, Barrier } from './types.ts';

export interface CommunityCandidateRow {
  id: string;
  name: string;
  category: string;
  location: string | null;
  isActive: boolean;
  reviewStatus: string;
  communityType: 'open' | 'approval_required';
  logoUrl?: string | null;
}

const ACTIVITY_KEY_TO_COMMUNITY_CATEGORY: Partial<Record<NormalizedActivityKey, string>> = {
  gym: 'strength', running: 'running', walking: 'walking', cycling: 'cycling',
  yoga: 'yoga', football: 'football', boxing: 'boxing',
};

const ACCOUNTABILITY_BARRIERS: Barrier[] = ['accountability', 'consistency'];

const WEIGHTS = { activityFit: 0.35, supportFit: 0.30, locationFit: 0.20, availabilityFit: 0.15 };

export function buildCommunityCandidates(
  communities: CommunityCandidateRow[],
  userContext: SupplyUserContext,
  relevantActivityKeys: NormalizedActivityKey[],
): SupplyCandidate[] {
  const relevantCategories = new Set(
    relevantActivityKeys.map(k => ACTIVITY_KEY_TO_COMMUNITY_CATEGORY[k]).filter((c): c is string => !!c),
  );

  const candidates: SupplyCandidate[] = [];
  for (const c of communities) {
    if (!c.isActive || c.reviewStatus !== 'approved') continue; // hard filter (section 12/49)

    const reasons: SupplyReasonCode[] = [];
    const activityFit = relevantCategories.has(c.category) ? 1 : 0.3;
    if (activityFit === 1) reasons.push('activity_match');

    const activeBarriers = userContext.barriers.filter(b => ACCOUNTABILITY_BARRIERS.includes(b));
    let supportFit = 0.3; // communities carry a mild baseline social-support fit even absent a named barrier
    if (activeBarriers.includes('accountability')) { supportFit = 1; reasons.push('accountability_support'); }
    else if (activeBarriers.includes('consistency')) { supportFit = 0.8; reasons.push('consistency_support'); }

    const loc = locationFit(userContext.location, { text: c.location });
    if (loc.nearby) reasons.push('nearby');

    const availabilityFit = c.communityType === 'open' ? 1 : 0.7; // approval_required is a real, if smaller, friction (section 57 — no fabricated schedule/availability data)

    // Communities are never surfaced purely because they exist (section 20
    // — "do not turn communities into provider recommendations by
    // default") — require a genuine activity match OR an explicit
    // accountability/consistency signal, never neither.
    if (activityFit !== 1 && supportFit === 0.3) continue;

    const overall =
      WEIGHTS.activityFit * activityFit +
      WEIGHTS.supportFit * supportFit +
      WEIGHTS.locationFit * loc.score +
      WEIGHTS.availabilityFit * availabilityFit;

    candidates.push({
      id: c.id, type: 'community', title: c.name, category: c.category,
      navigationTarget: { pathname: '/community/[id]', params: { id: c.id } },
      imageUrl: c.logoUrl ?? null,
      scoring: {
        eligibility: true, activityFit, scheduleFit: 0, goalFit: 0, supportFit, availabilityFit, locationFit: loc.score,
        overall: Math.round(overall * 100) / 100,
      },
      reasons,
    });
  }
  return candidates.sort((a, b) => b.scoring.overall - a.scoring.overall || a.id.localeCompare(b.id));
}

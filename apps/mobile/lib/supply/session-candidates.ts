// ACP Intelligence™ Day 7.3 — session/class/experience → SupplyCandidate.
//
// Reuses lib/fulfilment.ts's exported pure helpers (normalizeActivity,
// textMatchesActivityKeyword, nextDateForWeekday) rather than duplicating
// the activity-keyword alias table or the date math — same "no forced
// matches" principle (a category match alone is never enough; only a real
// keyword relationship to the specific plan activity counts).
//
// Venue role (spec section 18/54): gyms.amenities is empty on every live
// row (confirmed by direct inspection), so there is no structured facility
// data to match on — the venue only ever appears as fulfilment CONTEXT
// (the `venue` field on the candidate), never as its own standalone
// candidate. See lib/supply/orchestration.ts's header for why no standalone
// venue candidate is emitted.
import {
  normalizeActivity, textMatchesActivityKeyword, nextDateForWeekday,
  type NormalizedActivityKey,
} from '../fulfilment.ts';
import { locationFit } from './location.ts';
import type {
  SupplyCandidate, SupplyPlanActivityInput, SupplyUserContext, SupplyReasonCode, PrimaryGoal,
} from './types.ts';

export interface SessionCandidateRow {
  id: string;
  type: 'session' | 'experience';
  name: string;
  category: string | null;
  date: string | null; // ISO yyyy-mm-dd
  startTime: string | null;
  durationMinutes: number | null;
  isActive: boolean;
  spotsLeft: number | null;
  imageUrl?: string | null;
  gym: { id: string; name: string; area?: string | null; lat?: number | null; lng?: number | null } | null;
}

export interface BuildSessionCandidatesParams {
  planActivity: SupplyPlanActivityInput;
  inventory: SessionCandidateRow[];
  userContext: SupplyUserContext;
  anchor: Date;
}

// Goal → activity-key mapping (spec section 25). New table — no prior
// goal→activity-key mapping existed anywhere in the repo (professional-
// support.ts's GOAL_SPECIALISM_KEYWORDS maps goals to PT *specialisation*
// strings, a different vocabulary from fulfilment.ts's NormalizedActivityKey
// — not directly reusable). Deliberately conservative: every goal maps to
// MULTIPLE activity keys, never one — no goal is "only strength" or "only
// cardio" (mirrors nutrition-goal-fit.ts's "never a single-signal cliff"
// principle from Day 7.2).
const GOAL_ACTIVITY_KEYS: Partial<Record<PrimaryGoal, NormalizedActivityKey[]>> = {
  build_muscle: ['gym'],
  lose_weight: ['gym', 'running', 'walking', 'cycling', 'boxing'],
  maintain_weight: ['gym', 'running', 'walking', 'cycling'],
  reduce_stress: ['yoga', 'mobility', 'walking'],
};

// No structured difficulty field exists on sessions/experiences — this is a
// deliberately narrow, keyword-only signal (spec section 22), never a hard
// filter, and honestly inert wherever no live row happens to use these
// words (reported as a finding, not fabricated further).
const BEGINNER_KEYWORDS = ['beginner', 'intro to', 'fundamentals', 'foundations'];

function isBeginnerFriendly(name: string): boolean {
  const lower = name.toLowerCase();
  return BEGINNER_KEYWORDS.some(k => lower.includes(k));
}

// Session/experience weights sum to 1 (spec section 29/30) — supportFit
// does not apply to this type. Duration similarity folds into scheduleFit
// (both are "does this specific instance's timing/logistics suit the
// plan") rather than inventing an 8th score field outside the section 6
// contract.
const WEIGHTS = { activityFit: 0.35, scheduleFit: 0.30, availabilityFit: 0.15, goalFit: 0.10, locationFit: 0.10 };

export function buildSessionCandidates(params: BuildSessionCandidatesParams): SupplyCandidate[] {
  const { planActivity, inventory, userContext, anchor } = params;
  const key = normalizeActivity(planActivity.activity, planActivity.category);
  if (key === 'other') return [];

  const targetDateIso = planActivity.planned_date ?? nextDateForWeekday(planActivity.day, anchor);
  if (!targetDateIso) return [];
  const todayIso = anchor.toISOString().split('T')[0];

  const candidates: SupplyCandidate[] = [];

  for (const item of inventory) {
    // ── Hard eligibility (spec section 12) — never bypassed by soft score ──
    if (!item.isActive) continue;
    if (item.spotsLeft !== null && item.spotsLeft <= 0) continue; // full, no waitlist semantics (section 50)
    if (!item.date || item.date < todayIso) continue; // never a past session (section 51)
    if (!textMatchesActivityKeyword(`${item.name} ${item.category ?? ''}`, key)) continue; // no forced matches (section 15)

    const reasons: SupplyReasonCode[] = ['activity_match'];

    const isSameDay = item.date === targetDateIso;
    const durationClose = item.durationMinutes != null && Math.abs(item.durationMinutes - planActivity.duration_minutes) <= 15;
    let scheduleFit: number;
    if (isSameDay) { scheduleFit = durationClose ? 1 : 0.8; reasons.push('same_day'); }
    else { scheduleFit = durationClose ? 0.4 : 0.3; reasons.push('alternate_day'); }
    if (durationClose) reasons.push('similar_duration');

    let availabilityFit: number;
    if (item.spotsLeft === null) availabilityFit = 0.8; // uncapped/unknown capacity — available, just not precisely quantified
    else { availabilityFit = 1; reasons.push('available_spots'); }

    const goalKeys = userContext.goal ? (GOAL_ACTIVITY_KEYS[userContext.goal] ?? []) : [];
    const goalFit = goalKeys.includes(key) ? 1 : 0.5;
    if (goalFit === 1) reasons.push('goal_match');

    if (userContext.preferredActivities.some(a => textMatchesActivityKeyword(a, key) || a === key)) {
      reasons.push('preferred_activity');
    }

    if (isBeginnerFriendly(item.name) && userContext.experience === 'beginner') reasons.push('beginner_friendly');
    // Already cleared the strict keyword gate above, so activityFit is a
    // flat 1 for every candidate that exists at all — experience level is
    // surfaced only as a reason code here (never a hard exclusion for
    // supply that has no explicit level restriction, section 22).
    const activityFit = 1;

    if (/open gym/i.test(item.name)) reasons.push('open_gym');

    const loc = locationFit(
      userContext.location,
      { text: item.gym?.area ?? null, latitude: item.gym?.lat ?? null, longitude: item.gym?.lng ?? null },
    );
    if (loc.nearby) reasons.push('nearby');

    const overall =
      WEIGHTS.activityFit * activityFit +
      WEIGHTS.scheduleFit * scheduleFit +
      WEIGHTS.availabilityFit * availabilityFit +
      WEIGHTS.goalFit * goalFit +
      WEIGHTS.locationFit * loc.score;

    candidates.push({
      id: item.id,
      type: item.type,
      title: item.name,
      category: item.category,
      activity: key,
      startsAt: item.date && item.startTime ? `${item.date}T${item.startTime}` : item.date,
      durationMinutes: item.durationMinutes,
      availability: { available: true, spotsLeft: item.spotsLeft },
      venue: item.gym ? {
        id: item.gym.id, name: item.gym.name, locationLabel: item.gym.area ?? null,
        latitude: item.gym.lat ?? null, longitude: item.gym.lng ?? null,
      } : undefined,
      navigationTarget: item.type === 'session'
        ? { pathname: '/session-details', params: { sessionId: item.id } }
        : { pathname: '/experience-details', params: { id: item.id } },
      imageUrl: item.imageUrl ?? null,
      scoring: {
        eligibility: true,
        activityFit, scheduleFit, goalFit, supportFit: 0, availabilityFit, locationFit: loc.score,
        overall: Math.round(overall * 100) / 100,
      },
      reasons,
    });
  }

  return candidates.sort((a, b) => b.scoring.overall - a.scoring.overall || a.id.localeCompare(b.id));
}

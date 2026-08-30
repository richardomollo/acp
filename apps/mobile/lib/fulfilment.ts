// ACP Intelligence™ Day 3 — deterministic fulfilment layer.
//
// Non-negotiable principle: ACP Intelligence™ (Day 1/2/2.5) already decided
// what the user should do this week — that decision lives entirely in
// assessment.starting_plan.activities and is never touched here. This
// module only maps an EXISTING plan activity to EXISTING ACP capabilities
// that can help the user act on it (ExerciseDB, Strava, ACP Marketplace).
// No LLM call, no embeddings, no ML — every function here is pure and
// deterministic, so its behaviour is fully explainable and testable.
//
// Inspection findings this module encodes (see the Day 3 report for the
// full write-up):
// - ExerciseDB has no "mobility"/"stretching"/"yoga"/"boxing"/"swimming"/
//   "football" body-part taxonomy value (its 10 values are chest, back,
//   shoulders, upper arms, lower arms, upper legs, lower legs, waist,
//   cardio, neck) — so those activities get NO exercise_db self-directed
//   source, only marketplace matching. Inventing one would be exactly the
//   kind of "invent functionality" this task explicitly forbids.
// - Strava only imports run/walk/cycle activities (confirmed via its
//   RUN_TYPES/WALK_TYPES/CYCLE_TYPES mapping) and is read-only — no write,
//   no "start an activity", no routes. Copy here never says "Start" for
//   Strava, only "Track"/"Connect"/"View".
// - sessions.category/experiences.category are free text with no enforced
//   taxonomy (confirmed: "Yoga" vs "yoga", multi-tag strings) — matching
//   is keyword/substring-based against name+category, not an exact join.
import type { ActivityCategory, StartingPlanActivity } from './ai-assessment';

export type FulfilmentSource = 'exercise_db' | 'strava' | 'acp_marketplace';

export type NormalizedActivityKey =
  | 'gym' | 'running' | 'walking' | 'cycling' | 'yoga'
  | 'football' | 'swimming' | 'boxing' | 'mobility' | 'other';

export interface SelfDirectedFulfilment {
  source: 'exercise_db' | 'strava';
  title: string;
  navigationTarget: string;
}

/** Minimal shape this module needs from a `sessions` or `experiences` row (already joined to its gym for a display name). */
export interface MarketplaceInventoryItem {
  id: string;
  type: 'session' | 'experience';
  name: string;
  category: string | null;
  date: string | null; // ISO yyyy-mm-dd
  startTime: string | null;
  durationMinutes: number | null;
  gymName: string | null;
  isActive: boolean;
  spotsLeft: number | null;
  imageUrl?: string | null;
  priceKes?: number | null;
}

export interface MarketplaceMatch {
  id: string;
  type: 'session' | 'experience';
  title: string;
  activityType: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  partnerName: string | null;
  score: number;
  matchReasons: string[];
  isAlternateDay: boolean;
  navigationTarget: { pathname: string; params: Record<string, string> };
  imageUrl: string | null;
  priceKes: number | null;
}

export interface PlanActivityFulfilment {
  planActivityIndex: number;
  selfDirected?: SelfDirectedFulfilment;
  marketplaceMatches: MarketplaceMatch[];
}

// ── Activity normalization ──────────────────────────────────────────────────
// One small explicit alias table, per the "do not create competing
// taxonomies" instruction — this is the only place free-text activity
// names get interpreted, reused for both self-directed routing and
// marketplace keyword matching below.
const ACTIVITY_ALIASES: Record<NormalizedActivityKey, string[]> = {
  gym: ['gym', 'strength', 'weights', 'resistance', 'lift'],
  running: ['run', 'jog'],
  walking: ['walk', 'stroll', 'hike'],
  cycling: ['cycl', 'bike', 'biking', 'spin'], // "cycl" (not "cycle") so it matches both "cycle" and "cycling"
  yoga: ['yoga'],
  football: ['football', 'soccer'],
  swimming: ['swim'],
  boxing: ['boxing', 'box'],
  mobility: ['mobility', 'stretch', 'foam roll'],
  other: [],
};

/**
 * Pure keyword test — does `text` contain one of `key`'s known aliases?
 * Deliberately does NOT fall back to a category guess the way
 * normalizeActivity() does: callers that need to check whether some other
 * piece of text (a marketplace listing, a booking name) genuinely relates
 * to a specific activity key want a strict yes/no, not a coerced guess.
 */
export function textMatchesActivityKeyword(text: string, key: NormalizedActivityKey): boolean {
  const aliases = ACTIVITY_ALIASES[key];
  if (!aliases || aliases.length === 0) return false;
  const lower = text.toLowerCase();
  return aliases.some(a => lower.includes(a));
}

// ── Gym-access fulfilment (Beta Feedback #005) ─────────────────────────────
// A marketplace listing that is gym ACCESS — a place + equipment to perform
// a self-directed strength workout — as opposed to a coached class that
// would compete with the prescribed workout. Live supply uses exactly
// "Open Gym" (sessions.name, category 'strength'); the other phrases are
// defensive and match nothing in current data (reported, not fabricated).
// Deliberately narrow: a plain "gym" in a class name (e.g. "Gym Strength
// Class") is NOT access — only these explicit access phrasings are.
const GYM_ACCESS_PATTERNS: RegExp[] = [
  /\bopen gym\b/,
  /\bgym (access|pass|day ?pass|membership)\b/,
  /\b(day|gym) pass\b/,
  /\bdrop[- ]?in gym\b/,
];

/** True when a marketplace listing is gym access (a venue to train), not a coached class. */
export function isGymAccessListing(name: string | null | undefined, category?: string | null): boolean {
  const text = `${name ?? ''} ${category ?? ''}`.toLowerCase();
  return GYM_ACCESS_PATTERNS.some(re => re.test(text));
}

/**
 * Interprets the AI-generated free-text `activity` (e.g. "Gym — full-body
 * strength", "Football session") into one canonical key. Picks whichever
 * known keyword appears EARLIEST in the text, so a compound description
 * like "Football or brisk walk" resolves to the activity actually named
 * first rather than whichever alias happens to iterate first.
 */
export function normalizeActivity(activityText: string, category: ActivityCategory): NormalizedActivityKey {
  const text = activityText.toLowerCase();
  let bestKey: NormalizedActivityKey | null = null;
  let bestIndex = Infinity;
  for (const [key, aliases] of Object.entries(ACTIVITY_ALIASES) as [NormalizedActivityKey, string[]][]) {
    for (const alias of aliases) {
      const idx = text.indexOf(alias);
      if (idx !== -1 && idx < bestIndex) {
        bestIndex = idx;
        bestKey = key;
      }
    }
  }
  if (bestKey) return bestKey;

  // No recognizable keyword in the free text — fall back on the AI's own
  // category field with a conservative guess.
  switch (category) {
    case 'strength': return 'gym';
    case 'mobility': return 'mobility';
    case 'cardio': return 'walking';
    default: return 'other';
  }
}

// ── Self-directed routing (ExerciseDB / Strava) ─────────────────────────────

/**
 * Deterministic table of which existing ACP self-directed capability, if
 * any, can help fulfil a given activity. Reuses existing screens only —
 * `/browse-exercises` (read-only exercise/workout catalogue; manual workout
 * building was removed — ACP Intelligence™ now auto-generates strength
 * workouts instead, see services/activity-recommendation-service.ts),
 * `/strava-settings` (connect) and `/outdoor-activities` (view synced
 * activity), both already shipped. Returns undefined when neither
 * integration genuinely supports the activity (yoga/football/swimming/
 * boxing/mobility) — that's a finding, not an oversight; see module header.
 */
export function getSelfDirectedSource(key: NormalizedActivityKey, stravaConnected: boolean): SelfDirectedFulfilment | undefined {
  switch (key) {
    case 'gym':
      return { source: 'exercise_db', title: 'Explore strength exercises', navigationTarget: '/browse-exercises' };
    case 'running':
    case 'walking':
    case 'cycling':
      return stravaConnected
        ? { source: 'strava', title: 'Track your activity', navigationTarget: '/outdoor-activities' }
        : { source: 'strava', title: 'Track your activity with Strava', navigationTarget: '/strava-settings' };
    default:
      return undefined;
  }
}

// ── Day → upcoming calendar date ────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/**
 * Maps a plan day name ("Wednesday") to the next occurrence of that weekday
 * on/after `anchor` (today's date, or a fixed date in tests), as an ISO
 * yyyy-mm-dd string. If `anchor` itself is that weekday, returns `anchor`'s
 * own date (still "upcoming"), matching the spec's example: generated on a
 * Tuesday, "Monday" resolves to *next* Monday (6 days later), not the one
 * already passed this week.
 */
export function nextDateForWeekday(dayName: string, anchor: Date): string | null {
  const target = WEEKDAY_INDEX[dayName.trim().toLowerCase()];
  if (target === undefined) return null;
  const offset = (target - anchor.getDay() + 7) % 7;
  const result = new Date(anchor);
  result.setDate(anchor.getDate() + offset);
  return result.toISOString().split('T')[0];
}

// ── Marketplace matching ────────────────────────────────────────────────────
/**
 * Marketplace matching fulfils an independently generated
 * ACP Intelligence™ plan.
 *
 * Commercial terms must never influence organic ranking. Nothing in this
 * function reads commission, revenue, sponsorship, or margin data — there
 * is no such input to it at all.
 */
function scoreInventoryItem(
  item: MarketplaceInventoryItem,
  key: NormalizedActivityKey,
  targetDateIso: string,
  todayIso: string,
  planDurationMinutes: number,
): { score: number; reasons: string[]; isAlternateDay: boolean } | null {
  if (!item.isActive) return null;
  if (item.spotsLeft !== null && item.spotsLeft <= 0) return null;
  if (!item.date || item.date < todayIso) return null; // never a past session

  // No forced matches (spec section 15): a generic category match alone is
  // NOT enough to surface an item — only a genuine keyword relationship to
  // the specific plan activity counts as a candidate at all.
  if (!textMatchesActivityKeyword(`${item.name} ${item.category ?? ''}`, key)) return null;

  const reasons: string[] = ['exact_activity_match'];
  let score = 0.6;

  const isSameDay = item.date === targetDateIso;
  if (isSameDay) { score += 0.3; reasons.push('same_day'); }
  else { score += 0.05; reasons.push('alternate_day'); }

  reasons.push('available');
  score += 0.05;

  if (item.durationMinutes != null && Math.abs(item.durationMinutes - planDurationMinutes) <= 15) {
    score += 0.1;
    reasons.push('similar_duration');
  }

  return { score: Math.round(score * 100) / 100, reasons, isAlternateDay: !isSameDay };
}

/**
 * Matches one canonical plan activity against a pre-fetched inventory
 * window (sessions + experiences), returning at most 2 ranked matches —
 * never a "feed", never a forced/generic result. Empty array is a valid,
 * expected outcome when nothing genuinely relevant exists.
 */
export function matchPlanActivityToInventory(
  planActivity: Pick<StartingPlanActivity, 'day' | 'duration_minutes' | 'planned_date'>,
  key: NormalizedActivityKey,
  inventory: MarketplaceInventoryItem[],
  anchor: Date,
): MarketplaceMatch[] {
  if (key === 'other') return [];
  // Day 5 fix: prefer the plan's own stored, historically-stable date over
  // recomputing "next occurrence of this weekday from today" — the latter
  // is what silently turned last week's Monday into next week's Monday on
  // a later visit. Falls back to the old computation only for a plan that
  // predates this field (Part 3 of the Day 5 report).
  const targetDateIso = planActivity.planned_date ?? nextDateForWeekday(planActivity.day, anchor);
  if (!targetDateIso) return [];
  const todayIso = anchor.toISOString().split('T')[0];

  return inventory
    .map(item => {
      const scored = scoreInventoryItem(item, key, targetDateIso, todayIso, planActivity.duration_minutes);
      return scored ? { item, ...scored } : null;
    })
    .filter((x): x is { item: MarketplaceInventoryItem; score: number; reasons: string[]; isAlternateDay: boolean } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ item, score, reasons, isAlternateDay }): MarketplaceMatch => {
      const navigationTarget = item.type === 'session'
        ? { pathname: '/session-details', params: { sessionId: item.id } as Record<string, string> }
        : { pathname: '/experience-details', params: { id: item.id } as Record<string, string> };
      return {
        id: item.id,
        type: item.type,
        title: item.name,
        activityType: item.category ?? key,
        date: item.date!,
        startTime: item.startTime,
        durationMinutes: item.durationMinutes,
        partnerName: item.gymName,
        score,
        matchReasons: reasons,
        isAlternateDay,
        navigationTarget,
        imageUrl: item.imageUrl ?? null,
        priceKes: item.priceKes ?? null,
      };
    });
}

/** Top-level entry point: combines self-directed routing + marketplace matching for one plan activity. */
export function getFulfilmentForActivity(
  planActivity: StartingPlanActivity,
  index: number,
  inventory: MarketplaceInventoryItem[],
  stravaConnected: boolean,
  anchor: Date,
): PlanActivityFulfilment {
  const key = normalizeActivity(planActivity.activity || planActivity.title, planActivity.category);
  return {
    planActivityIndex: index,
    selfDirected: getSelfDirectedSource(key, stravaConnected),
    marketplaceMatches: matchPlanActivityToInventory(planActivity, key, inventory, anchor),
  };
}

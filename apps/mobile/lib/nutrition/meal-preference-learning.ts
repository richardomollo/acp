// ACP Intelligence™ — Nutrition #022. Deterministic behavioural preference
// learning: no LLM, no embeddings, no randomness — a function of the user's
// own recorded events over their own recommendation/consumption history.
//
// The core rule (spec §8): what a user ACTUALLY eats outranks what Lana
// merely displayed. A recommendation shown and ignored carries zero weight
// of its own; repeated real consumption raises a meal's future ranking;
// repeatedly swapping a meal away lowers it. Spec §9 also requires variety
// pressure — familiarity must not become "eat the same thing forever" — so a
// meal consumed very recently is penalised even while it stays familiar
// long-term. Every weight/window below is an explicit, tested constant.

import type { MealSlot } from './food-types.ts';

export type MealPreferenceEventType = 'displayed' | 'consumed' | 'swapped_away' | 'saved';

export interface MealPreferenceEvent {
  /** mealCandidateKey(source, id) — see nutrition-meal-model.ts */
  mealKey: string;
  slot: MealSlot;
  type: MealPreferenceEventType;
  /** local calendar date (YYYY-MM-DD) the event happened on */
  localDate: string;
}

// §8 — event weights. 'displayed' carries none of its own: being shown a
// recommendation is not evidence the user wants it (spec §8/test 5). Actual
// consumption is the strongest signal there is; a saved meal is an explicit
// "I like this" the user typed themselves, so it counts nearly as strongly.
// Swapping away is a real (if softer) rejection signal.
const EVENT_WEIGHT: Record<MealPreferenceEventType, number> = {
  consumed: 3,
  saved: 2,
  swapped_away: -1.5,
  displayed: 0,
};

// §9 — recent-repetition penalty. Only the last few days apply pressure, and
// it decays fast — a meal eaten 4+ days ago contributes no variety penalty at
// all, so long-term familiarity (the EVENT_WEIGHT sum above) is never
// permanently suppressed, only nudged on the days right after eating it.
const RECENT_PENALTY_BY_DAYS_AGO: Record<number, number> = { 0: 2, 1: 1.2, 2: 0.6 };
const RECENT_PENALTY_WINDOW_DAYS = 3;

// Caps the raw weighted sum before it's blended with other ranking signals
// (the orchestrator normalises to 0..1) — prevents one extremely
// over-repeated meal from mathematically drowning out everything else.
const FAMILIARITY_CAP = 12;

export interface MealPreferenceScore {
  mealKey: string;
  /** raw weighted event sum, before the recent-repetition penalty, clamped to [0, FAMILIARITY_CAP] */
  familiarity: number;
  recentRepetitionPenalty: number;
  /** familiarity - penalty, clamped to >= 0 — the orchestrator normalises this further */
  netScore: number;
  consumedCount: number;
  savedCount: number;
  swappedAwayCount: number;
}

/** Whole calendar days between two local YYYY-MM-DD dates (today - eventDate). Self-contained — no cross-domain import, no Date.now(). */
function daysAgo(eventLocalDate: string, today: string): number {
  const toUtcDays = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return toUtcDays(today) - toUtcDays(eventLocalDate);
}

/**
 * Computes one score per distinct meal key across the given event history.
 * `today` anchors the recent-repetition window; `slot`, when given, restricts
 * scoring to events recorded for that meal occasion (a meal's breakfast
 * history shouldn't inflate its dinner ranking, spec §7/§8).
 */
export function computeMealPreferenceScores(
  events: MealPreferenceEvent[],
  today: string,
  slot?: MealSlot,
): Map<string, MealPreferenceScore> {
  const byKey = new Map<string, MealPreferenceEvent[]>();
  for (const e of events) {
    if (slot && e.slot !== slot) continue;
    if (!byKey.has(e.mealKey)) byKey.set(e.mealKey, []);
    byKey.get(e.mealKey)!.push(e);
  }

  const scores = new Map<string, MealPreferenceScore>();
  for (const [mealKey, mealEvents] of byKey) {
    let familiarity = 0;
    let recentRepetitionPenalty = 0;
    let consumedCount = 0, savedCount = 0, swappedAwayCount = 0;

    for (const e of mealEvents) {
      familiarity += EVENT_WEIGHT[e.type];
      if (e.type === 'consumed') consumedCount++;
      if (e.type === 'saved') savedCount++;
      if (e.type === 'swapped_away') swappedAwayCount++;

      if (e.type === 'consumed') {
        const age = daysAgo(e.localDate, today);
        if (age >= 0 && age < RECENT_PENALTY_WINDOW_DAYS) {
          recentRepetitionPenalty += RECENT_PENALTY_BY_DAYS_AGO[age] ?? 0;
        }
      }
    }

    familiarity = Math.max(0, Math.min(FAMILIARITY_CAP, familiarity));
    const netScore = Math.max(0, familiarity - recentRepetitionPenalty);
    scores.set(mealKey, { mealKey, familiarity, recentRepetitionPenalty, netScore, consumedCount, savedCount, swappedAwayCount });
  }
  return scores;
}

/** Normalises a raw netScore to 0..1 for blending with other ranking signals. */
export function normalisePreferenceScore(netScore: number): number {
  return Math.max(0, Math.min(1, netScore / FAMILIARITY_CAP));
}

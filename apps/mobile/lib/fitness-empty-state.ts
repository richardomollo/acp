// Beta Feedback #019B — Fitness tab empty-state geography fidelity.
//
// The Fitness day empty state must depend on BOTH whether the selected day
// has something to show AND the #019 marketplace availability of the current
// (or explored) location. It must NEVER hide a self-guided / planned workout
// just because there is no local bookable supply.
//
// This is the pure decision only — it reuses the #019 availability status
// verbatim ('available' | 'no_local_inventory' | 'location_unknown') and does
// not implement a second geography system.

export type MarketplaceStatus = 'available' | 'no_local_inventory' | 'location_unknown';

export type FitnessDayState =
  /** the day has a self-guided / scheduled workout — show it normally (§1 CASE 4 / §4) */
  | 'has_planned_workout'
  /** the day has a bookable marketplace session — existing "Sessions are available this day" */
  | 'has_marketplace_session'
  /** nothing on the day, marketplace available (or geo-gating off, or exploring an available market) — existing "Plan something" (§1 CASE 1 / §5 / §8) */
  | 'empty_available'
  /** nothing on the day, no local bookable supply — unsupported-market copy (§1 CASE 2 / §6) */
  | 'empty_no_local_inventory'
  /** nothing on the day, no usable location — "Where should we look?" (§1 CASE 3 / §7) */
  | 'empty_location_unknown';

export interface FitnessDayStateInput {
  /** a bookable marketplace session (class/workout) exists on the selected day */
  hasMarketplaceSessionOnDay: boolean;
  /** a self-guided or trainer-scheduled workout occurs on the selected day */
  hasPlannedWorkoutOnDay: boolean;
  /** the resolved #019 status for the location in effect, or null while unresolved */
  marketplaceStatus: MarketplaceStatus | null;
  /** the #019 kill switch — when false, geography never changes the empty state */
  geoGatingEnabled: boolean;
}

/**
 * A self-guided/planned workout always wins (§4 — never replaced by the
 * unsupported-market notice). Then a marketplace session. Only when the day
 * is genuinely empty does marketplace availability decide the copy — and only
 * to swap the "browse/book supply" CTA, never to remove real activity.
 */
export function resolveFitnessDayState(input: FitnessDayStateInput): FitnessDayState {
  if (input.hasPlannedWorkoutOnDay) return 'has_planned_workout';
  if (input.hasMarketplaceSessionOnDay) return 'has_marketplace_session';

  // Day is empty. Geography only matters when gating is on and a status resolved.
  if (!input.geoGatingEnabled || input.marketplaceStatus == null || input.marketplaceStatus === 'available') {
    return 'empty_available';
  }
  if (input.marketplaceStatus === 'no_local_inventory') return 'empty_no_local_inventory';
  return 'empty_location_unknown';
}

/** True when the state is one of the "day has real activity" outcomes. */
export function fitnessDayHasActivity(state: FitnessDayState): boolean {
  return state === 'has_planned_workout' || state === 'has_marketplace_session';
}

/**
 * Whether a scheduled workout occurs on a given local date. Mirrors the Home
 * screen's `scheduleMatchesDate` so both surfaces agree. `dateStr` /
 * `startDate` are 'YYYY-MM-DD' local calendar strings; `weekdays` is 0=Sun..6=Sat.
 */
export function scheduleOccursOnDate(
  schedule: { start_date: string; recurrence: string; weekdays: number[] },
  dateStr: string,
): boolean {
  if (schedule.recurrence === 'once') return schedule.start_date === dateStr;
  if (dateStr < schedule.start_date) return false;
  if (schedule.recurrence === 'daily') return true;
  return schedule.weekdays.includes(new Date(dateStr + 'T00:00:00').getDay());
}

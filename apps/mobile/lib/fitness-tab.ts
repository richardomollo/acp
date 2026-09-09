// LH-36 — Fitness tab plan-first orchestration (pure, deterministic).
//
// The Fitness tab must show the user's ACTUAL scheduled plan for the selected
// calendar day — the same canonical source My Plan / This Week's Plan / Today
// use (fitness_profile.ai_assessment.starting_plan.activities) — not a
// marketplace/location surface and not a second workout-schedule source.
//
// No React Native, no Supabase, no network. Date handling reuses the shared
// rule (home-intelligence.resolveActivityDate → planned_date wins, else the
// next occurrence of the activity's weekday on/after the anchor, computed with
// the LH-26 local-date helper). No new `new Date("YYYY-MM-DD")` /
// `toISOString().slice(0,10)` date-only logic is introduced here.

import type { StartingPlanActivity } from './ai-assessment';
import { resolveActivityDate } from './home-intelligence.ts';
import type { PlanActivityCompletion } from './completion.ts';

export interface FitnessDayActivity {
  activity: StartingPlanActivity;
  /** index into starting_plan.activities — the identity every plan surface
   *  uses to match plan_activity_completions rows. */
  activityIndex: number;
}

/**
 * The ONE canonical plan activity scheduled for `dateIso` (a local
 * `YYYY-MM-DD`), or `null` when nothing is planned that day. Never fabricates
 * an activity. Uses the exact same date rule as every other plan surface, so
 * the workout shown here for a date is the workout shown on My Plan / This
 * Week's Plan / Today for that date.
 */
export function resolvePlannedActivityForDate(
  activities: readonly StartingPlanActivity[],
  dateIso: string,
  anchor: Date = new Date(),
): FitnessDayActivity | null {
  for (let i = 0; i < activities.length; i++) {
    if (resolveActivityDate(activities[i], anchor) === dateIso) {
      return { activity: activities[i], activityIndex: i };
    }
  }
  return null;
}

/**
 * Whether the plan activity at `activityIndex` has a completion — matched by
 * `activityIndex` alone, identical to My Plan / This Week's Plan
 * (`new Set(completions.map(c => c.activityIndex))`), so completion state is
 * consistent across surfaces for the same session.
 */
export function isActivityCompleted(
  activityIndex: number,
  completions: readonly Pick<PlanActivityCompletion, 'activityIndex'>[],
): boolean {
  return completions.some(c => c.activityIndex === activityIndex);
}

// ── Check-in eligibility ────────────────────────────────────────────────────
// Mirrors app/(tabs)/check-in.tsx exactly:
//   • "upcoming" class bookings are these four statuses (the same set Home's
//     `activeBooking` query uses);
//   • the screen renders its "Check In" button ONLY for a booking that is
//     `status === 'confirmed'` AND `!checked_in` (deposit_paid shows "Pay
//     balance", pending_payment shows nothing, checked_in shows a badge).
// No status name is invented here — every value comes from that screen.

export const FITNESS_UPCOMING_BOOKING_STATUSES = [
  'pending_payment', 'deposit_paid', 'confirmed', 'checked_in',
] as const;

export interface FitnessBookingRow {
  id: string;
  /** local `YYYY-MM-DD` */
  booking_date: string;
  status: string;
  checked_in?: boolean | null;
  /** present on rows from the app's own `.eq('user_id', …)` query; the guard
   *  below is defensive only. */
  user_id?: string | null;
}

/**
 * True when this class booking is check-in-eligible for `dateIso` — the same
 * gate the Bookings/Check-in screen uses to show its "Check In" button:
 * belongs to the current user, dated on the selected day, `confirmed`, and not
 * already checked in (which also excludes cancelled/expired/checked-in rows,
 * since those never carry `status === 'confirmed'` with `checked_in !== true`).
 */
export function isCheckInEligibleForDate(
  booking: FitnessBookingRow,
  dateIso: string,
  currentUserId: string,
): boolean {
  return booking.booking_date === dateIso
    && (booking.user_id == null || booking.user_id === currentUserId)
    && booking.status === 'confirmed'
    && booking.checked_in !== true;
}

/** Every check-in-eligible booking for the selected day (there can be more
 *  than one — see the LH-36 report §F). The caller shows a single "Check in"
 *  entry point that opens the existing Check-in screen, where the user picks
 *  the specific booking; this never silently chooses one. */
export function checkInEligibleBookingsForDate(
  bookings: readonly FitnessBookingRow[],
  dateIso: string,
  currentUserId: string,
): FitnessBookingRow[] {
  return bookings.filter(b => isCheckInEligibleForDate(b, dateIso, currentUserId));
}

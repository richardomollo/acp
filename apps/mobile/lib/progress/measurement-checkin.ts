// Beta Feedback #020 / #020B — weekly measurement check-in: the
// deterministic due-state contract.
//
// #020B change: the reminder day is now ANCHORED to a stable weekday
// (default Friday) instead of drifting 7 days from the last log. The day the
// user happens to measure never moves the schedule — a late Sunday log still
// leaves the next check-in on the following Friday.
//
// Every comparison is on the user's LOCAL calendar date (§6/§17): the caller
// passes `localISODate(...)` strings; nothing here touches Date.now() or a
// UTC offset.

export type MeasurementCheckinStatus =
  | 'not_due'
  | 'due_today'
  | 'overdue'
  | 'completed_today';

/** Days in a check-in week — one weekday anchor to the next. */
export const MEASUREMENT_CADENCE_DAYS = 7;

/** Lana MVP default anchor: Friday. JS weekday convention: 0=Sun … 5=Fri … 6=Sat. */
export const DEFAULT_CHECKIN_WEEKDAY = 5;

export interface MeasurementCheckinInput {
  /** local calendar date (YYYY-MM-DD) of the user's most recent measurement,
   *  or null when they have no measurement history at all */
  lastMeasurementLocalDate: string | null;
  /** the user's local calendar date today (YYYY-MM-DD) */
  todayLocalDate: string;
  /** the anchored check-in weekday (0=Sun…6=Sat); defaults to Friday */
  checkinWeekday?: number;
}

export interface MeasurementCheckinResult {
  status: MeasurementCheckinStatus;
  /** the anchored weekday date this verdict is about — the current check-in
   *  Friday (today if today is the anchor, else the most recent past one). */
  currentAnchorLocalDate: string;
  /** the next check-in weekday date the user should aim for after this one. */
  nextDueLocalDate: string;
  /** whole local days since the last measurement (null with no history). */
  daysSinceLast: number | null;
}

// ── pure local-calendar-date helpers (no tz maths) ───────────────────────

/** Adds `n` days to a YYYY-MM-DD string. */
export function addLocalDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function localDayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Day of week for a YYYY-MM-DD string, 0=Sun … 6=Sat (calendar, tz-safe). */
export function localWeekday(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The most recent occurrence of `weekday` on or before `localDate`. */
export function mostRecentWeekdayOnOrBefore(localDate: string, weekday: number): string {
  const back = (localWeekday(localDate) - weekday + 7) % 7;
  return addLocalDays(localDate, -back);
}

/** The first occurrence of `weekday` strictly after `localDate`. */
export function firstWeekdayAfter(localDate: string, weekday: number): string {
  const fwd = ((weekday - localWeekday(localDate) + 7) % 7) || 7;
  return addLocalDays(localDate, fwd);
}

/**
 * The anchor weekday a measurement dated `m` is credited to: the NEAREST
 * occurrence of `weekday`, ties broken toward the earlier (past) one.
 *
 * This is what keeps the schedule stable:
 *   • a Wed / Thu log → credited to the upcoming Friday (early check-in, §3)
 *   • a Sat / Sun / Mon log → credited to the Friday just gone (late close of
 *     that overdue window, §4) — it does NOT roll forward to the next Friday,
 *     so the following Friday is due again.
 */
export function measurementAnchor(m: string, weekday: number): string {
  const dow = localWeekday(m);
  const toNext = (weekday - dow + 7) % 7;
  const toPrev = (dow - weekday + 7) % 7;
  return toNext < toPrev ? addLocalDays(m, toNext) : addLocalDays(m, -toPrev);
}

/**
 * The deterministic due state, anchored to `checkinWeekday`.
 *
 *   currentAnchor = most recent `checkinWeekday` on or before today
 *                   (today itself when today IS the anchor weekday)
 *
 *   satisfied  = a measurement credited to `currentAnchor` or later
 *                (measurementAnchor(last) >= currentAnchor), OR — while we are
 *                past the anchor with it unmet — any measurement logged after
 *                the anchor (a late close of the overdue window, §4)
 *
 *   satisfied + measured today   → completed_today
 *   satisfied + measured earlier → not_due
 *   not satisfied + today is the anchor weekday → due_today
 *   not satisfied + today is past the anchor    → overdue
 *   not satisfied + today is before this week's anchor → not_due
 *
 *   No history at all → due only ON the anchor weekday; never overdue (there
 *   is no baseline to be overdue from — §5). An onboarded user always has a
 *   measurement row (onboarding writes one), so this only applies to a
 *   genuinely empty account.
 */
export function getMeasurementCheckinStatus(input: MeasurementCheckinInput): MeasurementCheckinResult {
  const weekday = normaliseWeekday(input.checkinWeekday);
  const { lastMeasurementLocalDate, todayLocalDate } = input;

  const currentAnchorLocalDate = mostRecentWeekdayOnOrBefore(todayLocalDate, weekday);
  const daysPastAnchor = localDayDiff(currentAnchorLocalDate, todayLocalDate); // 0 on the anchor weekday, else 1..6
  const isAnchorToday = daysPastAnchor === 0;

  const base = (status: MeasurementCheckinStatus): MeasurementCheckinResult => ({
    status,
    currentAnchorLocalDate,
    nextDueLocalDate:
      status === 'due_today'
        ? currentAnchorLocalDate
        : status === 'overdue'
          ? currentAnchorLocalDate
          : firstWeekdayAfter(todayLocalDate, weekday),
    daysSinceLast: lastMeasurementLocalDate ? localDayDiff(lastMeasurementLocalDate, todayLocalDate) : null,
  });

  if (lastMeasurementLocalDate) {
    const creditedAnchor = measurementAnchor(lastMeasurementLocalDate, weekday);
    const creditsCurrentOrLater = localDayDiff(currentAnchorLocalDate, creditedAnchor) >= 0;
    const lateCloseOfOverdue =
      daysPastAnchor > 0 && localDayDiff(currentAnchorLocalDate, lastMeasurementLocalDate) > 0;

    if (creditsCurrentOrLater || lateCloseOfOverdue) {
      return base(localDayDiff(lastMeasurementLocalDate, todayLocalDate) <= 0 ? 'completed_today' : 'not_due');
    }
    // current window unmet, and there IS prior history → due / overdue
    return base(isAnchorToday ? 'due_today' : 'overdue');
  }

  // No measurement history at all — never overdue (§5).
  return base(isAnchorToday ? 'due_today' : 'not_due');
}

function normaliseWeekday(w: number | undefined): number {
  return typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 6 ? w : DEFAULT_CHECKIN_WEEKDAY;
}

/** True when the check-in card / notification should be offered. */
export function isMeasurementCheckinActionable(status: MeasurementCheckinStatus): boolean {
  return status === 'due_today' || status === 'overdue';
}

// ── Copy (§6/§8/§15/§25 — neutral, evidence-collection, never body-judgement) ──

export const MEASUREMENT_CHECKIN_COPY = {
  eyebrow: 'WEEKLY CHECK-IN',
  dueTitle: 'Time to update your measurements.',
  overdueTitle: 'Your weekly check-in is due.',
  body: 'Add your latest measurements so Lana can track your progress over time.',
  cta: 'Update measurements',
} as const;

/** Lock-screen-safe notification copy — no measurement values (§26). */
export const MEASUREMENT_CHECKIN_NOTIFICATION = {
  title: 'Weekly check-in',
  body: 'Add your latest measurements to keep your progress up to date.',
} as const;

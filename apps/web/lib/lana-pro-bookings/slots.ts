// LANA PRO — Phase 4.3: direct-booking slot maths + eligibility (PURE).
//
// Powers "Clients → client → Schedule session" (§7). Reuses the same shape the
// existing consumer BookingModal already generates from `pt_availability`, and
// adds the guardrails the spec wants tested: service must be active, slot must
// fall inside availability, duration must fit, no double-book, capacity for
// classes.
//
// Wall-clock strings only — no timezone conversion (§19). Unit-tested.

import { isBookable, type ServiceStatus } from '../lana-pro-services/service-status.ts';
import { isOperationallyActive, type LanaBooking } from './booking-model.ts';

// ── time helpers (minutes since midnight; string 'HH:MM') ────────────────

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 0 = Monday … 6 = Sunday, matching pt_availability.day_of_week.
 *  Derived from a 'YYYY-MM-DD' string WITHOUT constructing a Date in local
 *  time (avoids the off-by-one day-shift the spec warns about). */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Zeller-free: use UTC date, which is safe because we only read getUTCDay.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun…6=Sat
  return (dow + 6) % 7; // → 0=Mon…6=Sun
}

export interface AvailWindow {
  /** 0=Mon…6=Sun */
  day: number;
  start: string; // 'HH:MM'
  end: string;
}

/** pt_availability rows → windows for one date. */
export function windowsForDate(
  rows: readonly { day_of_week: number; start_time: string; end_time: string }[],
  dateStr: string,
): AvailWindow[] {
  const day = isoWeekday(dateStr);
  return rows
    .filter((r) => r.day_of_week === day)
    .map((r) => ({ day, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }))
    .filter((w) => toMinutes(w.start) < toMinutes(w.end))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ── slot generation ─────────────────────────────────────────────────────

export interface SlotOptions {
  durationMinutes: number;
  /** step between candidate starts; defaults to durationMinutes (matches the
   *  existing consumer flow). */
  stepMinutes?: number;
  /** 'HH:MM' — hide slots that start before this (used for "today"). */
  notBefore?: string;
  /** existing bookings ON THIS DATE to exclude by overlap. */
  busy?: { start: string; durationMinutes: number }[];
  /** blocked whole date? */
  dateBlocked?: boolean;
}

/**
 * Bookable start times for one date. A slot is offered only if
 * [start, start+duration] fits ENTIRELY inside an availability window (§16) and
 * does not overlap an existing booking (§ no double-book).
 */
export function generateSlots(windows: readonly AvailWindow[], opts: SlotOptions): string[] {
  if (opts.dateBlocked) return [];
  const dur = opts.durationMinutes;
  if (!dur || dur <= 0) return [];
  const step = opts.stepMinutes && opts.stepMinutes > 0 ? opts.stepMinutes : dur;
  const floor = opts.notBefore ? toMinutes(opts.notBefore) : -Infinity;
  const busy = (opts.busy ?? []).map((b) => ({ s: toMinutes(b.start), e: toMinutes(b.start) + b.durationMinutes }));

  const out: string[] = [];
  for (const w of windows) {
    const ws = toMinutes(w.start);
    const we = toMinutes(w.end);
    for (let m = ws; m + dur <= we; m += step) {
      if (m < floor) continue;
      const slotEnd = m + dur;
      const clashes = busy.some((b) => m < b.e && slotEnd > b.s);
      if (clashes) continue;
      out.push(fromMinutes(m));
    }
  }
  // de-dupe (overlapping windows) + sort
  return Array.from(new Set(out)).sort();
}

/** Is a specific chosen start time valid? (final server-side-style check) */
export function slotIsWithinAvailability(
  windows: readonly AvailWindow[],
  start: string,
  durationMinutes: number,
): boolean {
  const s = toMinutes(start);
  const e = s + durationMinutes;
  return windows.some((w) => toMinutes(w.start) <= s && e <= toMinutes(w.end));
}

export function slotClashes(
  busy: readonly { start: string; durationMinutes: number }[],
  start: string,
  durationMinutes: number,
): boolean {
  const s = toMinutes(start);
  const e = s + durationMinutes;
  return busy.some((b) => {
    const bs = toMinutes(b.start);
    return s < bs + b.durationMinutes && e > bs;
  });
}

// ── eligibility (§7, §13, §21) ──────────────────────────────────────────

export interface DirectBookingEligibility {
  ok: boolean;
  reasons: string[];
}

/**
 * Can this professional create a direct booking for this client with this
 * service? Pure gate — the UI enforces it and the RLS policy backs it.
 */
export function checkDirectBookingEligibility(input: {
  /** the client is an active pt_clients relationship (§7 precondition). */
  clientRelationship: 'active' | 'pending' | 'inactive' | 'none';
  serviceStatus: ServiceStatus;
  serviceIsProgramme?: boolean;
  chosenDate?: string;
  chosenTime?: string;
  durationMinutes?: number;
  availabilityWindows?: readonly AvailWindow[];
  busyOnDate?: readonly { start: string; durationMinutes: number }[];
  /** today, to reject past dates */
  todayStr?: string;
}): DirectBookingEligibility {
  const reasons: string[] = [];

  if (input.serviceIsProgramme) reasons.push('service_is_programme'); // §23 — never
  if (!isBookable(input.serviceStatus)) reasons.push('service_not_active'); // §13, §21.13

  // A booking must not conjure a relationship (§23). Direct booking requires an
  // EXISTING active client; a pending/none relationship is not enough here.
  if (input.clientRelationship !== 'active') reasons.push('client_not_active');

  if (input.chosenDate && input.todayStr && input.chosenDate < input.todayStr) {
    reasons.push('date_in_past');
  }

  if (input.chosenDate && input.chosenTime && input.durationMinutes) {
    const dur = input.durationMinutes;
    if (input.availabilityWindows) {
      if (!slotIsWithinAvailability(input.availabilityWindows, input.chosenTime, dur)) {
        reasons.push('outside_availability'); // §16
      }
    }
    if (input.busyOnDate && slotClashes(input.busyOnDate, input.chosenTime, dur)) {
      reasons.push('slot_taken');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

// ── class capacity (§17, §23) ──────────────────────────────────────────

export function classHasSpace(args: {
  bookedActive: number;
  capacity: number | null | undefined;
}): boolean {
  if (args.capacity == null) return true; // uncapped
  return args.bookedActive < args.capacity;
}

// ── busy-set from existing bookings ────────────────────────────────────

/** The professional's existing bookings on a date → a busy set for slot maths.
 *  Cancelled / no-show do not block a slot (§18). */
export function busyFromBookings(
  bookings: readonly LanaBooking[],
  dateStr: string,
): { start: string; durationMinutes: number }[] {
  return bookings
    .filter((b) => isOperationallyActive(b.status) && b.startAt.slice(0, 10) === dateStr)
    .map((b) => {
      const start = b.startAt.slice(11, 16);
      const dur = b.endAt
        ? Math.max(15, (toMinutes(b.endAt.slice(11, 16)) - toMinutes(start)))
        : 60;
      return { start, durationMinutes: dur };
    });
}

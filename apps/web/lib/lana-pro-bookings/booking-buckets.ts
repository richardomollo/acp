// LANA PRO — Phase 4.3: booking bucketing / sort / search (PURE).
//
// Deterministic. Wall-clock string comparison only — no timezone conversion,
// no UTC day-shift (§19). Unit-tested with `node --test`.

import {
  isOperationallyActive,
  isCancelled,
  isNoShow,
  isCompleted,
  type LanaBooking,
} from './booking-model.ts';

export type BookingBucket = 'today' | 'upcoming' | 'past' | 'cancelled';

/** Chronological; id-tiebroken so ordering is fully deterministic. */
export function sortBookings(bookings: readonly LanaBooking[]): LanaBooking[] {
  return [...bookings].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
  );
}

/** Same wall-clock calendar day (YYYY-MM-DD prefix). */
export function isSameLocalDay(iso: string, nowIso: string): boolean {
  return iso.slice(0, 10) === nowIso.slice(0, 10);
}

/**
 * Bucket for one booking, relative to `nowIso`:
 *   cancelled — status cancelled / no_show / rescheduled  (never "active", §18)
 *   past      — completed, or an active booking whose end (or start) is behind us
 *   today     — active AND on the current calendar day
 *   upcoming  — active AND on a future day
 */
export function bucketOf(b: LanaBooking, nowIso: string): BookingBucket {
  // no_show and completed are history; cancelled/rescheduled go to Cancelled.
  if (isCancelled(b.status)) return 'cancelled';
  if (isNoShow(b.status) || isCompleted(b.status)) return 'past';
  if (isSameLocalDay(b.startAt, nowIso)) return 'today';
  const end = b.endAt ?? b.startAt;
  return end < nowIso ? 'past' : 'upcoming';
}

export interface BucketedBookings {
  today: LanaBooking[];
  upcoming: LanaBooking[];
  past: LanaBooking[];
  cancelled: LanaBooking[];
  all: LanaBooking[];
}

export function bucketBookings(bookings: readonly LanaBooking[], nowIso: string): BucketedBookings {
  const sorted = sortBookings(bookings);
  const out: BucketedBookings = { today: [], upcoming: [], past: [], cancelled: [], all: sorted };
  for (const b of sorted) out[bucketOf(b, nowIso)].push(b);
  // Past reads most-recent-first.
  out.past.reverse();
  return out;
}

/** Case-insensitive match on client / service / class / venue name. */
export function searchBookings(bookings: readonly LanaBooking[], query: string): LanaBooking[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...bookings];
  return bookings.filter((b) =>
    [b.clientName, b.serviceName, b.title, b.venueName]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q)),
  );
}

// ── counts (safe — from relationship/lifecycle state only, never fabricated) ──

export function countActiveOn(bookings: readonly LanaBooking[], nowIso: string): number {
  return bookings.filter((b) => isOperationallyActive(b.status) && isSameLocalDay(b.startAt, nowIso)).length;
}

export function countByKindOn(
  bookings: readonly LanaBooking[],
  nowIso: string,
  kind: LanaBooking['kind'],
): number {
  return bookings.filter(
    (b) => b.kind === kind && isOperationallyActive(b.status) && isSameLocalDay(b.startAt, nowIso),
  ).length;
}

// ── capability-aware visibility (§17) ─────────────────────────────────────

export interface BookingVisibility {
  /** independent PT / nutritionist / staff PT → sees appointments */
  appointments: boolean;
  /** studio / gym / spa → sees classes */
  classes: boolean;
  /** gym / spa → sees access (when the model exists) */
  access: boolean;
}

export function visibilityFor(caps: {
  isIndependentPro: boolean;
  isStaffTrainer: boolean;
  ownsVenue: boolean;
  venueDoesClasses: boolean;
  venueDoesAccess: boolean;
  /** Phase 4.6 — the venue sells team-delivered appointment services (gym_services). */
  venueDoesAppointments?: boolean;
}): BookingVisibility {
  return {
    appointments:
      caps.isIndependentPro || caps.isStaffTrainer || (caps.ownsVenue && !!caps.venueDoesAppointments),
    classes: caps.ownsVenue && caps.venueDoesClasses,
    access: caps.ownsVenue && caps.venueDoesAccess,
  };
}

export function filterVisible(bookings: readonly LanaBooking[], vis: BookingVisibility): LanaBooking[] {
  return bookings.filter((b) => {
    if (b.kind === 'appointment') return vis.appointments;
    if (b.kind === 'class') return vis.classes;
    if (b.kind === 'access') return vis.access;
    return false;
  });
}

// ── class attendee roll-up ───────────────────────────────────────────────

export interface ClassRollup {
  classId: string;
  title: string;
  startAt: string;
  endAt?: string;
  venueId?: string;
  capacity?: number;
  bookedCount: number;
  checkedInCount: number;
  attendees: LanaBooking[];
  /** true when bookedCount would exceed capacity — surfaced, never silently allowed (§23) */
  overCapacity: boolean;
}

/** Roll individual class-attendee bookings up into one entry per occurrence.
 *  Cancelled / no-show attendees do NOT count toward booked (§18). */
export function rollUpClasses(classBookings: readonly LanaBooking[]): ClassRollup[] {
  const byClass = new Map<string, LanaBooking[]>();
  for (const b of classBookings) {
    if (b.kind !== 'class' || !b.classId) continue;
    if (!byClass.has(b.classId)) byClass.set(b.classId, []);
    byClass.get(b.classId)!.push(b);
  }
  const out: ClassRollup[] = [];
  for (const [classId, rows] of byClass) {
    const sorted = sortBookings(rows);
    const active = sorted.filter((r) => isOperationallyActive(r.status));
    const rep = sorted[0];
    const capacity = rep.capacity;
    out.push({
      classId,
      title: rep.title,
      startAt: rep.startAt,
      endAt: rep.endAt,
      venueId: rep.venueId,
      capacity,
      bookedCount: active.length,
      checkedInCount: active.filter((r) => r.checkedIn).length,
      attendees: sorted,
      overCapacity: capacity != null && active.length > capacity,
    });
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.classId.localeCompare(b.classId));
}

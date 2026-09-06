// LANA PRO — Phase 4.3: operational schedule aggregation (PURE).
//
// Combines appointment bookings + class occurrences (+ an availability summary
// per day) into ONE ordered timeline. Availability is shown as a light
// summary, NOT thousands of theoretical slots (§5). Wall-clock strings only.
//
// Home, /bookings and /schedule all derive "today" from HERE — one definition
// (§12). Unit-tested with `node --test`.

import {
  isOperationallyActive,
  type LanaBooking,
} from './booking-model.ts';
import { rollUpClasses, sortBookings, type ClassRollup } from './booking-buckets.ts';
import { summariseDay, type WeekSchedule } from '../lana-pro-services/availability-model.ts';
import type { TodayItem } from '../lana-pro-workspace/today.ts';

export type ScheduleEntryKind = 'appointment' | 'class' | 'availability';

export interface ScheduleEntry {
  id: string;
  kind: ScheduleEntryKind;
  startAt: string;
  endAt?: string;
  title: string;
  subtitle?: string;
  status?: string;
  bookedCount?: number;
  capacity?: number;
  href?: string;
}

/** Appointments + class roll-ups for one date, chronological. Availability is
 *  added as a single leading summary entry when `availabilitySummary` is given
 *  and there is open time. */
export function scheduleForDate(args: {
  dateStr: string;
  appointments: readonly LanaBooking[];
  classRollups: readonly ClassRollup[];
  availabilitySummary?: string; // e.g. "09:00–17:00"
}): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];

  if (args.availabilitySummary && args.availabilitySummary !== 'Unavailable') {
    entries.push({
      id: `avail:${args.dateStr}`,
      kind: 'availability',
      startAt: `${args.dateStr}T00:00:00`,
      title: 'Open for bookings',
      subtitle: args.availabilitySummary,
    });
  }

  for (const a of args.appointments) {
    if (a.startAt.slice(0, 10) !== args.dateStr) continue;
    entries.push({
      id: a.id,
      kind: 'appointment',
      startAt: a.startAt,
      endAt: a.endAt,
      title: a.clientName || a.title,
      subtitle: a.serviceName || a.title,
      status: a.status,
      href: a.href,
    });
  }

  for (const c of args.classRollups) {
    if (c.startAt.slice(0, 10) !== args.dateStr) continue;
    entries.push({
      id: `cls:${c.classId}`,
      kind: 'class',
      startAt: c.startAt,
      endAt: c.endAt,
      title: c.title,
      subtitle: 'Class',
      bookedCount: c.bookedCount,
      capacity: c.capacity,
      href: `/lana-pro/bookings/class/${c.classId}`,
    });
  }

  return entries.sort(
    (a, b) =>
      a.startAt.localeCompare(b.startAt) ||
      kindRank(a.kind) - kindRank(b.kind) ||
      a.id.localeCompare(b.id),
  );
}

function kindRank(k: ScheduleEntryKind): number {
  return k === 'availability' ? 0 : k === 'appointment' ? 1 : 2;
}

// ── week view ──────────────────────────────────────────────────────────

export interface WeekDayColumn {
  dateStr: string;
  /** 0=Mon…6=Sun */
  weekday: number;
  entries: ScheduleEntry[];
  availabilitySummary?: string;
  appointmentCount: number;
  classCount: number;
}

/** Seven consecutive dates starting at `mondayStr`. */
export function weekDates(mondayStr: string): string[] {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(base + i * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Monday (YYYY-MM-DD) of the week containing `dateStr`. */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const deltaToMon = (dow + 6) % 7;
  return new Date(Date.UTC(y, m - 1, d) - deltaToMon * 86_400_000).toISOString().slice(0, 10);
}

export function buildWeek(args: {
  mondayStr: string;
  appointments: readonly LanaBooking[];
  classBookings: readonly LanaBooking[];
  availabilityWeek?: WeekSchedule;
}): WeekDayColumn[] {
  const dates = weekDates(args.mondayStr);
  const rollups = rollUpClasses(args.classBookings);
  return dates.map((dateStr, i) => {
    const summary = args.availabilityWeek
      ? summariseDay(args.availabilityWeek[i])
      : undefined;
    const entries = scheduleForDate({
      dateStr,
      appointments: args.appointments,
      classRollups: rollups,
      availabilitySummary: summary,
    });
    return {
      dateStr,
      weekday: i,
      entries,
      availabilitySummary: summary && summary !== 'Unavailable' ? summary : undefined,
      appointmentCount: entries.filter((e) => e.kind === 'appointment').length,
      classCount: entries.filter((e) => e.kind === 'class').length,
    };
  });
}

// ── the ONE "today" definition (§12) ───────────────────────────────────

/** Bridge LanaBooking → the 4.1 TodayItem shape so Home reuses the tested
 *  `buildProfessionalHome` / `buildBusinessHome` without a parallel query. */
export function bookingToTodayItem(b: LanaBooking): TodayItem {
  return {
    id: b.id,
    kind: b.kind === 'class' ? 'class' : b.kind === 'access' ? 'access' : 'appointment',
    title: b.kind === 'class' ? b.title : b.serviceName || b.title,
    startAt: b.startAt,
    endAt: b.endAt,
    clientName: b.kind === 'class' ? undefined : b.clientName,
    providerName: b.professionalName,
    bookedCount: b.bookedCount,
    capacity: b.capacity,
    href: b.href,
    status: b.status,
  };
}

/** Today's operational items for Home, from the same normaliser /bookings uses. */
export function todayItemsFrom(args: {
  appointments: readonly LanaBooking[];
  classBookings: readonly LanaBooking[];
  nowIso: string;
}): TodayItem[] {
  const day = args.nowIso.slice(0, 10);
  const appts = args.appointments.filter(
    (b) => isOperationallyActive(b.status) && b.startAt.slice(0, 10) === day,
  );
  const classes = rollUpClasses(args.classBookings)
    .filter((c) => c.startAt.slice(0, 10) === day)
    .map<TodayItem>((c) => ({
      id: `cls:${c.classId}`,
      kind: 'class',
      title: c.title,
      startAt: c.startAt,
      endAt: c.endAt,
      bookedCount: c.bookedCount,
      capacity: c.capacity,
      href: `/lana-pro/bookings/class/${c.classId}`,
    }));
  return sortBookings(appts).map(bookingToTodayItem).concat(classes).sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
  );
}

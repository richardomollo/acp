// LANA PRO — Phase 4.2: general availability model (PURE).
//
// AVAILABILITY ("I could accept an appointment then") is kept strictly distinct
// from SCHEDULED ACTIVITY ("this class actually occurs then", handled by
// class-scheduling.ts). This never generates sessions (§6).
//
// Rides the EXISTING `pt_availability` table unchanged:
//   day_of_week 0=Mon … 6=Sun, start_time/end_time TIME,
//   offering_id NULL = general schedule, non-null = per-service override.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export interface TimeRange {
  /** 'HH:MM' */
  start: string;
  /** 'HH:MM' */
  end: string;
}

export interface DaySchedule {
  /** 0 = Monday … 6 = Sunday (matches pt_availability.day_of_week). */
  day: number;
  enabled: boolean;
  ranges: TimeRange[];
}

export type WeekSchedule = DaySchedule[];

export interface AvailabilityRow {
  day_of_week: number;
  start_time: string; // 'HH:MM[:SS]'
  end_time: string;
}

const hhmm = (t: string): string => (t ?? '').slice(0, 5);

export function emptyWeek(): WeekSchedule {
  return Array.from({ length: 7 }, (_, day) => ({ day, enabled: false, ranges: [] }));
}

/** pt_availability rows → a 7-day grid. Unknown days are ignored; ranges are
 *  sorted by start. */
export function weekFromRows(rows: readonly AvailabilityRow[]): WeekSchedule {
  const week = emptyWeek();
  for (const r of rows) {
    if (r.day_of_week < 0 || r.day_of_week > 6) continue;
    const start = hhmm(r.start_time);
    const end = hhmm(r.end_time);
    if (!start || !end) continue;
    week[r.day_of_week].enabled = true;
    week[r.day_of_week].ranges.push({ start, end });
  }
  for (const d of week) d.ranges.sort((a, b) => a.start.localeCompare(b.start));
  return week;
}

/** A 7-day grid → pt_availability insert rows for one scope. Drops invalid
 *  ranges (start ≥ end) and days that are disabled or empty. */
export function weekToRows(
  week: WeekSchedule,
  scope: { pt_id: string; offering_id?: string | null },
): Array<AvailabilityRow & { pt_id: string; offering_id?: string }> {
  const out: Array<AvailabilityRow & { pt_id: string; offering_id?: string }> = [];
  for (const d of week) {
    if (!d.enabled) continue;
    for (const r of d.ranges) {
      if (!(r.start < r.end)) continue;
      const row: AvailabilityRow & { pt_id: string; offering_id?: string } = {
        pt_id: scope.pt_id,
        day_of_week: d.day,
        start_time: r.start,
        end_time: r.end,
      };
      if (scope.offering_id) row.offering_id = scope.offering_id;
      out.push(row);
    }
  }
  return out;
}

/** "09:00 – 17:00", "09:00–12:00, 14:00–18:00", or "Unavailable". */
export function summariseDay(day: DaySchedule): string {
  const valid = day.ranges.filter((r) => r.start < r.end);
  if (!day.enabled || valid.length === 0) return 'Unavailable';
  return valid
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((r) => `${r.start}–${r.end}`)
    .join(', ');
}

export function hasAnyAvailability(week: WeekSchedule): boolean {
  return week.some((d) => d.enabled && d.ranges.some((r) => r.start < r.end));
}

export interface WeekValidationError {
  day: number;
  message: string;
}

/** Per-day validation: each range well-formed, no overlaps. */
export function validateWeek(week: WeekSchedule): WeekValidationError[] {
  const errors: WeekValidationError[] = [];
  for (const d of week) {
    if (!d.enabled) continue;
    const ranges = d.ranges.filter((r) => r.start || r.end);
    if (ranges.length === 0) {
      errors.push({ day: d.day, message: 'Add a time range or turn this day off.' });
      continue;
    }
    for (const r of ranges) {
      if (!(r.start < r.end)) {
        errors.push({ day: d.day, message: 'End time must be after start time.' });
      }
    }
    const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        errors.push({ day: d.day, message: 'Time ranges overlap.' });
        break;
      }
    }
  }
  return errors;
}

/** Half-hour options 00:00 … 23:30 for the pickers. */
export function timeOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

/** A sensible default when a professional first enables a day. */
export const DEFAULT_RANGE: TimeRange = { start: '09:00', end: '17:00' };

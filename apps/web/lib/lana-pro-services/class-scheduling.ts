// LANA PRO — Phase 4.2: class scheduling (PURE).
//
// A class in `sessions` is scheduled inventory: a definition + its occurrences
// are the same rows. "Recurring" = materialise N rows (the pattern the existing
// partner-dashboard already uses — there is NO rrule/series table, and §7 says
// don't invent one). This module owns the date maths + the insert payloads.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

export type RepeatMode = 'none' | 'weekly';

/**
 * Occurrence dates (YYYY-MM-DD) for a class.
 *  - 'none'   → just [startDate]
 *  - 'weekly' → every date from startDate..endDate whose weekday is in
 *               `weekdays` (0=Sunday…6=Saturday, JS getDay()).
 * Capped so a typo can't create thousands of rows.
 */
export function generateOccurrenceDates(args: {
  mode: RepeatMode;
  startDate: string;
  endDate?: string;
  weekdays?: number[];
  cap?: number;
}): string[] {
  const cap = args.cap ?? 60;
  if (args.mode === 'none') return args.startDate ? [args.startDate] : [];
  if (!args.startDate || !args.endDate) return args.startDate ? [args.startDate] : [];
  const days = args.weekdays && args.weekdays.length > 0 ? args.weekdays : undefined;

  const out: string[] = [];
  const cur = new Date(`${args.startDate}T12:00:00Z`);
  const end = new Date(`${args.endDate}T12:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return [];
  while (cur <= end && out.length < cap) {
    const dow = cur.getUTCDay();
    if (!days || days.includes(dow)) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export interface ClassDefInput {
  gymId: string;
  name: string;
  description: string;
  durationMinutes: number;
  capacity: number;
  priceKes: number | null;
  category: string;
  instructorId: string | null;
  time: string; // 'HH:MM'
}

/** One `sessions` insert row per occurrence date. `recurring` flags a series so
 *  the UI can group them, exactly like the existing dashboard. */
export function buildSessionInserts(def: ClassDefInput, dates: string[]): Array<Record<string, unknown>> {
  const recurring = dates.length > 1;
  return dates.map((date) => ({
    gym_id: def.gymId,
    name: def.name.trim(),
    description: def.description.trim() || null,
    date,
    time: def.time,
    duration_minutes: def.durationMinutes,
    max_capacity: def.capacity,
    spots_left: def.capacity,
    category: def.category,
    instructor: '',
    instructor_id: def.instructorId,
    drop_in_price: def.priceKes,
    is_active: true,
    recurring,
  }));
}

export interface ClassScheduleValidation {
  name?: string;
  time?: string;
  date?: string;
  capacity?: string;
  repeat?: string;
}

export function validateClassSchedule(input: {
  name: string;
  time: string;
  startDate: string;
  capacity: number | null;
  mode: RepeatMode;
  endDate?: string;
  weekdays?: number[];
}): ClassScheduleValidation {
  const e: ClassScheduleValidation = {};
  if (input.name.trim().length === 0) e.name = 'Name the class.';
  if (!/^\d\d:\d\d$/.test(input.time)) e.time = 'Pick a start time.';
  if (!input.startDate) e.date = 'Pick the first date.';
  if (!input.capacity || input.capacity < 1) e.capacity = 'Add a capacity.';
  if (input.mode === 'weekly') {
    if (!input.endDate) e.repeat = 'Pick a date to repeat until.';
    else if (input.startDate && input.endDate <= input.startDate) e.repeat = 'The end date must be after the first date.';
    else if (!input.weekdays || input.weekdays.length === 0) e.repeat = 'Pick at least one day of the week.';
  }
  return e;
}

export function classScheduleValid(input: Parameters<typeof validateClassSchedule>[0]): boolean {
  return Object.keys(validateClassSchedule(input)).length === 0;
}

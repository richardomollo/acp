// ACP Intelligence™ Day 3 — Today's Workout resolution. Pure, framework-free
// date/scheduling logic (mirrors lib/ai-assessment.ts's convention) so week
// and day resolution is unit-testable without a device clock or Supabase.
//
// Deliberately avoids Date#toISOString() for local-day arithmetic — that
// method serialises in UTC, which silently shifts the calendar day near
// midnight in any timezone ahead of UTC (a real bug already present
// elsewhere in this codebase's nextDateForWeekday). Every date here is
// constructed from y/m/d components only, so "today" always means the
// member's local calendar day.
export const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type WeekdayName = typeof WEEKDAY_NAMES[number];

/** Parses a `date` column value ('YYYY-MM-DD') as a LOCAL midnight Date — never via `new Date(string)`, which parses date-only strings as UTC. */
export function parseLocalDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatLocalDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysLocal(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** Whole calendar days from `from` to `to`, ignoring time-of-day (so DST transitions never off-by-one this). */
export function daysBetweenLocal(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function localDayName(date: Date): WeekdayName {
  return WEEKDAY_NAMES[date.getDay()];
}

/** 1-indexed programme week containing `today`, given the programme's start date. Weeks are 7-day blocks starting on start_date's own weekday, not necessarily a Monday. */
export function resolveWeekNumber(programStartDate: Date, today: Date): number {
  return Math.floor(daysBetweenLocal(programStartDate, today) / 7) + 1;
}

/** The local calendar date on which programme week N begins. */
export function weekStartDate(programStartDate: Date, weekNumber: number): Date {
  return addDaysLocal(programStartDate, (weekNumber - 1) * 7);
}

/** The actual calendar date of `dayOfWeek` within the 7-day block starting at `weekStart`. */
export function dateForDayInWeek(weekStart: Date, dayOfWeek: WeekdayName): Date {
  const targetIdx = WEEKDAY_NAMES.indexOf(dayOfWeek);
  const offset = (targetIdx - weekStart.getDay() + 7) % 7;
  return addDaysLocal(weekStart, offset);
}

export interface WeekWorkoutRow {
  id: string;
  day_of_week: WeekdayName;
  title: string;
}

export type WorkoutHistoryStatus = 'in_progress' | 'completed';

export type TodaysWorkoutStatus = 'scheduled' | 'in_progress' | 'completed' | 'rest_day' | 'missed';

export interface TodaysWorkoutResolution {
  status: TodaysWorkoutStatus;
  workout?: WeekWorkoutRow;
  nextWorkout?: { workout: WeekWorkoutRow; date: Date };
}

/**
 * Resolves what "Today's Workout" should show, given this programme week's
 * workouts and the caller's up-to-date completion status per workout id.
 * Pure — all date/history data is passed in, nothing is fetched here.
 */
export function resolveTodaysWorkout(
  weekWorkouts: WeekWorkoutRow[],
  weekStart: Date,
  today: Date,
  historyStatusByWorkoutId: Map<string, WorkoutHistoryStatus>,
): TodaysWorkoutResolution {
  const withDates = weekWorkouts.map(w => ({ w, date: dateForDayInWeek(weekStart, w.day_of_week) }));

  const todayMatch = withDates.find(x => daysBetweenLocal(x.date, today) === 0);
  if (todayMatch) {
    const hist = historyStatusByWorkoutId.get(todayMatch.w.id);
    if (hist === 'completed') return { status: 'completed', workout: todayMatch.w };
    if (hist === 'in_progress') return { status: 'in_progress', workout: todayMatch.w };
    return { status: 'scheduled', workout: todayMatch.w };
  }

  // Rest day, unless an earlier-this-week workout was never even started —
  // that's a distinct "missed" state (section 6): never silently dropped.
  const missed = withDates.find(x => daysBetweenLocal(x.date, today) > 0 && !historyStatusByWorkoutId.has(x.w.id));
  if (missed) return { status: 'missed', workout: missed.w };

  const next = withDates
    .filter(x => daysBetweenLocal(today, x.date) > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  return { status: 'rest_day', nextWorkout: next ? { workout: next.w, date: next.date } : undefined };
}

/** planned = sum of every workout_exercise's prescribed sets; completed = distinct logged sets. Never counts a skipped/empty set as complete. Activity blocks (zero planned sets) are handled by the caller as a binary done/not-done instead. */
export function calculateCompletionPercentage(plannedSets: number, completedSets: number): number {
  if (plannedSets <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completedSets / plannedSets) * 100)));
}

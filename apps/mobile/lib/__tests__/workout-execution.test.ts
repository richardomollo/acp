import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLocalDateOnly, formatLocalDateOnly, addDaysLocal, daysBetweenLocal, localDayName,
  resolveWeekNumber, weekStartDate, dateForDayInWeek, resolveTodaysWorkout, calculateCompletionPercentage,
  type WeekWorkoutRow,
} from '../workout-execution.ts';

describe('date helpers — local calendar day, never UTC', () => {
  test('parseLocalDateOnly builds a local midnight date, not a UTC one', () => {
    const d = parseLocalDateOnly('2026-03-15');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 15);
  });

  test('formatLocalDateOnly round-trips parseLocalDateOnly', () => {
    assert.equal(formatLocalDateOnly(parseLocalDateOnly('2026-01-05')), '2026-01-05');
  });

  test('addDaysLocal crosses a month boundary correctly', () => {
    assert.equal(formatLocalDateOnly(addDaysLocal(parseLocalDateOnly('2026-01-30'), 3)), '2026-02-02');
  });

  test('daysBetweenLocal ignores time-of-day', () => {
    const a = new Date(2026, 0, 1, 23, 45);
    const b = new Date(2026, 0, 2, 0, 15);
    assert.equal(daysBetweenLocal(a, b), 1);
  });

  test('localDayName maps to the correct weekday', () => {
    assert.equal(localDayName(parseLocalDateOnly('2026-08-31')), 'monday'); // known Monday
  });
});

describe('resolveWeekNumber / weekStartDate', () => {
  test('day 0-6 of a programme is week 1', () => {
    const start = parseLocalDateOnly('2026-08-24'); // Monday
    for (let i = 0; i < 7; i++) {
      assert.equal(resolveWeekNumber(start, addDaysLocal(start, i)), 1, `day ${i}`);
    }
  });

  test('day 7 is week 2', () => {
    const start = parseLocalDateOnly('2026-08-24');
    assert.equal(resolveWeekNumber(start, addDaysLocal(start, 7)), 2);
  });

  test('weekStartDate(week 3) is 14 days after the programme start', () => {
    const start = parseLocalDateOnly('2026-08-24');
    assert.equal(formatLocalDateOnly(weekStartDate(start, 3)), formatLocalDateOnly(addDaysLocal(start, 14)));
  });
});

describe('dateForDayInWeek', () => {
  test('finds the correct date even when the week does not start on a Monday', () => {
    const weekStart = parseLocalDateOnly('2026-08-26'); // Wednesday
    const monday = dateForDayInWeek(weekStart, 'monday'); // the Monday that starts the NEXT calendar week within this 7-day block
    assert.equal(formatLocalDateOnly(monday), '2026-08-31');
    const saturday = dateForDayInWeek(weekStart, 'saturday');
    assert.equal(formatLocalDateOnly(saturday), '2026-08-29');
  });
});

function row(id: string, day: WeekWorkoutRow['day_of_week'], title = 'Full Body A'): WeekWorkoutRow {
  return { id, day_of_week: day, title };
}

describe('resolveTodaysWorkout', () => {
  const weekStart = parseLocalDateOnly('2026-08-24'); // Monday
  const rows = [row('mon', 'monday'), row('wed', 'wednesday', 'Full Body B'), row('sat', 'saturday')];

  test('scheduled today, no history yet', () => {
    const today = parseLocalDateOnly('2026-08-24'); // Monday
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map());
    assert.equal(res.status, 'scheduled');
    assert.equal(res.workout?.id, 'mon');
  });

  test('in_progress today', () => {
    const today = parseLocalDateOnly('2026-08-26'); // Wednesday
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map([['wed', 'in_progress']]));
    assert.equal(res.status, 'in_progress');
    assert.equal(res.workout?.id, 'wed');
  });

  test('completed today', () => {
    const today = parseLocalDateOnly('2026-08-29'); // Saturday
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map([['sat', 'completed']]));
    assert.equal(res.status, 'completed');
  });

  test('rest day — no workout scheduled and nothing missed', () => {
    const today = parseLocalDateOnly('2026-08-25'); // Tuesday, Monday already completed
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map([['mon', 'completed']]));
    assert.equal(res.status, 'rest_day');
    assert.equal(res.nextWorkout?.workout.id, 'wed');
  });

  test('missed — an earlier-this-week workout was never started', () => {
    const today = parseLocalDateOnly('2026-08-25'); // Tuesday, Monday never logged
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map());
    assert.equal(res.status, 'missed');
    assert.equal(res.workout?.id, 'mon');
  });

  test('a workout scheduled for today always wins over an earlier missed one', () => {
    const today = parseLocalDateOnly('2026-08-26'); // Wednesday, Monday never logged
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map());
    assert.equal(res.status, 'scheduled');
    assert.equal(res.workout?.id, 'wed');
  });

  test('rest day with no more workouts left this week has no nextWorkout', () => {
    const today = parseLocalDateOnly('2026-08-30'); // Sunday, everything done
    const res = resolveTodaysWorkout(rows, weekStart, today, new Map([['mon', 'completed'], ['wed', 'completed'], ['sat', 'completed']]));
    assert.equal(res.status, 'rest_day');
    assert.equal(res.nextWorkout, undefined);
  });
});

describe('calculateCompletionPercentage', () => {
  test('80% for 12 of 15 planned sets', () => {
    assert.equal(calculateCompletionPercentage(15, 12), 80);
  });
  test('0 planned sets never divides by zero', () => {
    assert.equal(calculateCompletionPercentage(0, 0), 0);
  });
  test('never exceeds 100 even if more sets were logged than planned', () => {
    assert.equal(calculateCompletionPercentage(10, 15), 100);
  });
  test('never negative', () => {
    assert.equal(calculateCompletionPercentage(10, -5), 0);
  });
});

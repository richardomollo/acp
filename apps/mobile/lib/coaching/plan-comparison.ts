// ACP Intelligence™ Day 8.3 — deterministic weekly-plan comparison.
//
// Pure. Compares two AIAssessment plans and returns structured deltas plus
// user-safe plain-language change descriptions. NEVER uses the internal
// adaptation decision label. Day 7.5E flagged that plan `day` values are
// free-form strings, so schedule comparison is done ONLY on values that
// safely normalize to a known weekday — anything else is reported as "day
// unknown" and never turned into a "moved from X to Y" sentence.

import type { StartingPlanActivity } from '../ai-assessment.ts';
import { sumDurationMinutes } from '../ai-assessment.ts';
import type { WeeklyPlanDelta, PlanActivityRef, ScheduleChange } from './types.ts';

// ── Meaningful-change thresholds (section 22) ────────────────────────────────
// Mirrors the tolerance used in the Day 7.5 evaluation analysis: a change in
// weekly training time only counts as "meaningful" once it is both ≥10% of
// the previous total AND ≥15 minutes in absolute terms (below that it is
// model rounding noise, not a coaching change worth narrating).
export const MEANINGFUL_MINUTES_RATIO = 0.1;
export const MEANINGFUL_MINUTES_FLOOR = 15;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const WEEKDAY_LOOKUP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const d of WEEKDAYS) {
    m[d.toLowerCase()] = d;
    m[d.slice(0, 3).toLowerCase()] = d;
  }
  return m;
})();

/** Monday / mon / MONDAY / " Mon. " → "Monday". Unknown / free-form phrase → null. */
export function normalizeWeekday(day: string | null | undefined): string | null {
  if (!day) return null;
  const key = day.trim().toLowerCase().replace(/[^a-z]/g, '');
  return WEEKDAY_LOOKUP[key] ?? WEEKDAY_LOOKUP[key.slice(0, 3)] ?? null;
}

const INTENSITY_RANK: Record<string, number> = { light: 0, moderate: 1, challenging: 2 };

function toRef(a: StartingPlanActivity): PlanActivityRef {
  return {
    day: a.day,
    category: a.category,
    activity: a.activity,
    durationMinutes: Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0,
    intensity: a.intensity,
  };
}

function key(a: StartingPlanActivity): string {
  return `${a.category}|${a.activity.trim().toLowerCase()}`;
}

/**
 * Structured, deterministic diff of two weekly plans. Activities are matched
 * by (category + activity name); repeated activities of the same kind are
 * matched positionally within that group so a "2 → 3 strength sessions"
 * shows one added session, not three.
 */
export function compareWeeklyPlans(
  previous: StartingPlanActivity[],
  current: StartingPlanActivity[],
): WeeklyPlanDelta {
  const previousMinutes = sumDurationMinutes(previous);
  const currentMinutes = sumDurationMinutes(current);
  const minutesDelta = currentMinutes - previousMinutes;

  const groupByKey = (activities: StartingPlanActivity[]): Map<string, StartingPlanActivity[]> => {
    const m = new Map<string, StartingPlanActivity[]>();
    for (const a of activities) {
      const list = m.get(key(a));
      if (list) list.push(a);
      else m.set(key(a), [a]);
    }
    return m;
  };
  const prevByKey = groupByKey(previous);
  const currByKey = groupByKey(current);

  const addedActivities: PlanActivityRef[] = [];
  const removedActivities: PlanActivityRef[] = [];
  const retainedActivities: PlanActivityRef[] = [];
  const scheduleChanges: ScheduleChange[] = [];
  const intensityChanges: WeeklyPlanDelta['intensityChanges'] = [];

  const allKeys = new Set([...prevByKey.keys(), ...currByKey.keys()]);
  for (const k of allKeys) {
    const prevList = prevByKey.get(k) ?? [];
    const currList = currByKey.get(k) ?? [];
    const paired = Math.min(prevList.length, currList.length);

    for (let i = 0; i < paired; i++) {
      const p = prevList[i];
      const c = currList[i];
      retainedActivities.push(toRef(c));

      const fromDay = normalizeWeekday(p.day);
      const toDay = normalizeWeekday(c.day);
      if (fromDay && toDay && fromDay !== toDay) {
        scheduleChanges.push({ category: c.category, activity: c.activity, fromDay, toDay });
      }
      if (p.intensity !== c.intensity && INTENSITY_RANK[p.intensity] != null && INTENSITY_RANK[c.intensity] != null) {
        intensityChanges.push({ category: c.category, activity: c.activity, day: toDay, from: p.intensity, to: c.intensity });
      }
    }
    for (let i = paired; i < currList.length; i++) addedActivities.push(toRef(currList[i]));
    for (let i = paired; i < prevList.length; i++) removedActivities.push(toRef(prevList[i]));
  }

  const minutesMeaningful =
    Math.abs(minutesDelta) >= MEANINGFUL_MINUTES_FLOOR &&
    previousMinutes > 0 &&
    Math.abs(minutesDelta) / previousMinutes >= MEANINGFUL_MINUTES_RATIO;

  const materiallyUnchanged =
    !minutesMeaningful &&
    current.length === previous.length &&
    addedActivities.length === 0 &&
    removedActivities.length === 0 &&
    scheduleChanges.length === 0 &&
    intensityChanges.length === 0;

  return {
    previousMinutes,
    currentMinutes,
    minutesDelta,
    previousSessionCount: previous.length,
    currentSessionCount: current.length,
    sessionCountDelta: current.length - previous.length,
    addedActivities,
    removedActivities,
    retainedActivities,
    scheduleChanges,
    intensityChanges,
    materiallyUnchanged,
  };
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5;
const lower = (s: string) => s.trim().toLowerCase();

/**
 * User-safe plain-language lines describing the meaningful changes only.
 * Returns the "not much changed" line (section 23) when nothing crossed a
 * threshold. Never mentions the internal decision label.
 */
export function describePlanChanges(delta: WeeklyPlanDelta): string[] {
  if (delta.materiallyUnchanged) {
    return ['Not much — your current plan is working well enough to continue.'];
  }

  const lines: string[] = [];

  const minutesMeaningful =
    Math.abs(delta.minutesDelta) >= MEANINGFUL_MINUTES_FLOOR &&
    delta.previousMinutes > 0 &&
    Math.abs(delta.minutesDelta) / delta.previousMinutes >= MEANINGFUL_MINUTES_RATIO;
  if (minutesMeaningful) {
    const dir = delta.minutesDelta < 0 ? 'lower' : 'higher';
    lines.push(`Your weekly training time is about ${roundTo5(Math.abs(delta.minutesDelta))} minutes ${dir}.`);
  }

  if (delta.sessionCountDelta !== 0) {
    const n = Math.abs(delta.sessionCountDelta);
    const dir = delta.sessionCountDelta < 0 ? 'fewer' : 'more';
    lines.push(`You have ${n} ${dir} session${n === 1 ? '' : 's'} this week.`);
  } else if (
    delta.addedActivities.length ||
    delta.removedActivities.length ||
    delta.scheduleChanges.length ||
    delta.intensityChanges.length
  ) {
    lines.push(`You still have ${delta.currentSessionCount} session${delta.currentSessionCount === 1 ? '' : 's'} this week.`);
  }

  for (const a of delta.removedActivities.slice(0, 2)) {
    lines.push(`Your ${lower(a.activity)} session is not in this week's plan.`);
  }
  for (const a of delta.addedActivities.slice(0, 2)) {
    lines.push(`A ${lower(a.activity)} session was added this week.`);
  }
  for (const s of delta.scheduleChanges.slice(0, 2)) {
    lines.push(`Your ${s.fromDay} ${lower(s.activity)} session moved to ${s.toDay}.`);
  }

  // Demanding-session count change, derived structurally (not from a label).
  const challengingDelta =
    delta.addedActivities.filter(a => a.intensity === 'challenging').length -
    delta.removedActivities.filter(a => a.intensity === 'challenging').length +
    delta.intensityChanges.filter(c => c.to === 'challenging').length -
    delta.intensityChanges.filter(c => c.from === 'challenging').length;
  if (challengingDelta !== 0 && lines.length < 4) {
    const n = Math.abs(challengingDelta);
    const dir = challengingDelta < 0 ? 'fewer' : 'more';
    lines.push(`You have ${n} ${dir} demanding session${n === 1 ? '' : 's'} this week.`);
  }

  return lines.length > 0
    ? lines.slice(0, 4)
    : ['Your plan is broadly the same as last week, with small adjustments.'];
}

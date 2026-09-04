// Home screen integration for ACP Intelligence™ — a presentation layer over
// data already produced by Days 1-4 (assessment, canonical plan,
// plan_activity_completions). This module makes NO network calls and NEVER
// generates new coaching prose: it picks from a small, fixed set of
// deterministic templates based on real, already-computed signals. No LLM,
// no new AI call — see apps/mobile/app/(tabs)/index.tsx for how the inputs
// are gathered (a separate, non-blocking effect; the existing Home load
// path is untouched).
import type { AIAssessment, ActivityCategory, StartingPlanActivity } from './ai-assessment';
import { WEEKDAY_INDEX, localISODate } from './fulfilment.ts';

export interface HomeIntelligenceInsight {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaTarget: string;
}

const CATEGORY_WORD: Record<ActivityCategory, string> = {
  strength: 'strength',
  cardio: 'cardio',
  recovery: 'recovery',
  mobility: 'mobility',
  sport: 'sport',
};

export interface HomeIntelligenceParams {
  /** Null when there's no valid, usable assessment at all (Priority 5). */
  assessment: AIAssessment | null;
  /** The plan activity whose `day` matches today's weekday name, if any. */
  todayActivity: StartingPlanActivity | null;
  todayCompleted: boolean;
  weeklyProgress: { completed: number; total: number };
  /**
   * Day 6 — an optional, always positively-framed longitudinal insight
   * (see lib/coaching-memory.ts's pickHomeInsight), consulted ONLY on a
   * day with no plan-specific activity to show. Reuses this same card slot
   * rather than adding a new one (Part 26) — never overrides today's
   * pending/completed activity, which stays higher priority.
   */
  longitudinalInsight?: { headline: string; body: string } | null;
}

/**
 * Priority order (see Day "Home Integration" spec):
 * 1. Today's activity exists and is incomplete
 * 2. Today's activity is already completed
 * 3. No activity today, but the user has completed something this week
 * 4. No activity today, and nothing completed yet this week (still factual, never guilt-oriented)
 * 5. No valid assessment at all — caller is expected to only invoke this
 *    when `assessment` might be null to get the "build your plan" fallback;
 *    when `assessment` truly cannot be evaluated (e.g. no goal at all yet)
 *    the Home screen's existing goal banner already covers that case, so
 *    this function is not even called — see index.tsx's gating.
 */
export function getHomeIntelligenceInsight(params: HomeIntelligenceParams): HomeIntelligenceInsight {
  const { assessment, todayActivity, todayCompleted, weeklyProgress, longitudinalInsight } = params;

  if (!assessment) {
    return {
      headline: 'Build your personal plan',
      body: 'Lana can turn your goal into a first-week plan you can act on.',
      ctaLabel: 'Build your personal plan →',
      ctaTarget: '/my-plan',
    };
  }

  if (todayActivity && !todayCompleted) {
    const categoryWord = CATEGORY_WORD[todayActivity.category];
    return {
      headline: `Today's focus is ${categoryWord}.`,
      body: `Complete your ${todayActivity.duration_minutes}-minute ${todayActivity.activity.toLowerCase()} session and keep the rest of the day simple.`,
      ctaLabel: "View today's plan →",
      ctaTarget: '/my-plan',
    };
  }

  if (todayActivity && todayCompleted) {
    const categoryWord = CATEGORY_WORD[todayActivity.category];
    return {
      headline: `Today's ${categoryWord} session is done.`,
      body: `You've completed ${weeklyProgress.completed} of ${weeklyProgress.total} activities this week. Keep the momentum going.`,
      ctaLabel: 'View my progress →',
      ctaTarget: '/weekly-plan',
    };
  }

  // No activity planned for today at all — the one slot a Day 6
  // longitudinal insight can occupy, replacing the generic filler text
  // below when there's genuinely something to say.
  if (longitudinalInsight) {
    return {
      headline: longitudinalInsight.headline,
      body: longitudinalInsight.body,
      ctaLabel: 'View progress →',
      ctaTarget: '/my-plan',
    };
  }

  if (weeklyProgress.completed > 0) {
    return {
      headline: 'Today is a lighter day.',
      body: `You've completed ${weeklyProgress.completed} of ${weeklyProgress.total} activities this week. Recovery is part of the plan.`,
      ctaLabel: 'View my plan →',
      ctaTarget: '/my-plan',
    };
  }

  const remaining = Math.max(weeklyProgress.total - weeklyProgress.completed, 0);
  return {
    headline: 'Today is a lighter day.',
    body: remaining > 0
      ? `You still have ${remaining} activit${remaining === 1 ? 'y' : 'ies'} planned this week. Focus on the next one rather than trying to catch up all at once.`
      : 'Recovery is part of the plan.',
    ctaLabel: 'View my plan →',
    ctaTarget: '/my-plan',
  };
}

/**
 * Finds the canonical plan activity, if any, scheduled for `today`. Matches
 * the way every other plan surface does (weekly-plan, my-plan, fulfilment):
 * prefer Day 5's historically-stable `planned_date`, then fall back to a
 * lenient weekday-name match. The stored `day` is a free LLM string with no
 * enforced casing (`{ type: 'string', maxLength: 12 }` in the web routes), so
 * a strict `a.day === "Wednesday"` silently missed `"wednesday"` / `" Wed "`
 * — which suppressed Home's "Today's Plan" card and its ACP Intelligence
 * insight while weekly-plan still showed the session.
 */
export function findTodayActivity(activities: StartingPlanActivity[], today: Date = new Date()): StartingPlanActivity | null {
  const iso = localISODate(today);
  const byDate = activities.find(a => a.planned_date === iso);
  if (byDate) return byDate;
  const todayIdx = today.getDay();
  return activities.find(a => WEEKDAY_INDEX[a.day.trim().toLowerCase()] === todayIdx) ?? null;
}

// ── Beta Feedback #012 — "what's next?" after today is done ─────────────────
// Once today's actionable activity is resolved, Home advances (presentation
// only — NEVER plan regeneration) to the chronologically next unresolved
// planned activity, so the user can book / prepare without waiting for the
// calendar to change. All local-date, no UTC boundaries (spec §16).

const MS_DAY = 86_400_000;

/**
 * The local calendar date (YYYY-MM-DD) a plan activity falls on — the same
 * rule every plan surface uses: Day 5's stored `planned_date` wins, else the
 * next occurrence of the activity's weekday on/after `anchor`. Local, not UTC.
 */
export function resolveActivityDate(a: StartingPlanActivity, anchor: Date = new Date()): string | null {
  if (a.planned_date) return a.planned_date;
  const targetIdx = WEEKDAY_INDEX[a.day.trim().toLowerCase()];
  if (targetIdx === undefined) return null;
  const offset = (targetIdx - anchor.getDay() + 7) % 7;
  return localISODate(new Date(anchor.getTime() + offset * MS_DAY));
}

/** "Today" / "Tomorrow" / weekday name ("Wednesday") for a date, relative to now (spec §20). */
export function dateLabelFor(iso: string, now: Date = new Date()): string {
  const todayIso = localISODate(now);
  const tomorrowIso = localISODate(new Date(now.getTime() + MS_DAY));
  if (iso === todayIso) return 'Today';
  if (iso === tomorrowIso) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

export interface ResolvedActivityRef {
  activity: StartingPlanActivity;
  activityIndex: number;
  dateIso: string;
}

export type NextActivitySelection =
  | { kind: 'today'; ref: ResolvedActivityRef }
  | { kind: 'upcoming'; ref: ResolvedActivityRef; dateLabel: string; restTomorrow: boolean }
  | { kind: 'none' };

export interface SelectNextActivityParams {
  activities: StartingPlanActivity[];
  /** activity indexes with a plan_activity_completions row (completed / partial) */
  completedIndexes: ReadonlySet<number>;
  /** activity indexes explicitly skipped (plan_activity_execution.execution_status === 'skipped') */
  skippedIndexes?: ReadonlySet<number>;
  now?: Date;
}

/**
 * Picks the ONE activity Home should feature:
 *  1. any still-unresolved actionable activity dated TODAY (same-day queue
 *     always beats tomorrow — spec §4/§6);
 *  2. otherwise the chronologically next unresolved activity on a future
 *     date (not hard-coded to "tomorrow" — spec §6);
 *  3. otherwise 'none' (caller falls back to Sunday / scheduled-next-week /
 *     the existing empty state).
 * "Resolved" = completed OR (explicitly) skipped. A partial activity always
 * also has a completion row, so it's covered by `completedIndexes` (§5).
 */
export function selectNextActivity({
  activities, completedIndexes, skippedIndexes = new Set(), now = new Date(),
}: SelectNextActivityParams): NextActivitySelection {
  const todayIso = localISODate(now);
  const tomorrowIso = localISODate(new Date(now.getTime() + MS_DAY));
  const isResolved = (i: number) => completedIndexes.has(i) || skippedIndexes.has(i);

  const dated: ResolvedActivityRef[] = activities
    .map((activity, activityIndex) => ({ activity, activityIndex, dateIso: resolveActivityDate(activity, now) }))
    .filter((x): x is ResolvedActivityRef => x.dateIso !== null);

  const unresolvedToday = dated
    .filter(x => x.dateIso === todayIso && !isResolved(x.activityIndex))
    .sort((a, b) => a.activityIndex - b.activityIndex);
  if (unresolvedToday.length > 0) return { kind: 'today', ref: unresolvedToday[0] };

  const future = dated
    .filter(x => x.dateIso > todayIso && !isResolved(x.activityIndex))
    .sort((a, b) => (a.dateIso === b.dateIso ? a.activityIndex - b.activityIndex : a.dateIso < b.dateIso ? -1 : 1));
  if (future.length === 0) return { kind: 'none' };

  const next = future[0];
  const tomorrowHasUnresolved = dated.some(x => x.dateIso === tomorrowIso && !isResolved(x.activityIndex));
  return {
    kind: 'upcoming',
    ref: next,
    dateLabel: dateLabelFor(next.dateIso, now),
    restTomorrow: next.dateIso > tomorrowIso && !tomorrowHasUnresolved,
  };
}

// Home screen integration for ACP Intelligence™ — a presentation layer over
// data already produced by Days 1-4 (assessment, canonical plan,
// plan_activity_completions). This module makes NO network calls and NEVER
// generates new coaching prose: it picks from a small, fixed set of
// deterministic templates based on real, already-computed signals. No LLM,
// no new AI call — see apps/mobile/app/(tabs)/index.tsx for how the inputs
// are gathered (a separate, non-blocking effect; the existing Home load
// path is untouched).
import type { AIAssessment, ActivityCategory, StartingPlanActivity } from './ai-assessment';

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
      body: 'ACP Intelligence™ can turn your goal into a first-week plan you can act on.',
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

/** Finds the canonical plan activity, if any, whose `day` matches today's weekday name. */
export function findTodayActivity(activities: StartingPlanActivity[], today: Date = new Date()): StartingPlanActivity | null {
  const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  return activities.find(a => a.day === todayName) ?? null;
}

// ACP Intelligence™ Day 8.1 — Weekly Coaching Brief.
//
// Pure, deterministic. Produces ONE ranked focus for the week for the Home
// screen: what the user should pay attention to, grounded in observable
// evidence. No network, no LLM, no internal decision label. Ranking follows
// section 40:
//   1 executability / adherence issue
//   2 meaningful plan change
//   3 strong positive outcome evidence
//   4 strong/moderate coaching-memory pattern
//   5 high adherence / consistency
//   6 neutral goal reminder

import type { AIAssessment, StartingPlanActivity } from '../ai-assessment.ts';
import type { CoachingMemoryRow, OverallProgress } from '../coaching-memory.ts';
import { pickHomeInsight, pickOutcomeInsight, pickExecutionNoticed } from '../coaching-memory.ts';
import { compareWeeklyPlans, describePlanChanges } from './plan-comparison.ts';
import type { WeeklyCoachingBrief, CoachingEvidence } from './types.ts';

const PRIMARY_ACTION = { label: 'View my plan', route: '/my-plan' } as const;

export interface WeeklyCoachingBriefInput {
  assessment: AIAssessment;
  /** Previous plan's activities, when a prior plan exists. */
  previousActivities?: StartingPlanActivity[] | null;
  /** Last completed week's completion, when known (from coaching_memory or prior completions). */
  lastWeek?: { completed: number; planned: number } | null;
  /** From formatOverallProgress(coaching_memory), when available. */
  overall?: OverallProgress | null;
  coachingMemory?: CoachingMemoryRow[];
  /** True when there is no prior plan and no completion history. */
  isFirstWeek?: boolean;
}

function completionEvidence(lastWeek: { completed: number; planned: number }): CoachingEvidence {
  return {
    text: `You completed ${lastWeek.completed} of ${lastWeek.planned} planned activities last week.`,
    provenance: { source: 'behaviour', detail: 'completion', values: { completed: lastWeek.completed, planned: lastWeek.planned } },
  };
}

export function buildWeeklyCoachingBrief(input: WeeklyCoachingBriefInput): WeeklyCoachingBrief {
  const { assessment, previousActivities, lastWeek, overall, coachingMemory = [], isFirstWeek } = input;

  // — First week / no history —
  if (isFirstWeek || (!lastWeek && !previousActivities && !overall)) {
    return {
      headline: 'Your first plan is ready',
      observation: 'This plan is built around your goal, your experience and the time you have available each week.',
      guidance: 'Focus on completing your first few sessions — consistency matters more than volume right now.',
      evidence: [],
      primaryAction: PRIMARY_ACTION,
      provenance: { source: 'profile', detail: 'first_week' },
    };
  }

  const rate = lastWeek && lastWeek.planned > 0 ? lastWeek.completed / lastWeek.planned : null;
  const trend = overall?.trendDirection ?? 'insufficient_data';

  // — 1. Executability / adherence issue —
  if ((rate != null && rate < 0.5) || trend === 'declining') {
    const firstTarget = lastWeek ? Math.min(2, Math.max(1, lastWeek.planned)) : 2;
    return {
      headline: 'Make this week easier to complete',
      observation: 'Last week was difficult to complete.',
      guidance: `This week, focus on getting your first ${firstTarget} session${firstTarget === 1 ? '' : 's'} done rather than trying to do everything at once.`,
      evidence: lastWeek ? [completionEvidence(lastWeek)] : [],
      primaryAction: PRIMARY_ACTION,
      provenance: { source: 'behaviour', detail: 'low_adherence', values: rate != null ? { rate: Math.round(rate * 100) } : {} },
    };
  }

  // — 2. Meaningful plan change —
  if (previousActivities && previousActivities.length > 0) {
    const delta = compareWeeklyPlans(previousActivities, assessment.starting_plan.activities);
    if (!delta.materiallyUnchanged) {
      const changeLines = describePlanChanges(delta);
      const lighter = delta.minutesDelta < 0 || delta.sessionCountDelta < 0;
      const respaced = delta.scheduleChanges.length > 0 && delta.sessionCountDelta === 0 && Math.abs(delta.minutesDelta) < 30;
      const headline = respaced
        ? 'Adjusted to give you more recovery'
        : lighter
          ? 'A more manageable week'
          : 'A small step forward this week';
      return {
        headline,
        observation: changeLines[0],
        guidance: lighter
          ? 'Aim to complete every session at this size before adding anything back.'
          : 'Give this shape a full week before judging how it feels.',
        evidence: changeLines.slice(1, 3).map(text => ({
          text,
          provenance: { source: 'plan_change' as const, detail: 'plan_delta' },
        })),
        primaryAction: PRIMARY_ACTION,
        provenance: { source: 'plan_change', detail: 'meaningful_change', values: { minutesDelta: delta.minutesDelta, sessionCountDelta: delta.sessionCountDelta } },
      };
    }
  }

  // — 3. Strong positive outcome evidence —
  const outcome = pickOutcomeInsight(coachingMemory);
  if (outcome) {
    return {
      headline: 'Your progress is showing',
      observation: outcome.headline,
      guidance: 'Keep the same routine going this week — your consistency is doing the work.',
      evidence: outcome.body ? [{ text: outcome.body, provenance: { source: 'outcome', detail: 'trend' } }] : [],
      primaryAction: PRIMARY_ACTION,
      provenance: { source: 'outcome', detail: 'positive_trend' },
    };
  }

  // — 4. Strong / moderate coaching-memory pattern (execution pattern first —
  //      section 42) —
  const execPattern = pickExecutionNoticed(coachingMemory);
  if (execPattern) {
    return {
      headline: 'ACP noticed a pattern',
      observation: execPattern.headline,
      guidance: "This week's plan takes that into account — focus on completing each session as planned.",
      evidence: [],
      primaryAction: PRIMARY_ACTION,
      provenance: { source: 'memory', detail: 'execution_pattern' },
    };
  }
  const pattern = pickHomeInsight(coachingMemory);
  if (pattern) {
    return {
      headline: 'ACP noticed a pattern',
      observation: pattern.headline,
      guidance: "This week's plan leans into what has been working for you.",
      evidence: pattern.body ? [{ text: pattern.body, provenance: { source: 'memory', detail: 'pattern' } }] : [],
      primaryAction: PRIMARY_ACTION,
      provenance: { source: 'memory', detail: 'pattern' },
    };
  }

  // — 5. High adherence / consistency —
  if ((rate != null && rate >= 0.8) || trend === 'improving') {
    return {
      headline: 'A strong week',
      observation: lastWeek
        ? `You completed ${lastWeek.completed} of ${lastWeek.planned} planned activities last week.`
        : 'Your consistency has been improving over recent weeks.',
      guidance: 'This week, focus on consistency rather than adding more.',
      evidence: lastWeek ? [completionEvidence(lastWeek)] : [],
      primaryAction: PRIMARY_ACTION,
      provenance: { source: 'behaviour', detail: 'high_adherence', values: rate != null ? { rate: Math.round(rate * 100) } : {} },
    };
  }

  // — 6. Neutral fallback —
  const focus = assessment.weekly_focus?.description?.trim();
  return {
    headline: 'Your focus this week',
    observation: 'Your plan is built around your goal, your experience and the time you have available.',
    guidance: focus && focus.length <= 200 ? focus : 'Aim to complete each session as planned.',
    evidence: lastWeek ? [completionEvidence(lastWeek)] : [],
    primaryAction: PRIMARY_ACTION,
    provenance: { source: 'profile', detail: 'neutral' },
  };
}

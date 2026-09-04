// ACP Intelligence™ Day 8.2 — "Why this plan?" deterministic explanation.
//
// Pure. Produces up to 4 evidence-grounded reasons for why the current plan
// looks the way it does. Every reason maps to real structured evidence
// (goal / stated availability / last-week completion / plan structure /
// coaching memory). No outcome guarantees, no medical inference, no
// internal decision label. Prefers 2-3 strong reasons over many weak ones
// (section 14).

import type { AIAssessment, StartingPlanActivity, ActivityCategory } from '../ai-assessment.ts';
import { deriveCategoryCounts, sumDurationMinutes } from '../ai-assessment.ts';
import type { CoachingMemoryRow } from '../coaching-memory.ts';
import { selectOutcomeInsights, selectTopInsights, selectExecutionInsights } from '../coaching-memory.ts';
import { normalizeWeekday } from './plan-comparison.ts';
import type { PlanExplanationReason } from './types.ts';

const MAX_REASONS = 4;

const GOAL_PHRASE: Record<string, string> = {
  build_muscle: 'build strength',
  lose_weight: 'work toward a lower weight',
  general_fitness: 'improve your general fitness',
  maintain_weight: 'maintain your current weight',
  improve_running: 'improve your running',
  reduce_stress: 'reduce stress through movement',
  body_recomposition: 'change your body composition',
  eat_healthier: 'eat more consistently',
  improve_mobility: 'improve your mobility',
};

const CATEGORY_PHRASE: Record<ActivityCategory, string> = {
  strength: 'strength training',
  cardio: 'cardio',
  recovery: 'recovery work',
  mobility: 'mobility work',
  sport: 'sport sessions',
};

const BARRIER_LABEL: Record<string, string> = {
  time: 'fitting exercise into your schedule',
  consistency: 'staying consistent week to week',
  motivation: 'staying motivated',
  confidence: 'feeling confident in the gym',
  knowledge: 'knowing what to do',
  accountability: 'staying accountable',
  cost: 'keeping costs down',
};

export interface PlanExplanationInput {
  assessment: AIAssessment;
  goal: string | null;
  /** Previous week's completion, when known — powers the "learns from last week" reason. */
  lastWeek?: { completed: number; planned: number } | null;
  /** Previous plan's activities, when known — powers the continuity reason. */
  previousActivities?: StartingPlanActivity[] | null;
  /** Categories the user actually completed last week, when known. */
  completedCategoriesLastWeek?: ActivityCategory[] | null;
  coachingMemory?: CoachingMemoryRow[];
  preferredActivities?: string[] | null;
  /** Beta Feedback #002 — canonical lowercase weekdays the user chose to
   *  train on, when set. Only powers the schedule reason when the plan's
   *  activity days actually sit within them. */
  preferredTrainingDays?: string[] | null;
}

// Contiguous run (Mon..Fri) reads as "Monday to Friday"; otherwise a plain
// list. Input is canonical lowercase, already Monday-first sorted.
function describePreferredDays(days: string[]): string {
  const ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const cap = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
  const idx = days.map(d => ORDER.indexOf(d)).filter(i => i >= 0).sort((a, b) => a - b);
  const contiguous = idx.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous) return `${cap(ORDER[idx[0]])} to ${cap(ORDER[idx[idx.length - 1]])}`;
  const names = idx.map(i => cap(ORDER[i]));
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function dominantCategory(activities: StartingPlanActivity[]): ActivityCategory | null {
  const counts = deriveCategoryCounts(activities);
  return counts.length > 0 ? counts[0].category : null;
}

/** ≥2 challenging sessions, all on distinct, safely-normalized weekdays. */
function demandingSessionsAreSpread(activities: StartingPlanActivity[]): boolean {
  const days = activities
    .filter(a => a.intensity === 'challenging')
    .map(a => normalizeWeekday(a.day));
  if (days.length < 2 || days.some(d => d === null)) return false;
  return new Set(days).size === days.length;
}

export function buildPlanExplanation(input: PlanExplanationInput): PlanExplanationReason[] {
  const { assessment, goal, lastWeek, previousActivities, completedCategoriesLastWeek, coachingMemory = [], preferredActivities, preferredTrainingDays } = input;
  const activities = assessment.starting_plan.activities;
  const candidates: PlanExplanationReason[] = [];

  // — adherence: "learns from last week" (strongest trust signal) —
  if (lastWeek && lastWeek.planned > 0) {
    const rate = lastWeek.completed / lastWeek.planned;
    if (rate >= 0.8) {
      candidates.push({
        type: 'adherence',
        title: 'Learns from last week',
        explanation: `You completed ${lastWeek.completed} of ${lastWeek.planned} activities last week, so Lana has kept your programme stable rather than adding more.`,
        provenance: { source: 'behaviour', detail: 'completion', values: { completed: lastWeek.completed, planned: lastWeek.planned } },
      });
    } else if (rate >= 0.5) {
      candidates.push({
        type: 'adherence',
        title: 'Learns from last week',
        explanation: `You completed ${lastWeek.completed} of ${lastWeek.planned} activities last week, so this week keeps a similar shape while you build consistency.`,
        provenance: { source: 'behaviour', detail: 'completion', values: { completed: lastWeek.completed, planned: lastWeek.planned } },
      });
    } else {
      candidates.push({
        type: 'adherence',
        title: 'Easier to complete',
        explanation: `Last week was difficult to fit in, so this week's sessions stay manageable while keeping your key work in place.`,
        provenance: { source: 'behaviour', detail: 'completion', values: { completed: lastWeek.completed, planned: lastWeek.planned } },
      });
    }
  }

  // — goal —
  if (goal) {
    const cat = dominantCategory(activities);
    const goalPhrase = GOAL_PHRASE[goal];
    if (goalPhrase && cat) {
      candidates.push({
        type: 'goal',
        title: 'Built around your goal',
        explanation: `Your primary goal is to ${goalPhrase}, so ${CATEGORY_PHRASE[cat]} stays the foundation of your week.`,
        provenance: { source: 'profile', detail: 'goal', values: { goal, category: cat } },
      });
    } else if (goalPhrase) {
      candidates.push({
        type: 'goal',
        title: 'Built around your goal',
        explanation: `This plan is shaped by your goal to ${goalPhrase}.`,
        provenance: { source: 'profile', detail: 'goal', values: { goal } },
      });
    }
  }

  // — schedule — at most one schedule reason. When the user set preferred
  //   training days AND the plan's activity days actually sit within them
  //   (Beta Feedback #002 §25), that user-stated structure is the reason;
  //   otherwise fall back to the time-budget fit.
  const availableTime = assessment.starting_point?.available_time?.trim();
  const totalMinutes = sumDurationMinutes(activities);
  const trainingDays = (preferredTrainingDays ?? []).filter(d => typeof d === 'string');
  const planWeekdays = new Set(
    activities.map(a => normalizeWeekday(a.day)).filter((d): d is string => !!d),
  );
  const preferredTitleCase = new Set(
    trainingDays.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()),
  );
  const planFitsPreference =
    trainingDays.length >= 2 &&
    planWeekdays.size > 0 &&
    planWeekdays.size <= trainingDays.length &&
    [...planWeekdays].every(d => preferredTitleCase.has(d));

  if (planFitsPreference) {
    candidates.push({
      type: 'schedule',
      title: 'Built around the days you prefer to train',
      explanation: `You told Lana you prefer training ${describePreferredDays(trainingDays)}, so this week's activities are organised around those days.`,
      provenance: { source: 'profile', detail: 'training_schedule', values: { preferredDays: trainingDays.length, planDays: planWeekdays.size } },
    });
  } else if (availableTime) {
    candidates.push({
      type: 'schedule',
      title: 'Fits your schedule',
      explanation: `You told Lana you have around ${availableTime} available each week, and this plan stays within that with ${activities.length} session${activities.length === 1 ? '' : 's'}.`,
      provenance: { source: 'profile', detail: 'available_time', values: { sessions: activities.length, minutes: totalMinutes } },
    });
  }

  // — recovery (scheduling only, never medical) —
  if (demandingSessionsAreSpread(activities)) {
    candidates.push({
      type: 'recovery',
      title: 'Recovery considered',
      explanation: 'Your harder sessions are spread across different days of the week.',
      provenance: { source: 'plan_change', detail: 'demanding_spacing' },
    });
  }

  // — continuity —
  if (previousActivities && completedCategoriesLastWeek && completedCategoriesLastWeek.length > 0) {
    const currentCats = new Set(activities.map(a => a.category));
    const kept = completedCategoriesLastWeek.find(c => currentCats.has(c));
    if (kept) {
      candidates.push({
        type: 'continuity',
        title: 'Keeps what worked',
        explanation: `You completed your ${CATEGORY_PHRASE[kept]} last week, so it stays in this week's plan.`,
        provenance: { source: 'behaviour', detail: 'category_continuity', values: { category: kept } },
      });
    }
  }

  // — execution (Day 9): only when a repeated execution pattern exists AND
  //   the plan actually reflects it (section 41). Difficulty-fit → "stays
  //   manageable"; time-fit → "shorter blocks". Never medical.
  const execRow = selectExecutionInsights(coachingMemory, 1)[0];
  const execDir = (execRow?.evidence as { direction?: string } | undefined)?.direction ?? '';
  if (execRow && execDir === 'too_hard') {
    candidates.push({
      type: 'execution',
      title: 'Adjusted to how recent weeks have felt',
      explanation: 'Several recent sessions have felt harder than expected, so this week stays manageable while keeping your key work in place.',
      provenance: { source: 'behaviour', detail: 'execution_difficulty' },
    });
  } else if (execRow && execDir === 'time_barrier') {
    candidates.push({
      type: 'execution',
      title: 'Built to fit your recent weeks',
      explanation: 'Time has repeatedly made sessions hard to fit recently, so this week keeps sessions in shorter blocks.',
      provenance: { source: 'behaviour', detail: 'execution_time' },
    });
  }

  // — outcome (positive trend only, framed as observation) —
  const outcomeRow = selectOutcomeInsights(coachingMemory, 1)[0];
  const outcomeDir = (outcomeRow?.evidence as { direction?: string } | undefined)?.direction ?? '';
  if (outcomeRow && (outcomeDir === 'outcome_progressing' || outcomeDir === 'body_composition_progressing')) {
    candidates.push({
      type: 'outcome',
      title: 'Matches your progress',
      explanation: 'Your recent measurements have been moving toward your goal, so the plan keeps its current balance rather than changing course.',
      provenance: { source: 'outcome', detail: 'positive_trend' },
    });
  }

  // — barrier (only when there is evidence it is still relevant) —
  const barriers = assessment.starting_point?.main_barriers ?? [];
  const hasDifficultyMemory = selectTopInsights(coachingMemory, 3).some(r => r.memory_type.endsWith('_difficulty'));
  const lowAdherence = !!lastWeek && lastWeek.planned > 0 && lastWeek.completed / lastWeek.planned < 0.5;
  if ((hasDifficultyMemory || lowAdherence) && barriers.length > 0) {
    const relevant = barriers.find(b => BARRIER_LABEL[b]);
    if (relevant) {
      candidates.push({
        type: 'barrier',
        title: 'Accounts for what gets in the way',
        explanation: `Because ${BARRIER_LABEL[relevant]} has been a challenge, this week's plan is kept simple and achievable.`,
        provenance: { source: 'profile', detail: 'barrier', values: { barrier: relevant } },
      });
    }
  }

  // — preference —
  if (preferredActivities && preferredActivities.length > 0) {
    const named = preferredActivities.slice(0, 2).join(' and ');
    candidates.push({
      type: 'preference',
      title: 'Uses activities you chose',
      explanation: `This plan is built around activities you said you're open to, like ${named}.`,
      provenance: { source: 'profile', detail: 'preferred_activities' },
    });
  }

  // Priority order: concrete "learns from you" first, then goal/schedule
  // context, then supporting reasons. Cap at MAX_REASONS.
  const ORDER: PlanExplanationReason['type'][] = ['adherence', 'execution', 'goal', 'schedule', 'recovery', 'continuity', 'outcome', 'barrier', 'preference'];
  return candidates
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .slice(0, MAX_REASONS);
}

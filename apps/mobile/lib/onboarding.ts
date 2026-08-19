// Deliberately zero React Native / Supabase imports in this file — it's
// pure domain logic (types, copy, and the plan-summary/support-style rules)
// so it can be unit tested without any native-module mocking, and so a
// future recommendation engine can import/replace pieces of it in
// isolation. Supabase-backed helpers live in lib/onboarding-auth.ts.

// ─── Types ──────────────────────────────────────────────────────────────────

export type PrimaryGoal =
  | 'lose_weight'
  | 'build_muscle'      // displayed as "Build strength"
  | 'improve_running'
  | 'improve_health'
  | 'healthy_lifestyle';

export type ActivityLevel = 'inactive' | 'occasional' | 'active_2_3' | 'active_4_plus' | 'serious';

export type StrengthExperience = 'beginner' | 'intermediate' | 'advanced';

export type Barrier =
  | 'time' | 'motivation' | 'confidence' | 'knowledge' | 'cost'
  | 'accountability' | 'nutrition' | 'finding_activities' | 'consistency';

export type PreferredActivity =
  | 'gym' | 'running' | 'walking' | 'football' | 'yoga'
  | 'swimming' | 'cycling' | 'boxing' | 'personal_training';

export interface GoalDetails {
  // running
  current_5k_seconds?: number | null;
  no_current_5k?: boolean;
  target_5k_seconds?: number;
  // strength
  strength_target?: string;
  // health
  health_focus?: string;
  // healthy_lifestyle
  lifestyle_focus?: string;
  // derived, non-user-facing — lets a future recommendation engine bias
  // toward beginner-oriented vs goal-oriented support without ever labeling
  // the user P1/P2 anywhere in the UI or schema.
  support_style?: 'beginner_support' | 'goal_support' | 'balanced_support';
}

export interface OnboardingAnswers {
  goal: PrimaryGoal | null;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  goalTargetDate: string | null; // ISO date (yyyy-mm-dd)
  activityLevel: ActivityLevel | null;
  strengthExperience: StrengthExperience | null;
  goalDetails: GoalDetails;
  barriers: Barrier[];
  preferredActivities: PreferredActivity[];
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  goal: null,
  startingWeightKg: null,
  goalWeightKg: null,
  goalTargetDate: null,
  activityLevel: null,
  strengthExperience: null,
  goalDetails: {},
  barriers: [],
  preferredActivities: [],
};

// ─── Copy / option lists ────────────────────────────────────────────────────

export const GOAL_OPTIONS: { key: PrimaryGoal; label: string; desc: string; icon: string }[] = [
  { key: 'lose_weight',      label: 'Lose weight',                 desc: 'Burn fat & feel lighter',        icon: 'flame-outline' },
  { key: 'build_muscle',     label: 'Build strength',              desc: 'Get stronger, build muscle',     icon: 'barbell-outline' },
  { key: 'improve_running',  label: 'Improve my running',          desc: 'Go further, get faster',         icon: 'walk-outline' },
  { key: 'improve_health',   label: 'Improve my health',           desc: 'Energy, fitness & wellbeing',    icon: 'heart-outline' },
  { key: 'healthy_lifestyle', label: 'Build a healthier lifestyle', desc: 'Small changes, built to last',   icon: 'leaf-outline' },
];

export const ACTIVITY_LEVEL_OPTIONS: { key: ActivityLevel; label: string; desc: string }[] = [
  { key: 'inactive',      label: 'Mostly inactive',      desc: "I'm just getting started" },
  { key: 'occasional',    label: 'Occasionally active',  desc: 'A bit here and there' },
  { key: 'active_2_3',    label: 'Active 2–3× a week',   desc: 'Fairly consistent' },
  { key: 'active_4_plus', label: 'Active 4+× a week',    desc: 'Very consistent' },
  { key: 'serious',       label: 'I train seriously',    desc: 'Structured, high frequency' },
];

export const STRENGTH_EXPERIENCE_OPTIONS: { key: StrengthExperience; label: string; desc: string }[] = [
  { key: 'beginner',     label: 'New to strength training', desc: "Let's build the foundations" },
  { key: 'intermediate', label: 'Some experience',          desc: "I've trained on and off" },
  { key: 'advanced',     label: 'Experienced',              desc: 'I train with structure' },
];

export const HEALTH_FOCUS_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'energy',         label: 'Energy',         icon: 'battery-charging-outline' },
  { key: 'fitness',        label: 'Fitness',        icon: 'pulse-outline' },
  { key: 'mobility',       label: 'Mobility',       icon: 'body-outline' },
  { key: 'sleep_recovery', label: 'Sleep/recovery', icon: 'moon-outline' },
  { key: 'general_health', label: 'General health', icon: 'heart-outline' },
];

export const LIFESTYLE_FOCUS_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'move_more',    label: 'Move more',          icon: 'walk-outline' },
  { key: 'eat_better',   label: 'Eat better',         icon: 'nutrition-outline' },
  { key: 'consistency',  label: 'Build consistency',  icon: 'checkmark-circle-outline' },
  { key: 'fitness',      label: 'Improve fitness',    icon: 'pulse-outline' },
  { key: 'wellbeing',    label: 'Improve wellbeing',  icon: 'sunny-outline' },
];

export const STRENGTH_TARGET_OPTIONS: { key: string; label: string }[] = [
  { key: 'overall_strength',   label: 'Get stronger overall' },
  { key: 'visible_muscle',     label: 'Build visible muscle' },
  { key: 'specific_lifts',     label: 'Increase specific lifts' },
  { key: 'functional_strength', label: 'Improve functional strength' },
];

export const BARRIER_OPTIONS: { key: Barrier; label: string; icon: string }[] = [
  { key: 'time',                label: 'Time',               icon: 'time-outline' },
  { key: 'motivation',          label: 'Motivation',         icon: 'flash-outline' },
  { key: 'confidence',          label: 'Confidence',         icon: 'shield-outline' },
  { key: 'knowledge',           label: 'Knowledge',          icon: 'book-outline' },
  { key: 'cost',                label: 'Cost',                icon: 'cash-outline' },
  { key: 'accountability',      label: 'Accountability',     icon: 'people-outline' },
  { key: 'nutrition',           label: 'Nutrition',          icon: 'nutrition-outline' },
  { key: 'finding_activities',  label: 'Finding activities', icon: 'compass-outline' },
  { key: 'consistency',         label: 'Consistency',        icon: 'repeat-outline' },
];

export const MAX_BARRIERS = 3;

export const ACTIVITY_OPTIONS: { key: PreferredActivity; label: string; icon: string }[] = [
  { key: 'gym',               label: 'Gym',               icon: 'barbell-outline' },
  { key: 'running',           label: 'Running',           icon: 'walk-outline' },
  { key: 'walking',           label: 'Walking',           icon: 'footsteps-outline' },
  { key: 'football',          label: 'Football',          icon: 'football-outline' },
  { key: 'yoga',               label: 'Yoga',              icon: 'body-outline' },
  { key: 'swimming',           label: 'Swimming',          icon: 'water-outline' },
  { key: 'cycling',            label: 'Cycling',           icon: 'bicycle-outline' },
  { key: 'boxing',             label: 'Boxing',            icon: 'hand-left-outline' },
  { key: 'personal_training',  label: 'Personal training', icon: 'person-outline' },
];

// ─── Derived behavioural attribute (never surfaced as "P1"/"P2") ──────────────

const BEGINNER_SIGNALS: Barrier[] = ['confidence', 'knowledge', 'consistency', 'motivation'];
const GOAL_SIGNALS: Barrier[] = ['accountability', 'nutrition', 'time'];

export function deriveSupportStyle(barriers: Barrier[]): GoalDetails['support_style'] {
  const beginnerScore = barriers.filter(b => BEGINNER_SIGNALS.includes(b)).length;
  const goalScore = barriers.filter(b => GOAL_SIGNALS.includes(b)).length;
  if (beginnerScore > goalScore) return 'beginner_support';
  if (goalScore > beginnerScore) return 'goal_support';
  return 'balanced_support';
}

// ─── Plan summary (rules-based MVP — not a personalised/AI recommendation) ────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthYear(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatMinSec(totalSeconds?: number) {
  if (!totalSeconds) return null;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface PlanSummary {
  goalLine: string;
  startingPointLine: string;
  focusLine: string;
  approach: string[];
}

/**
 * Builds a plain, structured MVP plan summary directly from the onboarding
 * answers — no AI, no external recommendation service. Kept as a pure
 * function (rather than inline in the Plan screen) so a future
 * recommendation engine can swap this implementation out without touching
 * the screen that renders it.
 */
export function buildPlanSummary(answers: OnboardingAnswers): PlanSummary {
  const goalOpt = GOAL_OPTIONS.find(g => g.key === answers.goal);

  let goalLine = goalOpt?.label ?? 'Your fitness goal';
  if (answers.goal === 'lose_weight' && answers.startingWeightKg && answers.goalWeightKg) {
    const diff = Math.round((answers.startingWeightKg - answers.goalWeightKg) * 10) / 10;
    goalLine = answers.goalTargetDate
      ? `Lose ${diff} kg by ${monthYear(answers.goalTargetDate)}`
      : `Lose ${diff} kg`;
  } else if (answers.goal === 'improve_running') {
    const target = formatMinSec(answers.goalDetails.target_5k_seconds);
    goalLine = target
      ? `Run a 5K in ${target}${answers.goalTargetDate ? ` by ${monthYear(answers.goalTargetDate)}` : ''}`
      : 'Improve your 5K time';
  } else if (answers.goal === 'build_muscle') {
    const target = STRENGTH_TARGET_OPTIONS.find(o => o.key === answers.goalDetails.strength_target);
    goalLine = target?.label ?? 'Build strength';
  } else if (answers.goal === 'improve_health') {
    const focus = HEALTH_FOCUS_OPTIONS.find(o => o.key === answers.goalDetails.health_focus);
    goalLine = focus ? `Improve your ${focus.label.toLowerCase()}` : 'Improve your health';
  } else if (answers.goal === 'healthy_lifestyle') {
    const focus = LIFESTYLE_FOCUS_OPTIONS.find(o => o.key === answers.goalDetails.lifestyle_focus);
    goalLine = focus?.label ?? 'Build a healthier lifestyle';
  }

  const activityOpt = ACTIVITY_LEVEL_OPTIONS.find(a => a.key === answers.activityLevel);
  const startingPointLine = activityOpt?.label ?? 'Just getting started';

  const focusOpt =
    HEALTH_FOCUS_OPTIONS.find(o => o.key === answers.goalDetails.health_focus) ??
    LIFESTYLE_FOCUS_OPTIONS.find(o => o.key === answers.goalDetails.lifestyle_focus);
  const supportStyle = deriveSupportStyle(answers.barriers);
  const focusLine = focusOpt?.label
    ?? (supportStyle === 'beginner_support' ? 'Build confidence & consistency'
      : supportStyle === 'goal_support' ? 'Structure & accountability'
      : 'Steady, sustainable progress');

  const approach: string[] = [];
  if (answers.goal === 'lose_weight' || answers.goal === 'build_muscle') approach.push('Strength');
  if (answers.goal === 'lose_weight' || answers.goal === 'improve_running') approach.push('Cardio');
  if (answers.goal === 'improve_health' || answers.goal === 'healthy_lifestyle') approach.push('Movement');
  if (answers.barriers.includes('nutrition') || answers.goal === 'lose_weight' || answers.goal === 'healthy_lifestyle') approach.push('Nutrition');
  if (answers.barriers.includes('accountability') || answers.barriers.includes('motivation')) approach.push('Community');
  if (approach.length === 0) approach.push('Movement', 'Consistency');

  return { goalLine, startingPointLine, focusLine, approach: Array.from(new Set(approach)) };
}

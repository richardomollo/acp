// Deliberately zero React Native / Supabase imports in this file — it's
// pure domain logic (types, copy, and the plan-summary/support-style rules)
// so it can be unit tested without any native-module mocking, and so a
// future recommendation engine can import/replace pieces of it in
// isolation. Supabase-backed helpers live in lib/onboarding-auth.ts.

// ─── Types ──────────────────────────────────────────────────────────────────

export type PrimaryGoal =
  | 'build_muscle'         // displayed as "Build strength, build muscle mass"
  | 'lose_weight'          // displayed as "Weight loss, burn fat & get lean"
  | 'maintain_weight'      // displayed as "Maintaining a healthy weight"
  | 'reduce_stress';       // displayed as "Reduce stress, improve my wellbeing"

export type ActivityLevel = 'inactive' | 'occasional' | 'active_2_3' | 'active_4_plus' | 'serious';

export type StrengthExperience = 'beginner' | 'intermediate' | 'advanced';

export type Barrier =
  | 'time' | 'motivation' | 'confidence' | 'knowledge' | 'cost'
  | 'accountability' | 'nutrition' | 'finding_activities' | 'consistency';

export type PreferredActivity =
  | 'gym' | 'running' | 'walking' | 'football' | 'yoga'
  | 'swimming' | 'cycling' | 'boxing' | 'personal_training';

export interface GoalDetails {
  // health / maintain_weight focus areas — multi-select
  health_focus?: string[];
  // build_muscle — optional; many users won't know these yet
  current_muscle_mass_pct?: number;
  current_fat_mass_pct?: number;
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
  { key: 'build_muscle',        label: 'Build strength',           desc: 'Get stronger and build muscle',              icon: 'barbell-outline' },
  { key: 'lose_weight',         label: 'Lose weight',               desc: 'Build sustainable habits for fat loss',      icon: 'flame-outline' },
  { key: 'maintain_weight',     label: 'Maintain a healthy weight', desc: 'Stay active, strong and healthy',            icon: 'heart-outline' },
  // 'reduce_stress' temporarily removed from the picker — the type/enum and
  // downstream handling (goalLine, approach, etc.) stay intact so anyone
  // who already picked it is still served correctly.
];

export const ACTIVITY_LEVEL_OPTIONS: { key: ActivityLevel; label: string; desc: string }[] = [
  { key: 'inactive',      label: 'Mostly inactive',      desc: "I'm just getting started" },
  { key: 'occasional',    label: 'Occasionally active',  desc: 'A bit here and there' },
  { key: 'active_2_3',    label: 'Active 2–3× a week',   desc: 'Fairly consistent' },
  { key: 'active_4_plus', label: 'Active 4+× a week',    desc: 'Very consistent' },
  { key: 'serious',       label: 'I train seriously',    desc: 'Structured, high frequency' },
];

/**
 * Derived, non-user-facing — the starting-point screen replaced the manual
 * activity-level picker with a sleep/work/sport/leisure hours breakdown, so
 * fitness_profile.activity_level (still read elsewhere, e.g. buildPlanSummary)
 * is now inferred from weekly training hours instead of chosen directly.
 */
export function deriveActivityLevel(sportHoursPerWeek: number): ActivityLevel {
  if (sportHoursPerWeek >= 8) return 'serious';
  if (sportHoursPerWeek >= 5) return 'active_4_plus';
  if (sportHoursPerWeek >= 3) return 'active_2_3';
  if (sportHoursPerWeek >= 1) return 'occasional';
  return 'inactive';
}

// ─── Slider descriptive-label copy (starting-point screen) ────────────────

export function describeWorkHours(hoursPerWeek: number): string {
  if (hoursPerWeek <= 0) return 'Not currently working';
  if (hoursPerWeek <= 20) return 'Part-time desk work';
  if (hoursPerWeek <= 40) return 'Full-time desk work';
  return 'Long hours / physically demanding work';
}

export function describeSportHours(hoursPerWeek: number): string {
  const level = deriveActivityLevel(hoursPerWeek);
  return ACTIVITY_LEVEL_OPTIONS.find(o => o.key === level)?.label ?? 'Mostly inactive';
}

export function describeLeisureHours(hoursPerWeek: number): string {
  if (hoursPerWeek <= 10) return 'Packed schedule, very little downtime';
  if (hoursPerWeek <= 30) return 'A modest amount of downtime';
  if (hoursPerWeek <= 60) return 'A healthy amount of downtime';
  return 'Plenty of free time to recover and recharge';
}

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

/** Joins the labels of one or more selected health-focus keys, e.g. "energy and fitness". */
export function joinFocusLabels(keys: string[] | undefined): string | null {
  const labels = (keys ?? [])
    .map(k => HEALTH_FOCUS_OPTIONS.find(o => o.key === k)?.label.toLowerCase())
    .filter((l): l is string => !!l);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

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
  if ((answers.goal === 'lose_weight' || answers.goal === 'build_muscle' || answers.goal === 'maintain_weight') && answers.startingWeightKg && answers.goalWeightKg) {
    const diff = Math.round((answers.goalWeightKg - answers.startingWeightKg) * 10) / 10;
    if (diff > 0) {
      goalLine = answers.goalTargetDate ? `Gain ${diff} kg by ${monthYear(answers.goalTargetDate)}` : `Gain ${diff} kg`;
    } else if (diff < 0) {
      goalLine = answers.goalTargetDate ? `Lose ${Math.abs(diff)} kg by ${monthYear(answers.goalTargetDate)}` : `Lose ${Math.abs(diff)} kg`;
    } else {
      goalLine = answers.goal === 'build_muscle' ? 'Build muscle while maintaining your current weight' : 'Maintain your current weight';
    }
  } else if (answers.goal === 'maintain_weight') {
    const focus = joinFocusLabels(answers.goalDetails.health_focus);
    goalLine = focus ? `Maintain a healthy weight — focus on ${focus}` : 'Maintain a healthy weight';
  } else if (answers.goal === 'reduce_stress') {
    const focus = joinFocusLabels(answers.goalDetails.health_focus);
    goalLine = focus ? `Reduce stress — focus on ${focus}` : 'Reduce stress & improve wellbeing';
  }

  const activityOpt = ACTIVITY_LEVEL_OPTIONS.find(a => a.key === answers.activityLevel);
  const startingPointLine = activityOpt?.label ?? 'Just getting started';

  const focusLabel = joinFocusLabels(answers.goalDetails.health_focus);
  const supportStyle = deriveSupportStyle(answers.barriers);
  const focusLine = focusLabel
    ? focusLabel.replace(/^./, c => c.toUpperCase())
    : (supportStyle === 'beginner_support' ? 'Build confidence & consistency'
      : supportStyle === 'goal_support' ? 'Structure & accountability'
      : 'Steady, sustainable progress');

  const approach: string[] = [];
  if (answers.goal === 'lose_weight' || answers.goal === 'build_muscle') approach.push('Strength', 'Cardio');
  if (answers.goal === 'maintain_weight' || answers.goal === 'reduce_stress') approach.push('Movement');
  if (answers.barriers.includes('nutrition') || answers.goal === 'lose_weight' || answers.goal === 'maintain_weight') approach.push('Nutrition');
  if (answers.barriers.includes('accountability') || answers.barriers.includes('motivation')) approach.push('Community');
  if (approach.length === 0) approach.push('Movement', 'Consistency');

  return { goalLine, startingPointLine, focusLine, approach: Array.from(new Set(approach)) };
}

export interface FallbackWeekItem {
  day: string;
  label: string;
}

// Fixed, deterministic day slots per approach area — no AI, no new
// recommendation logic, just a simple static mapping over the approach
// array buildPlanSummary already computes. This exists so the no-AI
// fallback can still show "at least a basic first-week structure"
// alongside goal/starting-point/recommendation/focus, without building a
// second complex planning engine.
const APPROACH_WEEK_DAYS: Record<string, string[]> = {
  Strength: ['Monday', 'Thursday'],
  Cardio: ['Tuesday', 'Saturday'],
  Movement: ['Wednesday', 'Saturday'],
};

/**
 * A minimal, deterministic first-week structure for the no-AI fallback —
 * intentionally simple (fixed days per approach area), not a substitute for
 * the AI-generated starting_plan.activities.
 */
export function buildFallbackWeekPlan(approach: string[]): FallbackWeekItem[] {
  const items: FallbackWeekItem[] = [];
  for (const area of approach) {
    const days = APPROACH_WEEK_DAYS[area];
    if (!days) continue;
    for (const day of days) items.push({ day, label: `${area} session` });
  }
  return items;
}

// ─── Resume-in-progress-onboarding routing ─────────────────────────────────

export type OnboardingStepRoute =
  | '/onboarding/goal'
  | '/onboarding/success'
  | '/onboarding/starting-point'
  | '/onboarding/barriers'
  | '/onboarding/activities';

/**
 * Mirrors each step screen's own `canContinue` rule for step 2 ("What does
 * success look like for you?") — kept in sync by hand since the local
 * text-input state those screens use for weight fields isn't available here.
 */
export function isStep2Complete(answers: OnboardingAnswers): boolean {
  switch (answers.goal) {
    case 'lose_weight':
    case 'build_muscle':
    case 'maintain_weight':
      return !!answers.startingWeightKg && !!answers.goalWeightKg
        && !!answers.goalTargetDate && !!answers.strengthExperience;
    case 'reduce_stress':
      return (answers.goalDetails.health_focus ?? []).length > 0;
    default:
      return false;
  }
}

/**
 * Figures out which onboarding step an in-progress (not yet completed) user
 * should land back on, so skipping out mid-flow and returning later resumes
 * where they left off instead of restarting at step 1.
 */
export function resolveOnboardingResumeStep(
  answers: OnboardingAnswers,
  hasActivityHours: boolean,
): OnboardingStepRoute {
  if (!answers.goal) return '/onboarding/goal';
  if (!isStep2Complete(answers)) return '/onboarding/success';
  if (!hasActivityHours) return '/onboarding/starting-point';
  if (answers.barriers.length === 0) return '/onboarding/barriers';
  return '/onboarding/activities';
}

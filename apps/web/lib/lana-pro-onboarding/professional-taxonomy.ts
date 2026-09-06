// LANA PRO — professional-branch taxonomy (Phase 2). Pure: options + the
// mapping from onboarding answers onto EXISTING personal_trainers columns.
//
//   professions   → personal_trainers.specialisations   (reused; values match
//                   pt_specialisations rows where one exists, else a clean
//                   readable label — the column is free text + substring-
//                   searched, so new values render/filter fine)
//   clientGoals   → personal_trainers.client_goals      (the ONE Phase-2
//                   additive column — see the migration)
//   serviceModel  → personal_trainers.session_types
//   workingModel  → personal_trainers.training_locations
//
// Profession and client-goal vocabularies are DELIBERATELY separate (spec
// §P: "Profession and client-goal taxonomies must remain distinct"). The
// goal list adapts to the chosen professions via goalsForProfessions().

import {
  SERVICE_MODEL_VALUES,
  WORKING_MODEL_VALUES,
  type ServiceModelValue,
  type WorkingModelValue,
} from './onboarding-machine.ts';

export interface Option<V extends string = string> {
  value: V;
  label: string;
}

// ── §P1 Profession ───────────────────────────────────────────────────────

export interface ProfessionOption extends Option {
  /** value stored in personal_trainers.specialisations; null = store nothing
   *  (e.g. "Other" — the pro refines their profile during activation) */
  specialisation: string | null;
}

export const PROFESSION_OPTIONS: readonly ProfessionOption[] = [
  { value: 'personal_training',      label: 'Personal training',       specialisation: 'Personal Training' },
  { value: 'nutrition',              label: 'Nutrition',               specialisation: 'Nutrition' },
  { value: 'strength_conditioning',  label: 'Strength & conditioning', specialisation: 'Strength Training' },
  { value: 'running_coaching',       label: 'Running coaching',        specialisation: 'Running' },
  { value: 'sports_coaching',        label: 'Sports coaching',         specialisation: 'Sports Performance' },
  { value: 'yoga',                   label: 'Yoga',                    specialisation: 'Yoga' },
  { value: 'pilates',                label: 'Pilates',                 specialisation: 'Pilates' },
  { value: 'massage_recovery',       label: 'Massage & recovery',      specialisation: 'Massage & Recovery' },
  { value: 'wellness_coaching',      label: 'Wellness coaching',       specialisation: 'Wellness Coaching' },
  { value: 'other',                  label: 'Other',                   specialisation: null },
];

export function professionsToSpecialisations(professionValues: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of professionValues) {
    const opt = PROFESSION_OPTIONS.find((o) => o.value === v);
    if (opt?.specialisation && !out.includes(opt.specialisation)) out.push(opt.specialisation);
  }
  return out;
}

export function professionLabel(value: string): string {
  return PROFESSION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// ── §P2 Client goals ("who do you help?") ────────────────────────────────
//
// Stored verbatim (the label) in personal_trainers.client_goals. A CORE set
// applies to every profession; profession-specific extras are unioned in.

export interface GoalOption extends Option {
  /** professions this goal is offered for; 'core' = always offered */
  scope: 'core' | readonly string[];
}

const GOAL_CATALOGUE: readonly GoalOption[] = [
  { value: 'lose_weight',        label: 'Lose weight',           scope: 'core' },
  { value: 'build_strength',     label: 'Build strength',        scope: 'core' },
  { value: 'build_muscle',       label: 'Build muscle',          scope: ['personal_training', 'strength_conditioning', 'nutrition'] },
  { value: 'general_fitness',    label: 'General fitness',       scope: 'core' },
  { value: 'sports_performance', label: 'Sports performance',    scope: ['strength_conditioning', 'sports_coaching', 'running_coaching', 'personal_training'] },
  { value: 'running',            label: 'Running',               scope: ['running_coaching', 'sports_coaching', 'personal_training'] },
  { value: 'mobility',           label: 'Mobility',              scope: ['yoga', 'pilates', 'massage_recovery', 'personal_training', 'strength_conditioning'] },
  { value: 'rehabilitation',     label: 'Rehabilitation',        scope: ['massage_recovery', 'pilates', 'personal_training', 'sports_coaching'] },
  { value: 'pre_postnatal',      label: 'Pre/postnatal',         scope: ['personal_training', 'yoga', 'pilates', 'nutrition', 'wellness_coaching'] },
  { value: 'stress_recovery',    label: 'Stress & recovery',     scope: ['yoga', 'wellness_coaching', 'massage_recovery'] },
  { value: 'healthy_eating',     label: 'Healthy eating habits', scope: ['nutrition', 'wellness_coaching'] },
  { value: 'other',              label: 'Other',                 scope: 'core' },
];

/**
 * §P2 — the goal options offered for the chosen professions. Always returns
 * the core set plus any profession-specific extras, in catalogue order, never
 * empty. With no profession chosen yet, returns core only.
 */
export function goalsForProfessions(professionValues: readonly string[]): GoalOption[] {
  const profs = new Set(professionValues);
  return GOAL_CATALOGUE.filter(
    (g) => g.scope === 'core' || (Array.isArray(g.scope) && g.scope.some((p) => profs.has(p))),
  );
}

export function goalLabel(value: string): string {
  return GOAL_CATALOGUE.find((o) => o.value === value)?.label ?? value;
}

/** what to store in personal_trainers.client_goals — the readable labels */
export function goalsToStorage(goalValues: readonly string[]): string[] {
  return goalValues.map(goalLabel);
}

// ── §P3 Service model → personal_trainers.session_types ───────────────────

export const SERVICE_MODEL_OPTIONS: readonly { value: ServiceModelValue; label: string; sub: string; sessionType: string }[] = [
  { value: 'one_to_one', label: '1-to-1 sessions',      sub: 'Individual client sessions',  sessionType: '1-on-1' },
  { value: 'group',      label: 'Group classes',        sub: 'Scheduled group sessions',    sessionType: 'Group' },
  { value: 'online',     label: 'Online consultations', sub: 'Work with clients remotely',  sessionType: 'Online' },
];

export function serviceModelToSessionTypes(values: readonly string[]): string[] {
  return SERVICE_MODEL_OPTIONS.filter((o) => values.includes(o.value)).map((o) => o.sessionType);
}

// ── §P5 Working model → personal_trainers.training_locations ──────────────

export const WORKING_MODEL_OPTIONS: readonly { value: WorkingModelValue; label: string; trainingLocation: string }[] = [
  { value: 'gym_studio',   label: 'At a gym or studio',   trainingLocation: 'Gym or studio' },
  { value: 'own_location', label: 'At my own location',   trainingLocation: 'My own location' },
  { value: 'travel',       label: 'I travel to clients',  trainingLocation: 'Client location' },
  { value: 'outdoors',     label: 'Outdoors',             trainingLocation: 'Outdoors' },
  { value: 'online',       label: 'Online',               trainingLocation: 'Online' },
];

export function workingModelToTrainingLocations(values: readonly string[]): string[] {
  return WORKING_MODEL_OPTIONS.filter((o) => values.includes(o.value)).map((o) => o.trainingLocation);
}

export function workingModelLabel(value: string): string {
  return WORKING_MODEL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// re-exported for convenience so components import one module
export { SERVICE_MODEL_VALUES, WORKING_MODEL_VALUES };

// ACP Intelligence™ — activity recommendation domain types. Pure, activity-
// agnostic: activityType is lib/fulfilment.ts's existing NormalizedActivityKey
// (gym/running/walking/mobility/...) rather than a new taxonomy, and
// selfGuided reuses the existing ProviderMatch shape from
// lib/professional-support.ts (Day 4's real PT matcher) rather than
// inventing a parallel one.
import type { ProviderMatch } from './professional-support.ts';
import type { NormalizedActivityKey } from './fulfilment.ts';

export type SelfGuidedMode = 'EXISTING_PROGRAMME_SESSION' | 'GENERATED_PERSONALISED_SESSION' | 'GENERIC_FALLBACK';
export type ProfessionalSupportMode = 'OPTIONAL_SUPPORT' | 'HUMAN_SUPPORT_TRIGGER' | 'CURRENT_TRAINER_REVIEW';

// exercise_workout = a workouts row with workout_exercises (strength/mobility,
// MuscleWiki-backed). activity_block = a workouts row with is_activity_block
// = true and only a free-text description (running/walking) — no exercises.
export type SessionType = 'exercise_workout' | 'activity_block';

export interface SelfGuidedRecommendation {
  mode: SelfGuidedMode;
  sessionId?: string;   // a real workouts.id — never a route/path, never set for GENERIC_FALLBACK
  sessionType: SessionType;
  title: string;
  reason: string;
  // Only meaningful (and only ever set) for sessionType 'exercise_workout' —
  // the actual count of persisted workout_exercises rows behind sessionId,
  // so the UI/caller can distinguish a real, fully-populated session from
  // one where exercise persistence partially failed. Omitted for
  // activity_block sessions (no exercises apply) and GENERIC_FALLBACK.
  exerciseCount?: number;
}

export interface ProfessionalSupportRecommendation {
  mode: ProfessionalSupportMode;
  headline: string;
  reason: string;
  trainers?: ProviderMatch[];
}

export interface ActivityRecommendation {
  activityType: NormalizedActivityKey;
  title: string;
  reason: string;
  durationMinutes?: number;
  selfGuided: SelfGuidedRecommendation;
  professionalSupport?: ProfessionalSupportRecommendation;
}

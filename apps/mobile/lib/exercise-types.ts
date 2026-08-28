// ACP Intelligence™ — Day 1: provider-independent exercise architecture.
//
// ACPExercise is ACP's own canonical exercise shape — deliberately close to
// the previous ExerciseDBExercise (services/exercisedb.ts) plus a `provider`
// field, since every consumer (Fitness Hub screens, the workout generator,
// ACP Intelligence) already speaks that vocabulary. Whatever provider is
// behind ExerciseProvider (MuscleWiki today, anything else later) maps its
// own raw response into this shape internally — nothing outside a provider
// file may ever see a provider-specific field name.
export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface ACPExerciseMedia {
  type: 'image' | 'video' | 'gif';
  url: string;
  angle?: string;
}

export interface ACPExercise {
  id: string;                 // provider's external id — unique within that provider only
  provider: string;           // 'musclewiki' | 'exercisedb' | 'acp'
  name: string;
  bodyPart: string;           // ACP's existing body-part bucket, e.g. 'chest', 'upper legs'
  target: string;             // primary target muscle, e.g. 'pectorals'
  secondaryMuscles: string[];
  equipment: string;
  difficulty: ExerciseDifficulty;
  category: string | null;    // exercise type, e.g. 'strength', 'cardio', 'stretching'
  description: string | null;
  instructions: string[];
  media: ACPExerciseMedia[];
}

export interface ExerciseSearchFilters {
  query?: string;
  bodyPart?: string;
  muscle?: string;
  equipment?: string;
  difficulty?: ExerciseDifficulty;
  category?: string;
  limit?: number;
  offset?: number;
}

export type ExerciseProviderErrorCode =
  | 'timeout' | 'unauthorized' | 'forbidden' | 'not_found'
  | 'rate_limited' | 'server_error' | 'malformed_response' | 'network_error';

export class ExerciseProviderError extends Error {
  code: ExerciseProviderErrorCode;
  constructor(code: ExerciseProviderErrorCode, message: string) {
    super(message);
    this.name = 'ExerciseProviderError';
    this.code = code;
  }
}

// The contract every exercise content source implements. Fitness Hub, the
// workout generator, and ACP Intelligence depend only on ExerciseService
// (services/exercise-service.ts), never on a provider directly.
export interface ExerciseProvider {
  readonly id: string;
  getExercises(bodyPart: string, limit: number, offset: number): Promise<ACPExercise[]>;
  searchExercises(filters: ExerciseSearchFilters): Promise<ACPExercise[]>;
  getExercise(externalId: string): Promise<ACPExercise | null>;
}

// A friendly, non-technical message for each failure mode — shown in the
// Fitness Hub instead of a raw error or a crash (section 13).
export function friendlyProviderErrorMessage(e: unknown): string {
  if (e instanceof ExerciseProviderError) {
    switch (e.code) {
      case 'timeout':
      case 'network_error':
        return "We couldn't load exercises right now. Please check your connection and try again.";
      case 'rate_limited':
        return "Exercises are taking longer than usual to load. Please try again in a moment.";
      case 'not_found':
        return "We couldn't find that exercise.";
      default:
        return "We couldn't load exercises right now. Please try again.";
    }
  }
  return "We couldn't load exercises right now. Please try again.";
}

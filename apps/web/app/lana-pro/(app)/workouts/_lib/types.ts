// LANA PRO — Workout Library shared client types.

export type LocationType = "home" | "gym" | "both";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type TemplateSource = "manual" | "lana_generated";

export interface TemplateExerciseDraft {
  /** local key for React list identity (not persisted) */
  key: string;
  /** public.exercises.id — resolved before the row is added to the draft */
  exerciseId: string;
  name: string;
  target: string;
  equipment: string;
  gifUrl: string | null;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  restSeconds: number;
  loadGuidance: string | null;
  notes: string | null;
}

export interface TemplateDraft {
  id: string | null; // null until first save
  title: string;
  description: string;
  category: string;
  locationType: LocationType;
  difficulty: Difficulty;
  estimatedDurationMinutes: number | null;
  source: TemplateSource;
  exercises: TemplateExerciseDraft[];
}

export interface TemplateListItem {
  id: string;
  title: string;
  category: string;
  difficulty: Difficulty;
  location_type: LocationType;
  estimated_duration_minutes: number | null;
  source: TemplateSource;
  exercise_count: number;
  updated_at: string;
}

export const CATEGORIES = [
  "strength",
  "hypertrophy",
  "full_body",
  "push",
  "pull",
  "legs",
  "conditioning",
  "mobility",
  "cardio",
] as const;

export function emptyDraft(): TemplateDraft {
  return {
    id: null,
    title: "",
    description: "",
    category: "strength",
    locationType: "both",
    difficulty: "intermediate",
    estimatedDurationMinutes: null,
    source: "manual",
    exercises: [],
  };
}

let _k = 0;
export const nextKey = () => `e${Date.now()}_${_k++}`;

/** exercises we might add: either an ExerciseDB search hit or an already-local row */
export interface PickableExercise {
  /** ExerciseDB id (string) OR a public.exercises uuid */
  id: string;
  name: string;
  target: string;
  equipment: string;
  bodyPart: string;
  gifUrl: string | null;
  instructions: string[];
  /** present => it's an ExerciseDB result that must be normalised into public.exercises */
  externalId?: string;
  difficulty?: string;
}

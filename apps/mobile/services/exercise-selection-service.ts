// ACP Intelligence™ Day 2 — turns one ACP-decided ExerciseRequirement into an
// actual exercise. This is the ONLY place programme generation talks to
// exerciseService — it never asks the provider to decide the programme
// (Day 2 section 9): the requirement (movement pattern, body part, role)
// always comes from lib/programme-generator.ts.
import { exerciseService } from './exercise-service.ts';
import type { ACPExercise, ExerciseDifficulty } from '../lib/exercise-types.ts';
import { REPS_BY_ROLE, type ExerciseRequirement } from '../lib/programme-types.ts';

export interface SelectedExercise {
  exercise: ACPExercise;
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

// Real MuscleWiki equipment values are single words with no internal spaces
// ("Bodyweight", "Dumbbell", "Band", "Kettlebell") — matched here without
// whitespace so both that vocabulary and ACP's own fallback exercises'
// "body weight" (two words, historical ExerciseDB-era convention) match
// identically, instead of silently failing to recognise real provider data.
const HOME_EQUIPMENT = new Set(['bodyweight', 'dumbbell', 'band', 'kettlebell']);

function normalizeEquipment(equipment: string): string {
  return (equipment ?? '').toLowerCase().replace(/\s+/g, '');
}

function matchesLocation(equipmentLocation: 'home' | 'gym', equipment: string): boolean {
  return equipmentLocation === 'gym' || HOME_EQUIPMENT.has(normalizeEquipment(equipment));
}

// Safe, always-executable bodyweight fallback per movement pattern — used
// only when the provider has no suitable candidate at any relaxation tier,
// so generation can never crash or produce an empty/missing exercise
// (Day 2 section 11).
const FALLBACK_BY_PATTERN: Record<string, { name: string; bodyPart: string; target: string }> = {
  squat: { name: 'Bodyweight Squat', bodyPart: 'upper legs', target: 'quads' },
  hinge: { name: 'Glute Bridge', bodyPart: 'upper legs', target: 'glutes' },
  horizontal_push: { name: 'Push Up', bodyPart: 'chest', target: 'pectorals' },
  horizontal_pull: { name: 'Superman Row', bodyPart: 'back', target: 'upper back' },
  vertical_push: { name: 'Pike Push Up', bodyPart: 'shoulders', target: 'delts' },
  core: { name: 'Plank', bodyPart: 'waist', target: 'abs' },
};

export function buildFallbackExercise(requirement: ExerciseRequirement): ACPExercise {
  const f = FALLBACK_BY_PATTERN[requirement.pattern] ?? FALLBACK_BY_PATTERN.core;
  return {
    id: `fallback-${requirement.pattern}`,
    provider: 'acp',
    name: f.name,
    bodyPart: f.bodyPart,
    target: f.target,
    secondaryMuscles: [],
    equipment: 'bodyweight',
    difficulty: 'beginner',
    category: 'strength',
    description: null,
    instructions: [],
    media: [],
  };
}

// Verified live against the real MuscleWiki API: its search is fuzzy
// full-text, not an exact muscle-group filter — a specific anatomical term
// ("quads") returns a meaningfully more relevant pool than ACP's own
// compound bodyPart bucket label ("upper legs", which pulls in unrelated
// core/back exercises). Prefer the requirement's own muscleHint as the
// query whenever present; the caller's client-side muscle filter below is
// still what does the real narrowing, this just improves the starting pool.
async function fetchCandidates(query: string, difficulty?: ExerciseDifficulty, equipment?: string): Promise<ACPExercise[]> {
  try {
    return await exerciseService.search({ query, difficulty, equipment });
  } catch {
    return [];
  }
}

/**
 * Relaxation ladder: muscle hint -> difficulty -> equipment -> duplicate
 * avoidance -> hardcoded safe fallback. Never throws, never returns nothing
 * (Day 2 section 11).
 */
export async function selectExerciseForRequirement(
  requirement: ExerciseRequirement,
  equipmentLocation: 'home' | 'gym',
  difficulty: ExerciseDifficulty,
  alreadySelected: Set<string>,
): Promise<SelectedExercise> {
  const rx = REPS_BY_ROLE[requirement.role];
  const primaryQuery = requirement.muscleHint ?? requirement.bodyPart;
  const pool = await fetchCandidates(primaryQuery, difficulty);

  const byLocation = pool.filter(ex => matchesLocation(equipmentLocation, ex.equipment));
  const byMuscle = requirement.muscleHint
    ? byLocation.filter(ex => ex.target.toLowerCase().includes(requirement.muscleHint!))
    : byLocation;

  // Tier 1: muscle hint + location + difficulty + not already used
  let candidate = byMuscle.find(ex => !alreadySelected.has(ex.id));
  // Tier 2: drop muscle hint
  if (!candidate) candidate = byLocation.find(ex => !alreadySelected.has(ex.id));
  // Tier 3: drop difficulty filter entirely (re-fetch without it) — still the bodyPart/muscle query, just unfiltered by difficulty
  if (!candidate) {
    const anyDifficulty = (await fetchCandidates(primaryQuery)).filter(ex => matchesLocation(equipmentLocation, ex.equipment));
    candidate = anyDifficulty.find(ex => !alreadySelected.has(ex.id));
  }
  // Tier 4: drop equipment/location filter too
  if (!candidate) {
    const anyEquipment = await fetchCandidates(primaryQuery);
    candidate = anyEquipment.find(ex => !alreadySelected.has(ex.id));
  }
  // Tier 5: allow reusing an already-selected exercise rather than an empty slot
  if (!candidate) candidate = pool[0] ?? byLocation[0];

  if (candidate) {
    return { exercise: candidate, ...rx, fallbackUsed: false };
  }

  // Tier 6: provider had nothing at all (e.g. unconfigured/unreachable) — a
  // safe bodyweight exercise for this movement pattern, always available.
  return {
    exercise: buildFallbackExercise(requirement),
    ...rx,
    fallbackUsed: true,
    fallbackReason: `No exercise provider result for ${requirement.bodyPart} (${requirement.pattern}) — used built-in fallback.`,
  };
}

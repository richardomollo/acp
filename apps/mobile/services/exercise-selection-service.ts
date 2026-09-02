// ACP Intelligence™ Day 2 — turns one ACP-decided ExerciseRequirement into an
// actual exercise. This is the ONLY place programme generation talks to
// exerciseService — it never asks the provider to decide the programme
// (Day 2 section 9): the requirement (movement pattern, body part, role)
// always comes from lib/programme-generator.ts.
import { exerciseService } from './exercise-service.ts';
import type { ACPExercise, ExerciseDifficulty } from '../lib/exercise-types.ts';
import { REPS_BY_ROLE, type ExerciseRequirement } from '../lib/programme-types.ts';
import { compoundPrescription } from '../lib/programme-generator.ts';
import { rankExerciseCandidates, isMobilityRequirement } from '../lib/exercise-fit-validator.ts';

export interface SelectedExercise {
  exercise: ACPExercise;
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

/** Best-fit, not-yet-used candidate from a pool, or undefined if none of the pool passes semantic-fit validation (section 12) — never just "the first result". */
function bestFit(requirement: ExerciseRequirement, pool: ACPExercise[], alreadySelected: Set<string>, difficulty?: ExerciseDifficulty): ACPExercise | undefined {
  const eligible = pool.filter(ex => !alreadySelected.has(ex.id));
  return rankExerciseCandidates(requirement, eligible, difficulty)[0]?.exercise;
}

// Real MuscleWiki equipment values are single words with no internal spaces
// ("Bodyweight", "Dumbbell", "Band", "Kettlebell") — matched here without
// whitespace so both that vocabulary and ACP's own fallback exercises'
// "body weight" (two words, historical ExerciseDB-era convention) match
// identically, instead of silently failing to recognise real provider data.
// Chunk 4.5C live audit finding: MuscleWiki is NOT internally consistent on
// singular/plural ("band"/"bodyweight" singular, but "dumbbells"/
// "kettlebells" plural, observed live) — every dumbbell/kettlebell candidate
// was silently excluded from every 'home' generation (strength AND
// mobility) because the plural form never matched this Set; listing both
// forms explicitly (rather than guessing at generic pluralization rules,
// which breaks on "stretches"/"pilates") closes this without new edge
// cases. Also added 'stretches', 'recovery', 'pilates', and 'yoga' — real
// MuscleWiki equipment categories that require no actual equipment (mat/
// towel at most) and were previously treated as gym-only, which pushed
// 'home' mobility selection toward worse candidates purely because the
// best-fit stretch content got filtered out.
const HOME_EQUIPMENT = new Set([
  'bodyweight', 'dumbbell', 'dumbbells', 'band', 'kettlebell', 'kettlebells',
  'stretches', 'recovery', 'pilates', 'yoga',
]);

function normalizeEquipment(equipment: string): string {
  return (equipment ?? '').toLowerCase().replace(/\s+/g, '');
}

function matchesLocation(equipmentLocation: 'home' | 'gym', equipment: string): boolean {
  return equipmentLocation === 'gym' || HOME_EQUIPMENT.has(normalizeEquipment(equipment));
}

// Safe, always-executable bodyweight fallback per movement pattern — used
// only when the provider has no suitable candidate at any relaxation tier,
// so generation can never crash or produce an empty/missing exercise
// (Day 2 section 11). Chunk 4.5C section 12/13 fix: the three mobility
// patterns were previously MISSING here entirely, so they silently fell
// through to FALLBACK_BY_PATTERN.core ('Plank', category 'strength') —
// exactly the "unrelated exercise accepted just to fill the slot" section 12
// warns against, for the one case (provider totally fails) where a bad
// fallback is guaranteed to be shown, not just possible.
const FALLBACK_BY_PATTERN: Record<string, { name: string; bodyPart: string; target: string }> = {
  squat: { name: 'Bodyweight Squat', bodyPart: 'upper legs', target: 'quads' },
  hinge: { name: 'Glute Bridge', bodyPart: 'upper legs', target: 'glutes' },
  horizontal_push: { name: 'Push Up', bodyPart: 'chest', target: 'pectorals' },
  horizontal_pull: { name: 'Superman Row', bodyPart: 'back', target: 'upper back' },
  vertical_push: { name: 'Pike Push Up', bodyPart: 'shoulders', target: 'delts' },
  core: { name: 'Plank', bodyPart: 'waist', target: 'abs' },
  hip_mobility: { name: 'Hip Circles', bodyPart: 'upper legs', target: 'hips' },
  shoulder_mobility: { name: 'Arm Circles', bodyPart: 'shoulders', target: 'shoulders' },
  thoracic_mobility: { name: 'Cat-Cow Stretch', bodyPart: 'back', target: 'spine' },
};

export function buildFallbackExercise(requirement: ExerciseRequirement): ACPExercise {
  const mobility = isMobilityRequirement(requirement);
  const f = FALLBACK_BY_PATTERN[requirement.pattern] ?? (mobility ? FALLBACK_BY_PATTERN.thoracic_mobility : FALLBACK_BY_PATTERN.core);
  return {
    id: `fallback-${requirement.pattern}`,
    provider: 'acp',
    name: f.name,
    bodyPart: f.bodyPart,
    target: f.target,
    secondaryMuscles: [],
    equipment: 'bodyweight',
    difficulty: 'beginner',
    category: mobility ? 'mobility' : 'strength',
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
 * Relaxation ladder: location -> difficulty -> equipment -> duplicate
 * avoidance -> hardcoded safe fallback. At every tier, candidates are
 * ranked by deterministic semantic fit (lib/exercise-fit-validator.ts) —
 * never just "the first provider result" — and a tier only counts as a hit
 * if a candidate actually clears the fit-reject threshold. Never throws,
 * never returns nothing (Day 2 section 11); never forces an obviously bad
 * match just to avoid the fallback (section 16).
 */
export async function selectExerciseForRequirement(
  requirement: ExerciseRequirement,
  equipmentLocation: 'home' | 'gym',
  difficulty: ExerciseDifficulty,
  alreadySelected: Set<string>,
): Promise<SelectedExercise> {
  // Beta #015B — a compound row's sets/reps/rest scale with experience so an
  // advanced primary session's stored prescription matches its estimated
  // (longer) duration. Accessory / core / mobility unchanged.
  const rx = requirement.role === 'compound'
    ? { ...REPS_BY_ROLE.compound, ...compoundPrescription(difficulty) } // keep the coaching note, scale sets/reps/rest
    : REPS_BY_ROLE[requirement.role];
  const primaryQuery = requirement.muscleHint ?? requirement.bodyPart;
  const pool = await fetchCandidates(primaryQuery, difficulty);
  const byLocation = pool.filter(ex => matchesLocation(equipmentLocation, ex.equipment));

  // Tier 1: location + difficulty, ranked by fit
  let candidate = bestFit(requirement, byLocation, alreadySelected, difficulty);

  // Tier 2: drop the difficulty filter (re-fetch without it), still ranked by fit
  if (!candidate) {
    const anyDifficulty = (await fetchCandidates(primaryQuery)).filter(ex => matchesLocation(equipmentLocation, ex.equipment));
    candidate = bestFit(requirement, anyDifficulty, alreadySelected);
  }
  // Tier 3: drop equipment/location filter too, still ranked by fit
  if (!candidate) {
    const anyEquipment = await fetchCandidates(primaryQuery);
    candidate = bestFit(requirement, anyEquipment, alreadySelected);
  }
  // Tier 4: allow reusing an already-selected exercise rather than an empty slot — still fit-ranked, never a raw first-result fallback
  if (!candidate) candidate = rankExerciseCandidates(requirement, pool)[0]?.exercise ?? rankExerciseCandidates(requirement, byLocation)[0]?.exercise;

  if (candidate) {
    return { exercise: candidate, ...rx, fallbackUsed: false };
  }

  // Tier 5: nothing in the provider's pool passed semantic-fit validation
  // (or the provider had no results at all, e.g. unconfigured/unreachable)
  // — a safe bodyweight exercise for this movement pattern, always available.
  return {
    exercise: buildFallbackExercise(requirement),
    ...rx,
    fallbackUsed: true,
    fallbackReason: pool.length > 0
      ? `No candidate for ${requirement.bodyPart} (${requirement.pattern}) passed semantic-fit validation — used built-in fallback.`
      : `No exercise provider result for ${requirement.bodyPart} (${requirement.pattern}) — used built-in fallback.`,
  };
}

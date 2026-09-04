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
  /**
   * Beta #016 — set when the ONLY exercise available for this requirement is
   * one already selected earlier in the same session (every real provider
   * candidate exhausted AND the pattern's built-in fallback is already in
   * use). The caller MUST NOT persist a duplicate workout_exercises row; it
   * redistributes this requirement's volume onto the existing same-pattern
   * exercise instead (§3/§5/§7). `exercise` still carries the collided pick
   * so the shape stays sound for callers/tests that read it.
   */
  duplicate?: boolean;
}

/**
 * Beta #016 — the identity two exercises are compared on for intra-session
 * uniqueness. Provider + stable external id when we have one; otherwise
 * provider + normalized name, so "Bodyweight Squat" / "bodyweight squat" /
 * "Bodyweight  Squat" are one exercise and a null/unstable provider id can't
 * defeat the dedupe (§6). Genuinely different named variants stay distinct.
 */
export function exerciseIdentity(ex: ACPExercise): string {
  const ext = ex.id && String(ex.id).length > 0 ? String(ex.id) : '';
  const norm = (ex.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${ex.provider}:${ext || norm}`;
}

/** Every key that should mark `ex` as "already used" — its raw id, its
 *  provider+id identity, and its provider-agnostic normalized name — so a
 *  later requirement can't reselect it by any of them (§4/§6). The caller
 *  adds these to its running `alreadySelected` set after each pick. */
export function selectionKeys(ex: ACPExercise): string[] {
  const norm = (ex.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return [String(ex.id), exerciseIdentity(ex), `name:${norm}`];
}

function isAlreadySelected(ex: ACPExercise, alreadySelected: Set<string>): boolean {
  return selectionKeys(ex).some(k => alreadySelected.has(k));
}

/** Best-fit, not-yet-used candidate from a pool, or undefined if none of the pool passes semantic-fit validation (section 12) — never just "the first result". */
function bestFit(requirement: ExerciseRequirement, pool: ACPExercise[], alreadySelected: Set<string>, difficulty?: ExerciseDifficulty): ACPExercise | undefined {
  const eligible = pool.filter(ex => !isAlreadySelected(ex, alreadySelected));
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

// Beta #017 — a curated fallback POOL per movement pattern × equipment
// context. One hardcoded bodyweight movement per pattern is not a credible
// degraded prescription for an advanced gym session, and it forces
// within-session collisions the moment #015B repeats a pattern. Every entry
// below is a real exercise ACP already ships in its seeded catalogue
// (supabase/migrations/20260723000006_gif_urls.sql) — real name, real
// MIT-licensed jsDelivr GIF (a static CDN, NOT the rate-limited MuscleWiki
// API). No fabricated instructions, provider ids or equipment metadata; an
// entry with no `gif` simply carries no media, exactly like the pre-#017
// fallback. `gym` lists lead with the heaviest/most-primary variant so an
// advanced gym user degrades to "Barbell Squat", never "Bodyweight Squat".
const GIF = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main';
interface CuratedFallback { name: string; target: string; equipment: string; gif?: string }
const CURATED_FALLBACK_POOL: Partial<Record<string, { gym: CuratedFallback[]; bodyweight: CuratedFallback[] }>> = {
  squat: {
    gym: [
      { name: 'Barbell Squat', target: 'quads', equipment: 'barbell', gif: `${GIF}/quads/barbell-wide-squat.gif` },
      { name: 'Leg Press', target: 'quads', equipment: 'machine', gif: `${GIF}/quads/lever-alternate-leg-press.gif` },
      { name: 'Walking Lunge', target: 'quads', equipment: 'dumbbell', gif: `${GIF}/quads/split-squats.gif` },
    ],
    bodyweight: [
      { name: 'Bodyweight Squat', target: 'quads', equipment: 'bodyweight', gif: `${GIF}/quads/squat-on-bosu-ball.gif` },
      { name: 'Split Squat', target: 'quads', equipment: 'bodyweight', gif: `${GIF}/quads/split-squats.gif` },
    ],
  },
  hinge: {
    gym: [
      { name: 'Romanian Deadlift', target: 'hamstrings', equipment: 'barbell', gif: `${GIF}/glutes/barbell-romanian-deadlift.gif` },
      { name: 'Barbell Deadlift', target: 'glutes', equipment: 'barbell', gif: `${GIF}/glutes/barbell-deadlift.gif` },
      { name: 'Hip Thrust', target: 'glutes', equipment: 'barbell', gif: `${GIF}/glutes/barbell-glute-bridge-two-legs-on-bench-male.gif` },
      { name: 'Lying Leg Curl', target: 'hamstrings', equipment: 'machine', gif: `${GIF}/hamstrings/lever-lying-leg-curl.gif` },
    ],
    bodyweight: [
      { name: 'Glute Bridge', target: 'glutes', equipment: 'bodyweight', gif: `${GIF}/glutes/barbell-glute-bridge.gif` },
      { name: 'Single-Leg Glute Bridge', target: 'glutes', equipment: 'bodyweight' },
    ],
  },
  horizontal_push: {
    gym: [
      { name: 'Barbell Bench Press', target: 'pectorals', equipment: 'barbell', gif: `${GIF}/pectorals/barbell-bench-press.gif` },
      { name: 'Incline Dumbbell Press', target: 'pectorals', equipment: 'dumbbell', gif: `${GIF}/pectorals/barbell-incline-bench-press.gif` },
      { name: 'Cable Chest Fly', target: 'pectorals', equipment: 'cable', gif: `${GIF}/pectorals/cable-standing-fly.gif` },
    ],
    bodyweight: [
      { name: 'Push Up', target: 'pectorals', equipment: 'bodyweight', gif: `${GIF}/pectorals/chest-tap-push-up-male.gif` },
      { name: 'Decline Push Up', target: 'pectorals', equipment: 'bodyweight' },
    ],
  },
  horizontal_pull: {
    gym: [
      { name: 'Barbell Row', target: 'upper back', equipment: 'barbell', gif: `${GIF}/upper-back/barbell-bent-over-row.gif` },
      { name: 'Seated Cable Row', target: 'upper back', equipment: 'cable', gif: `${GIF}/upper-back/cable-seated-row.gif` },
      { name: 'Lat Pulldown', target: 'lats', equipment: 'cable', gif: `${GIF}/lats/cable-pulldown.gif` },
      { name: 'Face Pull', target: 'rear delts', equipment: 'cable', gif: `${GIF}/upper-back/cable-rope-seated-row.gif` },
    ],
    bodyweight: [
      { name: 'Pull-Up', target: 'lats', equipment: 'bodyweight', gif: `${GIF}/lats/chin-up.gif` },
      { name: 'Inverted Row', target: 'upper back', equipment: 'bodyweight' },
      { name: 'Superman Row', target: 'upper back', equipment: 'bodyweight' },
    ],
  },
  vertical_push: {
    gym: [
      { name: 'Overhead Press', target: 'delts', equipment: 'barbell', gif: `${GIF}/delts/barbell-seated-overhead-press.gif` },
      { name: 'Dumbbell Shoulder Press', target: 'delts', equipment: 'dumbbell', gif: `${GIF}/delts/dumbbell-bench-seated-press.gif` },
      { name: 'Lateral Raise', target: 'delts', equipment: 'dumbbell', gif: `${GIF}/delts/cable-lateral-raise.gif` },
    ],
    bodyweight: [
      { name: 'Pike Push Up', target: 'delts', equipment: 'bodyweight' },
      { name: 'Wall Handstand Hold', target: 'delts', equipment: 'bodyweight' },
    ],
  },
  core: {
    gym: [
      { name: 'Plank', target: 'abs', equipment: 'bodyweight', gif: `${GIF}/abs/weighted-front-plank.gif` },
      { name: 'Dead Bug', target: 'abs', equipment: 'bodyweight', gif: `${GIF}/abs/dead-bug.gif` },
      { name: 'Russian Twist', target: 'obliques', equipment: 'bodyweight', gif: `${GIF}/abs/russian-twist.gif` },
      { name: 'Bicycle Crunch', target: 'abs', equipment: 'bodyweight', gif: `${GIF}/abs/air-bike.gif` },
    ],
    bodyweight: [
      { name: 'Plank', target: 'abs', equipment: 'bodyweight', gif: `${GIF}/abs/weighted-front-plank.gif` },
      { name: 'Dead Bug', target: 'abs', equipment: 'bodyweight', gif: `${GIF}/abs/dead-bug.gif` },
      { name: 'Bicycle Crunch', target: 'abs', equipment: 'bodyweight', gif: `${GIF}/abs/air-bike.gif` },
      { name: 'Hollow Hold', target: 'abs', equipment: 'bodyweight' },
    ],
  },
};

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Safe deterministic fallback for one requirement — Beta #017: draws from the
 * curated pool for its pattern × equipment context, skipping any entry
 * already used this session. An advanced gym user gets "Barbell Squat", a
 * home user gets "Bodyweight Squat". Falls back to the single legacy
 * bodyweight movement only when the pool is exhausted or the pattern isn't
 * curated (mobility). Never fabricates media/instructions/ids.
 */
export function buildFallbackExercise(
  requirement: ExerciseRequirement,
  opts?: { equipmentLocation?: 'home' | 'gym'; alreadySelected?: Set<string> },
): ACPExercise {
  const mobility = isMobilityRequirement(requirement);
  const pool = CURATED_FALLBACK_POOL[requirement.pattern];
  if (pool && !mobility) {
    const gymCtx = opts?.equipmentLocation === 'gym';
    const ordered = gymCtx ? [...pool.gym, ...pool.bodyweight] : pool.bodyweight;
    const used = opts?.alreadySelected ?? new Set<string>();
    const pick = ordered.find(e => !used.has(`name:${e.name.trim().toLowerCase().replace(/\s+/g, ' ')}`)) ?? ordered[0];
    if (pick) {
      return {
        id: `fallback-${requirement.pattern}-${slug(pick.name)}`,
        provider: 'acp',
        name: pick.name,
        bodyPart: FALLBACK_BY_PATTERN[requirement.pattern]?.bodyPart ?? 'full body',
        target: pick.target,
        secondaryMuscles: [],
        equipment: pick.equipment,
        difficulty: pick.equipment === 'bodyweight' ? 'beginner' : 'intermediate',
        category: 'strength',
        description: null,
        instructions: [],
        media: pick.gif ? [{ type: 'image', url: pick.gif }] : [],
      };
    }
  }

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
  // Tier 4: widen to any fit-ranked provider candidate we haven't used yet —
  // Beta #016: still excludes already-selected exercises. A within-session
  // duplicate is never preferable to an empty slot; the caller redistributes
  // the volume instead (§4/§5).
  if (!candidate) {
    const ranked = [
      ...rankExerciseCandidates(requirement, pool, difficulty).map(s => s.exercise),
      ...rankExerciseCandidates(requirement, byLocation, difficulty).map(s => s.exercise),
    ];
    candidate = ranked.find(ex => !isAlreadySelected(ex, alreadySelected));
  }

  if (candidate) {
    return { exercise: candidate, ...rx, fallbackUsed: false };
  }

  // Tier 5: nothing in the provider's pool passed semantic-fit validation
  // (or the provider had no results at all, e.g. rate-limited/unreachable).
  // Beta #017 — the curated fallback pool, context-aware: an advanced gym
  // user gets a real barbell movement, not the one global bodyweight
  // constant, and a repeated pattern still resolves to a DISTINCT curated
  // exercise instead of colliding.
  const fallbackExercise = buildFallbackExercise(requirement, { equipmentLocation, alreadySelected });

  // Beta #016 — if that fallback is ALREADY in this session (an earlier
  // requirement of the same pattern also fell through to it, e.g. #015B grew
  // an advanced lower session to squat×3 while MuscleWiki was unreachable),
  // do NOT emit a second identical row. Signal the caller to fold this
  // requirement's volume into the existing exercise (§3/§5/§7).
  if (isAlreadySelected(fallbackExercise, alreadySelected)) {
    return {
      exercise: fallbackExercise,
      ...rx,
      fallbackUsed: true,
      duplicate: true,
      fallbackReason: `Only candidate for ${requirement.bodyPart} (${requirement.pattern}) is already in this session — folded its volume into the existing exercise instead of adding a duplicate row.`,
    };
  }

  return {
    exercise: fallbackExercise,
    ...rx,
    fallbackUsed: true,
    fallbackReason: pool.length > 0
      ? `No candidate for ${requirement.bodyPart} (${requirement.pattern}) passed semantic-fit validation — used built-in fallback.`
      : `No exercise provider result for ${requirement.bodyPart} (${requirement.pattern}) — used built-in fallback.`,
  };
}

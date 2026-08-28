// ACP Intelligence™ — deterministic exercise semantic-fit validation.
//
// Beta Readiness Step 1 found real semantic-quality problems: MuscleWiki's
// /search is fuzzy full-text (verified live), so a technically-returned
// candidate can still be a poor fit for the movement-pattern requirement
// that triggered the search (a stretch selected for a squat requirement, a
// push-up selected for a core requirement). This module scores/filters
// candidates deterministically — no LLM, no embeddings — before one is
// picked. It never decides *what* to search for (that's still
// lib/programme-generator.ts's ExerciseRequirement); it only judges whether
// a given result actually satisfies that requirement.
import type { ACPExercise, ExerciseDifficulty } from './exercise-types.ts';
import type { ExerciseRequirement, MobilityMovementPattern, StrengthMovementPattern } from './programme-types.ts';

export const MOBILITY_PATTERNS = new Set<string>(['hip_mobility', 'shoulder_mobility', 'thoracic_mobility']);
export function isMobilityRequirement(requirement: ExerciseRequirement): boolean {
  return MOBILITY_PATTERNS.has(requirement.pattern);
}

// A candidate whose name contains one of these is never a valid answer to a
// strength movement-pattern requirement, regardless of how well its muscle
// tag happens to match — these are mobility/warm-up content, not the
// compound/accessory movement the requirement asked for.
const REJECT_NAME_KEYWORDS = ['stretch', 'pose', 'mobility', 'warm up', 'warmup', 'cool down', 'foam roll', 'flow'];

// The inverse list for a MOBILITY requirement: a candidate whose name reads
// as a heavy/explosive/machine-based strength movement is never a valid
// mobility pick, regardless of muscle-tag overlap — mirrors
// REJECT_NAME_KEYWORDS' role but for the opposite session goal (section 7 —
// "do not accidentally select strength exercises purely because of fuzzy
// matching"). Chunk 4.5C section 6/17: "not obviously a strength exercise"
// is not the same claim as "is a good mobility exercise" — a resistance
// movement that merely lacks one of the ORIGINAL keywords here (e.g. a
// cable/machine accessory targeting the right muscle area) would otherwise
// pass purely on muscle-match. These additions express one general
// principle — any named loaded/machine/ballistic strength movement pattern
// is resistance training, not mobility work — not a patch reacting to one
// specific exercise encountered during validation.
const MOBILITY_REJECT_NAME_KEYWORDS = [
  'barbell', 'deadlift', 'bench press', 'back squat', 'front squat', 'overhead press', 'clean', 'snatch',
  'sprint', 'jump', 'max effort', '1rm', 'squat', 'lunge', 'machine', 'cable', 'smith machine',
  'leg press', 'lat pulldown', 'kettlebell swing',
  // Chunk 4.5C live audit finding: canonical bodyweight COMPOUND strength
  // movements (a push/pull/dip pattern, not a stretch) can otherwise slip
  // through on muscle-match + a "mobility_friendly_equipment" bonus purely
  // because they're bodyweight — general principle: these specific named
  // movement families are strength work regardless of load.
  'push up', 'pushup', 'pull up', 'pullup', 'chin up', 'chinup', 'dip',
];

// Positive evidence (section 5/6) — real MuscleWiki fields, never invented
// metadata. Equipment tags real mobility/stretch content overwhelmingly
// uses (bodyweight, or a band for an assisted stretch/dislocate) — loaded
// equipment isn't rejected outright by this alone (a banded shoulder
// dislocate is legitimate mobility work), it just doesn't earn the bonus.
const MOBILITY_FRIENDLY_EQUIPMENT = new Set(['bodyweight', 'band']);

// Name-level positive evidence — real mobility/stretch terminology, used
// only as a ranking bonus (a genuine mobility movement can still lack all
// of these and pass purely on muscle-area + equipment evidence, section 6:
// this must never become a hard requirement layered on top of the existing
// muscle-match gate).
const MOBILITY_POSITIVE_NAME_KEYWORDS = [
  'stretch', 'mobility', 'rotation', 'circle', 'rock', 'opener', 'roll', 'flow',
  'dislocate', 'cat-cow', 'cat cow', 'windmill', 'twist',
];

// The real muscle-name substrings (lowercase) that genuinely satisfy each
// movement pattern — built from MuscleWiki's own observed primary_muscles
// vocabulary (Beta Readiness Step 1), not ACP's compound bodyPart buckets.
const PATTERN_MUSCLE_KEYWORDS: Record<StrengthMovementPattern, string[]> = {
  squat: ['quad', 'glute'],
  hinge: ['hamstring', 'glute'],
  horizontal_push: ['chest', 'pector', 'tricep'],
  vertical_push: ['shoulder', 'delt', 'tricep'],
  horizontal_pull: ['back', 'lat', 'bicep', 'trap', 'row'],
  core: ['ab', 'oblique', 'core', 'trunk'],
};

// Same idea, scoped to the areas a mobility session targets — deliberately
// broader/anatomy-based (not lift-specific) since mobility work spans many
// small muscles/joints a strength pattern would never reference.
// Chunk 4.5C live audit finding: 'chest' was too broad here — any pressing
// movement targeting the chest (a Push Up, a bench press) would pass the
// muscle-match gate for "shoulder mobility" purely on that keyword, despite
// being a strength movement. Shoulder MOBILITY is about the joint/rotator
// cuff/deltoid, not the pectoral muscle group broadly — removed without
// losing any real candidate observed live (every genuine shoulder-mobility
// result already matches on 'shoulder'/'delt' directly).
const MOBILITY_PATTERN_MUSCLE_KEYWORDS: Record<MobilityMovementPattern, string[]> = {
  hip_mobility: ['hip', 'glute', 'adductor', 'abductor', 'hamstring', 'psoas'],
  shoulder_mobility: ['shoulder', 'delt', 'rotator'],
  thoracic_mobility: ['spine', 'upper back', 'lat', 'oblique'],
};

// A candidate scoring at or below this is rejected outright — never
// selected even if it's the only candidate available (section 16: quality
// over a forced zero-fallback count).
export const FIT_REJECT_THRESHOLD = 0;

export interface ExerciseFitScore {
  exercise: ACPExercise;
  score: number;
  rejected: boolean;
  reasons: string[];
}

function textContainsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

/**
 * Deterministic fit score for one candidate against one requirement. Higher
 * is better; a rejected candidate (name is obviously mobility/warm-up
 * content, or its own muscle tags don't relate to the pattern at all) scores
 * at/below FIT_REJECT_THRESHOLD regardless of any other positive signal —
 * a difficulty/mechanic match can never rescue an anatomically wrong pick.
 */
export function scoreExerciseFit(
  requirement: ExerciseRequirement, exercise: ACPExercise, targetDifficulty?: ExerciseDifficulty,
): ExerciseFitScore {
  const reasons: string[] = [];
  const mobility = isMobilityRequirement(requirement);

  const rejectKeywords = mobility ? MOBILITY_REJECT_NAME_KEYWORDS : REJECT_NAME_KEYWORDS;
  if (textContainsAny(exercise.name, rejectKeywords)) {
    return {
      exercise, score: -100, rejected: true,
      reasons: [mobility ? 'name_indicates_heavy_strength_movement' : 'name_indicates_mobility_or_warmup'],
    };
  }

  const keywords = mobility
    ? MOBILITY_PATTERN_MUSCLE_KEYWORDS[requirement.pattern as MobilityMovementPattern] ?? []
    : PATTERN_MUSCLE_KEYWORDS[requirement.pattern as StrengthMovementPattern] ?? [];
  const muscleText = [exercise.target, ...exercise.secondaryMuscles].join(' ');
  const musclesMatch = keywords.length === 0 || textContainsAny(muscleText, keywords);

  let score = 0;
  if (musclesMatch) {
    score += 40;
    reasons.push('muscle_match');
  } else {
    score -= 60;
    reasons.push('muscle_mismatch');
  }

  if (requirement.muscleHint && exercise.target.toLowerCase().includes(requirement.muscleHint.toLowerCase())) {
    score += 15;
    reasons.push('muscle_hint_match');
  }

  if (mobility) {
    // Mobility work doesn't "progress" with the member's strength experience
    // the way a lift's prescribed difficulty does (section 10) — an
    // advanced athlete doesn't need an "advanced"-tagged mobility drill,
    // and rewarding that tag risked nudging selection toward heavier
    // variants for no real benefit. Beginner-friendly mobility content is
    // preferred regardless of targetDifficulty.
    if (exercise.difficulty === 'beginner') {
      score += 10;
      reasons.push('mobility_beginner_friendly');
    }
    // Positive evidence (section 5/6) — real equipment/name signals that
    // this is genuinely mobility/stretch content, not just "not on the
    // strength reject list". Bonuses only: absence never rejects a
    // candidate that already cleared the muscle-area gate above.
    if (MOBILITY_FRIENDLY_EQUIPMENT.has(exercise.equipment.toLowerCase().replace(/\s+/g, ''))) {
      score += 15;
      reasons.push('mobility_friendly_equipment');
    }
    if (textContainsAny(exercise.name, MOBILITY_POSITIVE_NAME_KEYWORDS)) {
      score += 10;
      reasons.push('mobility_positive_name_match');
    }
  } else if (targetDifficulty && exercise.difficulty === targetDifficulty) {
    score += 10;
    reasons.push('difficulty_match');
  }

  if (requirement.role === 'compound' && (exercise.category ?? '').toLowerCase() === 'compound') {
    score += 10;
    reasons.push('mechanic_match');
  }

  return { exercise, score, rejected: score <= FIT_REJECT_THRESHOLD, reasons };
}

/**
 * Scores every candidate and returns only the accepted ones, ranked best
 * first — deterministic ordering (ties broken by original candidate order,
 * since Array#sort is stable). An empty result is a valid, expected outcome
 * when nothing in the pool genuinely fits; the caller falls back to the
 * safe built-in exercise rather than forcing a bad pick.
 */
export function rankExerciseCandidates(
  requirement: ExerciseRequirement, candidates: ACPExercise[], targetDifficulty?: ExerciseDifficulty,
): ExerciseFitScore[] {
  return candidates
    .map(ex => scoreExerciseFit(requirement, ex, targetDifficulty))
    .filter(s => !s.rejected)
    .sort((a, b) => b.score - a.score);
}

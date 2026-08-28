// ACP Intelligence™ — orchestrates "what should ACP recommend for this
// activity right now?" for ANY activity in a member's plan, not just
// strength. Pure orchestration only — it decides nothing itself about
// training strategy, exercise selection, progress, or human support; it
// composes the existing services that already own those decisions
// (lib/programme-generator.ts, services/exercise-selection-service.ts,
// services/human-support-service.ts). This must never grow into a second
// programme generator, PT matcher, or progress engine, and must never grow
// a per-activity-type special case here — activity-specific behaviour lives
// entirely in the small generateExerciseSession/generateActivityBlockSession
// pair below, dispatched by lib/activity-recommendation.ts's
// SUPPORTED_ACTIVITY_KEYS table.
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import { programmeService } from './programme-service';
import { getHumanSupportInsight } from './human-support-service';
import { selectExerciseForRequirement, type SelectedExercise } from './exercise-selection-service';
import {
  buildGenerationContext, isGoalSupported, FULL_BODY_A_REQUIREMENTS, MOBILITY_REQUIREMENTS,
  workoutTypeSpec, buildStrengthRequirements, strengthDurationMinutes, type ProfileLike,
} from '@/lib/programme-generator';
import type { ExerciseRequirement, GenerationContext } from '@/lib/programme-types';
import { resolveWeekNumber, parseLocalDateOnly } from '@/lib/workout-execution';
import { normalizeActivity, type NormalizedActivityKey } from '@/lib/fulfilment';
import type { StartingPlanActivity } from '@/lib/ai-assessment';
import type { ActivityRecommendation, ProfessionalSupportRecommendation, SessionType } from '@/lib/activity-recommendation-types';
import {
  buildProfessionalSupport, isSupportedActivity, matchesExistingSession, findReusableSuggestedSession, toLocalDateKey,
  isValidSuggestedSession, SUGGESTED_WORKOUT_TYPE, SESSION_HEADLINE, SESSION_TITLE, SESSION_REASON, SESSION_DURATION_MINUTES,
  type SupportedActivityKey,
} from '@/lib/activity-recommendation';

async function assertOwnSession(userId: string): Promise<boolean> {
  const session = await authService.getSession();
  return session?.user.id === userId;
}

/** Mirrors programme-service.ts's persistExercise (Day 2) — kept as a small local copy rather than an awkward cross-module import for one five-line upsert. */
async function persistExercise(selected: SelectedExercise): Promise<string | null> {
  const ex = selected.exercise;
  const { data, error } = await supabase
    .from('exercises')
    .upsert(
      {
        name: ex.name, body_part: ex.bodyPart, target_muscle: ex.target,
        equipment: ex.equipment, difficulty: ex.difficulty, instructions: ex.instructions,
        gif_url: ex.media[0]?.url ?? null, external_id: ex.id, source: ex.provider,
      },
      { onConflict: 'source,external_id' },
    )
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

/** Real count of persisted workout_exercises rows for a workout — never inferred/assumed from the requirement list, since a requirement can fail to persist (Day 2 section 11's silent-continue-on-failure). */
async function countWorkoutExercises(workoutId: string): Promise<number> {
  const { count } = await supabase
    .from('workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('workout_id', workoutId);
  return count ?? 0;
}

/**
 * The current week's programme workout that satisfies this activity, if one
 * exists — regardless of ownership source (ACP_GENERATED/TRAINER_CREATED/
 * TRAINER_MODIFIED all route here identically, section 5/22), and
 * regardless of whether `key` is one ACP can itself generate (a
 * trainer-created session for an otherwise-unsupported activity still wins).
 */
async function findExistingSession(
  userId: string, key: NormalizedActivityKey,
): Promise<{ id: string; title: string; isActivityBlock: boolean; durationMinutes: number; exerciseCount?: number } | null> {
  const overview = await programmeService.getActiveProgramme(userId);
  if (!overview) return null;

  const currentWeekNumber = Math.min(
    resolveWeekNumber(parseLocalDateOnly(overview.program.start_date), new Date()),
    overview.program.duration_weeks,
  );
  const currentWeek = overview.weeks.find((w: any) => w.week_number === currentWeekNumber);
  if (!currentWeek) return null;

  const candidates = overview.workouts.filter((w: any) => w.program_week_id === currentWeek.id);
  const match = candidates.find((w: any) =>
    matchesExistingSession({ title: w.title, description: w.description, workout_type: w.workout_type }, key));
  if (!match) return null;

  const isActivityBlock = !!match.is_activity_block;
  const exerciseCount = isActivityBlock ? undefined : await countWorkoutExercises(match.id);
  return { id: match.id, title: match.title, isActivityBlock, durationMinutes: match.duration_minutes, exerciseCount };
}

/**
 * Runs exercise selection/persistence against an EXISTING workout row —
 * shared by fresh generation (a brand-new claimed row) and repair (Chunk
 * 4.5A: an existing same-day row whose exercise generation previously
 * failed/never finished). Always appends starting at the current highest
 * sort_order rather than assuming 0, so a partial prior attempt's rows
 * aren't overwritten or order-collided.
 */
async function populateExerciseWorkout(
  workoutId: string, requirements: ExerciseRequirement[], context: GenerationContext,
): Promise<number> {
  const alreadySelected = new Set<string>();
  let sortOrder = await countWorkoutExercises(workoutId);
  let exerciseCount = 0;
  for (const requirement of requirements) {
    const picked = await selectExerciseForRequirement(requirement, context.equipmentLocation, context.experience, alreadySelected);
    alreadySelected.add(picked.exercise.id);
    const exerciseId = await persistExercise(picked);
    if (!exerciseId) continue;
    const { error: weErr } = await supabase.from('workout_exercises').insert({
      workout_id: workoutId, exercise_id: exerciseId, sort_order: sortOrder++,
      sets: picked.sets, reps: picked.reps, rest_seconds: picked.restSeconds, notes: picked.notes,
    });
    if (!weErr) exerciseCount++;
  }
  return exerciseCount;
}

/**
 * A same-day standalone suggested session for this activity, if one exists
 * AND is actually valid (Chunk 4.5A — a claimed workouts row from a prior,
 * now-finished attempt can still have zero persisted exercises if
 * generation failed partway). For exercise-based activities, an invalid
 * row is given ONE repair attempt (re-running exercise persistence against
 * the SAME row, never a new one — the unique slot is per user/type/day, not
 * per attempt) before being treated as unusable. Activity blocks are always
 * valid the moment the row exists (section 6) and are never repaired.
 */
async function findReusableSuggested(
  userId: string, key: SupportedActivityKey, requirements: ExerciseRequirement[] | null, context: GenerationContext,
): Promise<{ id: string; title: string; durationMinutes: number; exerciseCount?: number } | null> {
  const { data } = await supabase
    .from('workouts')
    .select('id, title, created_at, duration_minutes')
    .eq('user_id', userId)
    .eq('workout_type', SUGGESTED_WORKOUT_TYPE[key])
    .is('program_week_id', null)
    .order('created_at', { ascending: false })
    .limit(5);
  const rows = ((data as any[]) ?? []).map(r => ({ id: r.id, title: r.title, createdAt: r.created_at, durationMinutes: r.duration_minutes }));
  const reused = findReusableSuggestedSession(rows, new Date());
  if (!reused) return null;
  const durationMinutes = (rows.find(r => r.id === reused.id) as any)?.durationMinutes ?? SESSION_DURATION_MINUTES[key];

  const isActivityBlock = requirements === null;
  if (isActivityBlock) return { id: reused.id, title: reused.title, durationMinutes };

  let exerciseCount = await countWorkoutExercises(reused.id);
  if (!isValidSuggestedSession({ isActivityBlock: false, exerciseCount })) {
    exerciseCount = await populateExerciseWorkout(reused.id, requirements, context);
  }
  if (!isValidSuggestedSession({ isActivityBlock: false, exerciseCount })) return null; // repair didn't help — not safely reusable (section 9)
  return { id: reused.id, title: reused.title, durationMinutes, exerciseCount };
}

/**
 * Atomically claims today's standalone-suggested-workout slot for
 * (user, activity type) — race-safe via the workouts_one_suggested_per_
 * type_per_day unique index (fixing a real, live-observed bug: concurrent
 * card mounts/re-renders could each pass the findReusableSuggested SELECT
 * before either INSERT completed, producing duplicate workouts — one real
 * account accumulated 15 duplicates this way). `ignoreDuplicates: true`
 * performs INSERT ... ON CONFLICT DO NOTHING: exactly one concurrent caller
 * gets a row back (`won: true`, proceed to generate exercises/description);
 * every other caller gets none back and must fetch + reuse the winner's row
 * instead of generating anything of its own.
 */
async function claimStandaloneWorkoutSlot(
  userId: string, key: SupportedActivityKey, fields: Record<string, unknown>,
): Promise<{ id: string; title: string; durationMinutes: number; won: boolean } | null> {
  const suggestedLocalDate = toLocalDateKey(new Date());
  const workoutType = SUGGESTED_WORKOUT_TYPE[key];

  const { data: won } = await supabase
    .from('workouts')
    .upsert(
      { ...fields, user_id: userId, workout_type: workoutType, program_week_id: null, suggested_local_date: suggestedLocalDate },
      { onConflict: 'user_id,workout_type,suggested_local_date', ignoreDuplicates: true },
    )
    .select('id, title, duration_minutes')
    .maybeSingle();
  if (won) return { id: won.id, title: won.title, durationMinutes: won.duration_minutes, won: true };

  // Lost the race — the winner's row (and its actual persisted duration,
  // not this caller's own computed value) is authoritative (section 10).
  const { data: existing } = await supabase
    .from('workouts')
    .select('id, title, duration_minutes')
    .eq('user_id', userId).eq('workout_type', workoutType).eq('suggested_local_date', suggestedLocalDate)
    .maybeSingle();
  return existing ? { id: existing.id, title: existing.title, durationMinutes: existing.duration_minutes, won: false } : null;
}

/**
 * STRENGTH and MOBILITY both generate a MuscleWiki-backed exercise session —
 * same shape, different requirement set/title/category (section 8's
 * "smallest useful abstraction", not a duplicated generator).
 *
 * Chunk 4.5A concurrency note (section 5): if this call LOSES the atomic
 * claim, a concurrent call is the sole generator for this exact row right
 * now — this call must never repair or re-generate into it (that would race
 * the active writer and risk duplicate exercises). It only checks the
 * row's current state: if already valid, reuse it; if still empty (the
 * winner hasn't finished, or never will), this call returns null so its
 * caller falls back safely for THIS response only, without touching the
 * database — the winner's row, once it finishes, becomes reusable normally
 * on a later call via findReusableSuggested (which DOES repair a
 * genuinely-finished-but-failed attempt).
 */
async function generateExerciseSession(
  userId: string, requirements: ExerciseRequirement[], context: GenerationContext,
  key: SupportedActivityKey, title: string, category: string, durationMinutes: number,
): Promise<{ id: string; title: string; durationMinutes: number; exerciseCount: number } | null> {
  const claim = await claimStandaloneWorkoutSlot(userId, key, {
    title,
    description: `Recommended for your goal and ${context.experience} experience level.`,
    category,
    location_type: context.equipmentLocation,
    difficulty: context.experience,
    duration_minutes: durationMinutes,
    is_active: true,
    is_activity_block: false,
  });
  if (!claim) return null;

  if (!claim.won) {
    const exerciseCount = await countWorkoutExercises(claim.id);
    if (!isValidSuggestedSession({ isActivityBlock: false, exerciseCount })) return null;
    return { id: claim.id, title: claim.title, durationMinutes: claim.durationMinutes, exerciseCount };
  }

  const exerciseCount = await populateExerciseWorkout(claim.id, requirements, context);
  if (!isValidSuggestedSession({ isActivityBlock: false, exerciseCount })) return null; // never report a broken session as a successful GENERATED_PERSONALISED_SESSION (section 9)
  return { id: claim.id, title: claim.title, durationMinutes: claim.durationMinutes, exerciseCount };
}

/** RUNNING and WALKING reuse the existing activity-block representation (lib/programme-generator.ts's WORKOUT_TYPE_SPECS) — no MuscleWiki, no fabricated pace/HR data, only the same free-text guidance a structured programme would already generate (section 7/17). */
async function generateActivityBlockSession(
  userId: string, key: SupportedActivityKey, generatorSlotKey: string, context: GenerationContext,
): Promise<{ id: string; title: string; durationMinutes: number } | null> {
  const spec = workoutTypeSpec(generatorSlotKey);
  const claim = await claimStandaloneWorkoutSlot(userId, key, {
    title: spec.title,
    description: spec.activityDescription,
    category: 'cardio',
    location_type: context.equipmentLocation,
    difficulty: context.experience,
    duration_minutes: SESSION_DURATION_MINUTES[key],
    is_active: true,
    is_activity_block: true,
  });
  if (!claim) return null;
  return { id: claim.id, title: claim.title, durationMinutes: claim.durationMinutes };
}

async function generateSession(
  userId: string, key: SupportedActivityKey, context: GenerationContext,
): Promise<{ id: string; title: string; durationMinutes: number; sessionType: SessionType; exerciseCount?: number } | null> {
  switch (key) {
    case 'gym': {
      // Chunk 4.5C2: experience-aware requirements/duration — see
      // lib/programme-generator.ts's Strength prescription policy, the same
      // one full programme generation now uses (section 18).
      const requirements = buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, context.experience);
      const durationMinutes = strengthDurationMinutes(context.experience);
      const w = await generateExerciseSession(userId, requirements, context, 'gym', SESSION_HEADLINE.gym, 'strength', durationMinutes);
      return w ? { ...w, sessionType: 'exercise_workout' } : null;
    }
    case 'mobility': {
      // Unchanged (chunk exclusion: do not change mobility) — explicit
      // constant, identical to the value generateExerciseSession used
      // internally before this chunk.
      const w = await generateExerciseSession(userId, MOBILITY_REQUIREMENTS, context, 'mobility', SESSION_HEADLINE.mobility, 'mobility', SESSION_DURATION_MINUTES.mobility);
      return w ? { ...w, sessionType: 'exercise_workout' } : null;
    }
    case 'running': {
      const w = await generateActivityBlockSession(userId, 'running', 'run_easy', context);
      return w ? { ...w, sessionType: 'activity_block' } : null;
    }
    case 'walking': {
      const w = await generateActivityBlockSession(userId, 'walking', 'walk_easy', context);
      return w ? { ...w, sessionType: 'activity_block' } : null;
    }
  }
}

/**
 * The one entry point the UI calls for ANY plan activity (section 4).
 * Existing programme/trainer session always wins (section 5); otherwise a
 * same-day standalone session is reused (section 13) or one concrete
 * session is generated (section 6/7); anything ACP has no structured
 * capability for degrades to GENERIC_FALLBACK (section 28) — the caller
 * falls back to the existing fulfilment.ts self-directed/marketplace
 * rendering for that case, exactly as before this task.
 */
export async function getActivityRecommendation(userId: string, activity: StartingPlanActivity): Promise<ActivityRecommendation> {
  const key = normalizeActivity(activity.activity || activity.title, activity.category);

  const fallback = (professionalSupport?: ProfessionalSupportRecommendation): ActivityRecommendation => ({
    activityType: key,
    title: activity.title,
    reason: 'Browse activities that match your plan.',
    selfGuided: { mode: 'GENERIC_FALLBACK', sessionType: 'activity_block', title: activity.title, reason: 'Browse activities that match your plan.' },
    professionalSupport,
  });

  if (!(await assertOwnSession(userId))) return fallback();

  const [existing, insight] = await Promise.all([
    findExistingSession(userId, key),
    getHumanSupportInsight(userId).catch(() => null),
  ]);
  const professionalSupport = buildProfessionalSupport(insight);

  if (existing) {
    const reason = 'This session is part of your current programme.';
    return {
      activityType: key,
      title: existing.title,
      reason,
      durationMinutes: existing.durationMinutes,
      selfGuided: {
        mode: 'EXISTING_PROGRAMME_SESSION',
        sessionId: existing.id,
        sessionType: existing.isActivityBlock ? 'activity_block' : 'exercise_workout',
        title: existing.title,
        reason,
        exerciseCount: existing.exerciseCount,
      },
      professionalSupport,
    };
  }

  if (!isSupportedActivity(key)) return fallback(professionalSupport);

  const { data: profileRow } = await supabase
    .from('fitness_profile')
    .select('goal, experience_level, activity_level, preferred_activities, goal_target_date')
    .eq('user_id', userId)
    .maybeSingle();
  const profile: ProfileLike = {
    goal: profileRow?.goal ?? null,
    experience_level: profileRow?.experience_level ?? null,
    activity_level: profileRow?.activity_level ?? null,
    preferred_activities: profileRow?.preferred_activities ?? null,
    goal_target_date: profileRow?.goal_target_date ?? null,
  };
  if (!isGoalSupported(profile.goal as any)) return fallback(professionalSupport);

  // Built here (not just before generateSession below) so it's also
  // available to findReusableSuggested's repair path (Chunk 4.5A).
  const context = buildGenerationContext(profile, new Date());
  const requirementsForKey: ExerciseRequirement[] | null =
    key === 'gym' ? buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, context.experience)
    : key === 'mobility' ? MOBILITY_REQUIREMENTS : null;

  const reusable = await findReusableSuggested(userId, key, requirementsForKey, context);
  const sessionType: SessionType = key === 'running' || key === 'walking' ? 'activity_block' : 'exercise_workout';

  if (reusable) {
    return {
      activityType: key,
      title: SESSION_HEADLINE[key],
      reason: SESSION_REASON[key],
      // Chunk 4.5C2 (section 10): the actual persisted value, never the
      // static per-key constant — for gym this now genuinely varies by
      // experience; for mobility/running/walking it's numerically identical
      // to the constant (those generation paths still persist that exact
      // value, untouched), so this is a strict correctness improvement with
      // zero behaviour change for the activity types this chunk excludes.
      durationMinutes: reusable.durationMinutes,
      selfGuided: {
        mode: 'GENERATED_PERSONALISED_SESSION', sessionId: reusable.id, sessionType,
        title: SESSION_TITLE[key], reason: SESSION_REASON[key], exerciseCount: reusable.exerciseCount,
      },
      professionalSupport,
    };
  }

  const generated = await generateSession(userId, key, context);
  if (!generated) return fallback(professionalSupport);

  return {
    activityType: key,
    title: SESSION_HEADLINE[key],
    reason: SESSION_REASON[key],
    durationMinutes: generated.durationMinutes,
    selfGuided: {
      mode: 'GENERATED_PERSONALISED_SESSION', sessionId: generated.id, sessionType: generated.sessionType,
      title: SESSION_TITLE[key], reason: SESSION_REASON[key], exerciseCount: generated.exerciseCount,
    },
    professionalSupport,
  };
}

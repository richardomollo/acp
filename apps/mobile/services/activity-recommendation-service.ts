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
  buildGenerationContext, isGoalSupported, MOBILITY_REQUIREMENTS,
  workoutTypeSpec, estimateSessionMinutes,
  classifyStrengthStructure, fitStrengthSessionForStructure, fullBodyOrdinalInPlan, type ProfileLike,
} from '@/lib/programme-generator';
import type { ExerciseRequirement, GenerationContext } from '@/lib/programme-types';
import { resolveWeekNumber, parseLocalDateOnly } from '@/lib/workout-execution';
import { normalizeActivity, type NormalizedActivityKey } from '@/lib/fulfilment';
import type { StartingPlanActivity } from '@/lib/ai-assessment';
import type { ActivityRecommendation, ProfessionalSupportRecommendation, SessionType } from '@/lib/activity-recommendation-types';
import {
  buildProfessionalSupport, isSupportedActivity, matchesExistingSession, findReusableSuggestedSession, toLocalDateKey,
  isValidSuggestedSession, SUGGESTED_WORKOUT_TYPE, suggestedStrengthWorkoutType, SESSION_HEADLINE, SESSION_TITLE, SESSION_REASON, SESSION_DURATION_MINUTES,
  classifyRunSlot, needsExperienceHeal, type SupportedActivityKey,
} from '@/lib/activity-recommendation';


// Beta Feedback #006 — activity-block cardio (running/walking) is done
// outdoors or on a treadmill; the workouts.location_type CHECK is
// ('home','gym','both'), so 'both' ("anywhere") is the least-wrong value,
// and workout-detail hides the location badge for activity blocks anyway.
const ACTIVITY_BLOCK_LOCATION = 'both';

/** Beta Feedback #007 — one definition of the auto-suggested exercise-workout blurb, kept in sync between generation and the stale-row self-heal. */
const exerciseWorkoutDescription = (experience: string) =>
  `Recommended for your goal and ${experience} experience level.`;

/** Beta Feedback #013 — a strength session's headline/description must stay
 *  faithful to the canonical plan activity (like Beta #006 did for run/walk),
 *  falling back to the generic constants only when the plan carries none. */
function strengthHeadline(activity: StartingPlanActivity): string {
  return (activity.title || activity.activity || SESSION_HEADLINE.gym).trim();
}
function strengthDescription(activity: StartingPlanActivity, experience: string): string {
  return (activity.description || '').trim() || exerciseWorkoutDescription(experience);
}

/** Beta Feedback #006 — the run/walk EXECUTION prescription must stay faithful to the planned activity (title, duration, instructions), not a generic per-key template. */
function activityBlockFields(key: SupportedActivityKey, activity: StartingPlanActivity) {
  const fallbackDescription = key === 'running'
    ? workoutTypeSpec(classifyRunSlot(activity)).activityDescription
    : workoutTypeSpec('walk_easy').activityDescription;
  return {
    title: (activity.title || activity.activity || SESSION_HEADLINE[key]).trim(),
    description: (activity.description || fallbackDescription || '').trim(),
    durationMinutes: Number.isFinite(activity.duration_minutes) && activity.duration_minutes > 0
      ? activity.duration_minutes
      : SESSION_DURATION_MINUTES[key],
  };
}

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
 * Duration (minutes) estimated from a workout's ACTUALLY persisted
 * workout_exercises rows — the single source of truth (lib/programme-generator
 * estimateSessionMinutes). `null` when the workout has no exercise rows.
 */
async function estimateWorkoutDuration(workoutId: string): Promise<number | null> {
  const { data } = await supabase
    .from('workout_exercises')
    .select('sets, reps, rest_seconds')
    .eq('workout_id', workoutId);
  const rows = (data as any[]) ?? [];
  if (rows.length === 0) return null;
  // Beta #015B — a persisted row is a compound lift when its rest is
  // compound-length (accessory 60s / core 45s / compound ≥ 75s, and ≥ 120s
  // for intermediate/advanced). Count them so the ramp-set time matches the
  // generator's own estimate (estimateSessionMinutes second arg).
  const compoundCount = rows.filter(r => (r.rest_seconds ?? 0) >= 90).length;
  return estimateSessionMinutes(rows.map(r => ({
    sets: r.sets ?? 0, reps: r.reps ?? 0, restSeconds: r.rest_seconds ?? 0,
  })), compoundCount);
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
  activity?: StartingPlanActivity,
  workoutType: string = SUGGESTED_WORKOUT_TYPE[key],
  canonical?: { title: string; description: string },
  // Beta #014 — when set (a strength activity's planned_date), reuse the row
  // for that exact planned slot instead of "a row created today". Lets a
  // session planned ahead be reopened on its day without forking, and keeps
  // two different strength days from ever resolving to one row.
  slotDate?: string,
): Promise<{ id: string; title: string; durationMinutes: number; exerciseCount?: number } | null> {
  let query = supabase
    .from('workouts')
    .select('id, title, description, difficulty, created_at, duration_minutes')
    .eq('user_id', userId)
    .eq('workout_type', workoutType)
    .is('program_week_id', null);
  if (slotDate) query = query.eq('suggested_local_date', slotDate);
  const { data } = await query.order('created_at', { ascending: false }).limit(5);
  const rows = ((data as any[]) ?? []).map(r => ({ id: r.id, title: r.title, description: r.description ?? '', difficulty: r.difficulty ?? null, createdAt: r.created_at, durationMinutes: r.duration_minutes }));
  const reused = slotDate ? rows[0] : findReusableSuggestedSession(rows, new Date());
  if (!reused) return null;
  const reusedRow = rows.find(r => r.id === reused.id);
  const durationMinutes = reusedRow?.durationMinutes ?? SESSION_DURATION_MINUTES[key];

  const isActivityBlock = requirements === null;
  if (isActivityBlock) {
    // Beta Feedback #006 — self-heal a stale same-day activity-block row.
    // An earlier generation (or a pre-fix build) may have written the
    // generic template ("Easy Run · 30 min · gym"); bring it in line with
    // the CURRENTLY planned activity, keeping the same row id so any
    // /workout-player deep link stays valid. No new row, no migration.
    if (activity) {
      const f = activityBlockFields(key, activity);
      const stale = reused.title !== f.title
        || durationMinutes !== f.durationMinutes
        || (reusedRow?.description ?? '') !== f.description;
      if (stale) {
        await supabase.from('workouts').update({
          title: f.title, description: f.description, duration_minutes: f.durationMinutes,
          location_type: ACTIVITY_BLOCK_LOCATION, difficulty: context.experience,
        }).eq('id', reused.id).eq('user_id', userId);
        return { id: reused.id, title: f.title, durationMinutes: f.durationMinutes };
      }
    }
    return { id: reused.id, title: reused.title, durationMinutes };
  }

  // Beta Feedback #007 — self-heal a stale same-day EXERCISE-workout row.
  // The row's `difficulty` and the "…and X experience level." description
  // are written once at generation from context.experience; a degraded
  // generation (profile not readable → buildGenerationContext defaults to
  // 'beginner') mislabels an advanced user's session forever. Correct the
  // labels in place to the canonical profile experience — the exercise
  // SELECTION is untouched (an advanced athlete can legitimately have a
  // Push Up, spec §18). Same row id, no new row, no migration.
  if (reusedRow && needsExperienceHeal(reusedRow.difficulty, context.experience)) {
    await supabase.from('workouts').update({
      difficulty: context.experience,
      description: exerciseWorkoutDescription(context.experience),
    }).eq('id', reused.id).eq('user_id', userId);
  }

  // Beta Feedback #013 — self-heal a stale same-day STRENGTH row whose
  // title/description came from the old per-key constant ("Full-body
  // strength") instead of the canonical plan activity ("Upper/lower
  // support"). Same row id, no new row, no migration; exercise selection
  // is untouched.
  if (canonical && (reused.title !== canonical.title || (reusedRow?.description ?? '') !== canonical.description)) {
    await supabase.from('workouts').update({
      title: canonical.title, description: canonical.description,
    }).eq('id', reused.id).eq('user_id', userId);
    reused.title = canonical.title;
  }

  let exerciseCount = await countWorkoutExercises(reused.id);
  if (!isValidSuggestedSession({ isActivityBlock: false, exerciseCount })) {
    exerciseCount = await populateExerciseWorkout(reused.id, requirements, context);
  }
  if (!isValidSuggestedSession({ isActivityBlock: false, exerciseCount })) return null; // repair didn't help — not safely reusable (section 9)

  // Self-heal a stale stored duration. Pre-fix rows carry a flat
  // experience-tier band (e.g. 70) that never matched the real prescription;
  // recompute from the persisted workout_exercises and, when we know the
  // planned minutes, keep it within that ceiling. Same row id, no migration.
  let healedDuration = durationMinutes;
  const computed = await estimateWorkoutDuration(reused.id);
  if (computed != null) {
    const ceiling = activity && Number.isFinite(activity.duration_minutes) && activity.duration_minutes > 0
      ? activity.duration_minutes : null;
    const target = ceiling != null ? Math.min(computed, ceiling) : computed;
    if (Math.abs(target - durationMinutes) >= 2) {
      await supabase.from('workouts').update({ duration_minutes: target }).eq('id', reused.id).eq('user_id', userId);
      healedDuration = target;
    }
  }
  return { id: reused.id, title: reused.title, durationMinutes: healedDuration, exerciseCount };
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
  workoutType: string = SUGGESTED_WORKOUT_TYPE[key],
  // Beta #014 — for a canonical strength activity this is the activity's own
  // planned_date, so the (user, workout_type, suggested_local_date) slot is
  // unique per plan activity, not per "day the user happened to open it".
  // Non-strength callers omit it and keep the today-keyed behaviour.
  slotDate?: string,
): Promise<{ id: string; title: string; durationMinutes: number; won: boolean } | null> {
  const suggestedLocalDate = slotDate ?? toLocalDateKey(new Date());

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
  opts?: { workoutType?: string; description?: string; slotDate?: string; locationType?: 'home' | 'gym' | 'both' },
): Promise<{ id: string; title: string; durationMinutes: number; exerciseCount: number } | null> {
  const claim = await claimStandaloneWorkoutSlot(userId, key, {
    title,
    description: opts?.description ?? exerciseWorkoutDescription(context.experience),
    category,
    location_type: opts?.locationType ?? context.equipmentLocation,
    difficulty: context.experience,
    duration_minutes: durationMinutes,
    is_active: true,
    is_activity_block: false,
  }, opts?.workoutType ?? SUGGESTED_WORKOUT_TYPE[key], opts?.slotDate);
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

/**
 * RUNNING and WALKING reuse the existing activity-block representation
 * (lib/programme-generator.ts's WORKOUT_TYPE_SPECS) — no MuscleWiki, no
 * fabricated pace/HR data. Beta Feedback #006: the row's title/description/
 * duration are taken from the PLANNED activity so "Run intervals · 25 min"
 * stays "Run intervals · 25 min", not a generic "Easy Run · 30 min".
 */
async function generateActivityBlockSession(
  userId: string, key: SupportedActivityKey, activity: StartingPlanActivity, context: GenerationContext,
): Promise<{ id: string; title: string; durationMinutes: number } | null> {
  const f = activityBlockFields(key, activity);
  const claim = await claimStandaloneWorkoutSlot(userId, key, {
    title: f.title,
    description: f.description,
    category: 'cardio',
    location_type: ACTIVITY_BLOCK_LOCATION,
    difficulty: context.experience,
    duration_minutes: f.durationMinutes,
    is_active: true,
    is_activity_block: true,
  });
  if (!claim) return null;
  return { id: claim.id, title: claim.title, durationMinutes: claim.durationMinutes };
}

async function generateSession(
  userId: string, key: SupportedActivityKey, context: GenerationContext, activity: StartingPlanActivity,
  // Beta #014 follow-up — the full-body A/B seed (session ORDINAL in the
  // plan) computed once by the caller, so fresh generation and the reuse /
  // repair path pick the identical variant.
  strengthSeed?: number | string | null,
): Promise<{ id: string; title: string; durationMinutes: number; sessionType: SessionType; exerciseCount?: number } | null> {
  switch (key) {
    case 'gym': {
      // Requirements AND stored duration both come from fitStrengthSession —
      // one computed estimate of the real prescription, fitted under the
      // minutes ACP Intelligence prescribed for this activity, so the
      // workout-detail duration can't diverge from the plan card.
      // Beta Feedback #013 — the base requirement set, the title and the
      // description now follow the CANONICAL activity (its structure /
      // "Upper/lower support" / "…light day"), not a fixed full-body template.
      const structure = classifyStrengthStructure(activity.title, activity.description);
      const { requirements, durationMinutes } = fitStrengthSessionForStructure(
        structure, context.experience, activity.duration_minutes,
        strengthSeed ?? activity.planned_date ?? activity.day ?? null,
      );
      // Beta #015C — location is NOT a substitute for session duration (§10):
      // a standalone support day is now a substantive ~60-min session for an
      // advanced user, so it's no longer stamped 'both' to soften a 24-min
      // gym trip. location_type follows the user's real equipment context
      // (context.equipmentLocation), same as primary strength.
      const w = await generateExerciseSession(
        userId, requirements, context, 'gym', strengthHeadline(activity), 'strength', durationMinutes,
        {
          workoutType: suggestedStrengthWorkoutType(structure),
          description: strengthDescription(activity, context.experience),
          slotDate: activity.planned_date ?? undefined,
        },
      );
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
      const w = await generateActivityBlockSession(userId, 'running', activity, context);
      return w ? { ...w, sessionType: 'activity_block' } : null;
    }
    case 'walking': {
      const w = await generateActivityBlockSession(userId, 'walking', activity, context);
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
    .select('goal, experience_level, activity_level, preferred_activities, goal_target_date, ai_assessment')
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
  // available to findReusableSuggested's repair path (Chunk 4.5A). The
  // prescribed Strength minutes come from THIS activity, so a repaired row is
  // populated with the same fitted requirement set generation would use.
  const context = buildGenerationContext(profile, new Date(), activity.duration_minutes);

  // Beta Feedback #013 — the strength session's structure drives its
  // requirement base AND its standalone-session identity (so an upper day and
  // a lower/support day in the same week never collide or reuse each other).
  const strengthStructure = key === 'gym'
    ? classifyStrengthStructure(activity.title, activity.description) : null;
  const resolvedWorkoutType = strengthStructure
    ? suggestedStrengthWorkoutType(strengthStructure)
    : SUGGESTED_WORKOUT_TYPE[key];
  // Beta #014 — strength standalone sessions are keyed to the plan
  // activity's own planned_date (a full-body day and a support day reviewed
  // in one sitting no longer share one workout row), and the same stable
  // seed picks the full-body A/B variant so two full-body days differ.
  const strengthSlotDate = key === 'gym' ? (activity.planned_date ?? undefined) : undefined;
  // Beta #014 follow-up — the A/B seed is this session's ORDINAL among the
  // plan's full-body sessions (position, not calendar parity), so two
  // full-body days always alternate regardless of their dates. Falls back to
  // planned_date only when the plan can't be enumerated (legacy shape).
  const strengthSeed: number | string | null = (() => {
    if (key !== 'gym' || strengthStructure !== 'full_body') return null;
    const planActs = (profileRow?.ai_assessment as any)?.starting_plan?.activities;
    if (Array.isArray(planActs)) {
      const idx = planActs.findIndex((a: any) =>
        a && a.day === activity.day && a.title === activity.title
        && (a.planned_date ?? null) === (activity.planned_date ?? null));
      if (idx >= 0) return fullBodyOrdinalInPlan(planActs, idx);
    }
    return activity.planned_date ?? activity.day ?? null;
  })();

  const requirementsForKey: ExerciseRequirement[] | null =
    key === 'gym'
      ? fitStrengthSessionForStructure(strengthStructure!, context.experience, activity.duration_minutes, strengthSeed).requirements
    : key === 'mobility' ? MOBILITY_REQUIREMENTS : null;

  // Beta Feedback #006 (cardio) + #013 (strength) — the headline/title must
  // stay faithful to what ACP prescribed ("Run intervals", "Upper/lower
  // support"), not the generic per-key constant ("Easy run", "Full-body
  // strength").
  const isActivityBlockCardio = key === 'running' || key === 'walking';
  const usesCanonicalTitle = isActivityBlockCardio || key === 'gym';
  const headline = usesCanonicalTitle
    ? (activity.title || activity.activity || SESSION_HEADLINE[key]).trim()
    : SESSION_HEADLINE[key];
  const selfTitle = usesCanonicalTitle ? headline : SESSION_TITLE[key];

  const reusable = await findReusableSuggested(
    userId, key, requirementsForKey, context, activity, resolvedWorkoutType,
    key === 'gym' ? { title: headline, description: strengthDescription(activity, context.experience) } : undefined,
    strengthSlotDate,
  );
  const sessionType: SessionType = key === 'running' || key === 'walking' ? 'activity_block' : 'exercise_workout';

  if (reusable) {
    return {
      activityType: key,
      title: headline,
      reason: SESSION_REASON[key],
      durationMinutes: reusable.durationMinutes,
      selfGuided: {
        mode: 'GENERATED_PERSONALISED_SESSION', sessionId: reusable.id, sessionType,
        title: selfTitle, reason: SESSION_REASON[key], exerciseCount: reusable.exerciseCount,
      },
      professionalSupport,
    };
  }

  const generated = await generateSession(userId, key, context, activity, strengthSeed);
  if (!generated) return fallback(professionalSupport);

  return {
    activityType: key,
    title: headline,
    reason: SESSION_REASON[key],
    durationMinutes: generated.durationMinutes,
    selfGuided: {
      mode: 'GENERATED_PERSONALISED_SESSION', sessionId: generated.id, sessionType: generated.sessionType,
      title: selfTitle, reason: SESSION_REASON[key], exerciseCount: generated.exerciseCount,
    },
    professionalSupport,
  };
}

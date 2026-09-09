// LH-40 — the ONE canonical, deterministic strength-set prescription layer.
//
// Before this file, sets/reps/rest came from REPS_BY_ROLE (goal-agnostic:
// accessory = 3×12/60 for everyone) plus an experience-only compound scale.
// A "Build strength" user and a "Lose weight" user got the same template, and
// the AI-written session description (prose) drifted from it ("3 sets of
// 6–10 reps" over an actual 3×12/60 workout).
//
// This module owns the structured prescription. It is:
//   • deterministic — a pure function of (role, goal, experience)
//   • goal-aware    — strength vs fat-loss-support vs endurance-support vs general
//   • role-aware    — compound / accessory / core / mobility differ
//   • conservative  — no 1RM, no RPE/RIR, no load/%: rep ranges + rest only (§12)
// The exercise CATALOGUE (ExerciseDB/MuscleWiki) never feeds it — Lana owns
// programming; the provider only supplies which exercise fills a requirement.
//
// The session description is DERIVED from this same table
// (`describeStrengthPrescription`) so prose can never diverge again.

import type { ProgrammeGoal } from './programme-types.ts';
import type { ExerciseDifficulty } from './exercise-types.ts';

export type PrescriptionRole = 'compound' | 'accessory' | 'core' | 'mobility';

/** The prescription-relevant grouping of Lana's goal taxonomy. Only the four
 *  buckets are meaningfully different for set/rep programming; every real
 *  onboarding goal (build_muscle / lose_weight / maintain_weight) maps here,
 *  and the legacy/DB-only values fall into `general` unless clearly otherwise. */
export type PrescriptionGoalBucket = 'strength' | 'fat_loss' | 'endurance' | 'general';

export function prescriptionGoalBucket(goal: ProgrammeGoal | string | null | undefined): PrescriptionGoalBucket {
  switch (goal) {
    case 'build_muscle':
      return 'strength';
    case 'lose_weight':
    case 'body_recomposition':
    case 'eat_healthier':
      return 'fat_loss';
    case 'improve_running':
      return 'endurance';
    // general_fitness, maintain_weight, healthy_lifestyle, improve_health,
    // improve_mobility, reduce_stress, unknown → the balanced default
    default:
      return 'general';
  }
}

export interface SetPrescription {
  sets: number;
  /** the single working rep target persisted on the workout_exercises row
   *  (0 = a timed hold, for mobility) */
  reps: number;
  restSeconds: number;
  /** the honest rep range for the session summary (e.g. "6–8"); empty for
   *  mobility holds */
  repRangeLabel: string;
  /** deterministic coaching cue — goal- and role-appropriate, never invented
   *  per-exercise by an LLM */
  notes: string;
}

const HOLD: Omit<SetPrescription, 'sets' | 'restSeconds'> = {
  reps: 0,
  repRangeLabel: '',
  notes: 'Move slowly through the full range — pause briefly at end range if it feels tight. Not a strength set.',
};

// ── The table ──────────────────────────────────────────────────────────────
// [role][bucket] → base prescription. Compounds additionally scale by
// experience (below); accessory/core/mobility are flat — there is no
// defensible experience distinction for accessory rep targets without
// introducing load/%1RM, which §12 forbids.

type ByBucket = Record<PrescriptionGoalBucket, SetPrescription>;

const ACCESSORY: ByBucket = {
  strength:  { sets: 3, reps: 10, restSeconds: 75, repRangeLabel: '8–12',  notes: 'Aim for 8–12 controlled reps; the last 1–2 should feel hard with good form.' },
  fat_loss:  { sets: 3, reps: 14, restSeconds: 45, repRangeLabel: '12–15', notes: 'Aim for 12–15 reps at a steady pace; keep rest short.' },
  endurance: { sets: 3, reps: 12, restSeconds: 60, repRangeLabel: '10–15', notes: 'Aim for 10–15 reps with good form — supportive work, not to failure.' },
  general:   { sets: 3, reps: 12, restSeconds: 60, repRangeLabel: '10–15', notes: 'Aim for 10–15 reps with good form.' },
};

const CORE: ByBucket = {
  strength:  { sets: 3, reps: 12, restSeconds: 45, repRangeLabel: '10–15', notes: 'Aim for 10–15 hard reps, or a 30–45s hold if it’s a timed exercise.' },
  fat_loss:  { sets: 3, reps: 16, restSeconds: 40, repRangeLabel: '15–20', notes: 'Aim for 15–20 reps, or a 40–60s hold if it’s timed; short rest.' },
  endurance: { sets: 3, reps: 15, restSeconds: 45, repRangeLabel: '12–15', notes: 'Aim for 12–15 reps, or a 30–45s hold if it’s timed.' },
  general:   { sets: 3, reps: 15, restSeconds: 45, repRangeLabel: '12–15', notes: 'Aim for 12–15 reps, or a 30–45s hold if it’s timed.' },
};

// Compound: [bucket][experience]. Strength drops reps / adds sets & rest with
// experience (the main lever for a longer advanced session); fat_loss keeps
// reps moderate-high and rest short; endurance/general stay conservative.
const COMPOUND: Record<PrescriptionGoalBucket, Record<ExerciseDifficulty, SetPrescription>> = {
  strength: {
    beginner:     { sets: 3, reps: 8, restSeconds: 90,  repRangeLabel: '6–8', notes: 'Aim for 6–8 solid reps. Pick a weight where the last rep is challenging but your form holds.' },
    intermediate: { sets: 4, reps: 6, restSeconds: 150, repRangeLabel: '5–7', notes: 'Aim for 5–7 reps across 4 working sets. Leave ~1 rep in reserve; rest fully between sets.' },
    advanced:     { sets: 4, reps: 5, restSeconds: 180, repRangeLabel: '4–6', notes: 'Aim for 4–6 heavy reps across 4 working sets after ramp-up. Full recovery between sets.' },
  },
  fat_loss: {
    beginner:     { sets: 3, reps: 12, restSeconds: 60, repRangeLabel: '10–12', notes: 'Aim for 10–12 reps. Keep rest to about a minute and the effort steady.' },
    intermediate: { sets: 3, reps: 10, restSeconds: 75, repRangeLabel: '8–12',  notes: 'Aim for 8–12 reps with short rest — enough to keep good form, not full recovery.' },
    advanced:     { sets: 4, reps: 10, restSeconds: 75, repRangeLabel: '8–12',  notes: 'Aim for 8–12 reps across 4 sets with short rest; keep the session moving.' },
  },
  endurance: {
    beginner:     { sets: 3, reps: 10, restSeconds: 75, repRangeLabel: '8–10', notes: 'Aim for 8–10 controlled reps — enough to build durability without heavy fatigue for your runs.' },
    intermediate: { sets: 3, reps: 8,  restSeconds: 90, repRangeLabel: '6–10', notes: 'Aim for 6–10 reps. Strong but not maximal — this supports your running, it isn’t the focus.' },
    advanced:     { sets: 3, reps: 8,  restSeconds: 90, repRangeLabel: '6–10', notes: 'Aim for 6–10 reps. Strong but not maximal — this supports your running, it isn’t the focus.' },
  },
  // `general` compound values are deliberately IDENTICAL to the pre-LH-40
  // experience scale (lib/programme-generator.ts COMPOUND_BY_EXPERIENCE), so a
  // caller that does not pass a goal gets exactly today's behaviour and
  // `prescribeSet` is a faithful superset — not a second, diverging model.
  general: {
    beginner:     { sets: 3, reps: 10, restSeconds: 75,  repRangeLabel: '8–12', notes: 'Aim for 8–12 reps. Choose a weight where the last 2–3 reps feel challenging but doable with good form.' },
    intermediate: { sets: 4, reps: 9,  restSeconds: 120, repRangeLabel: '7–10', notes: 'Aim for 7–10 reps across 4 sets with a challenging last set.' },
    advanced:     { sets: 4, reps: 8,  restSeconds: 150, repRangeLabel: '6–10', notes: 'Aim for 6–10 reps across 4 sets with the last 1–2 reps hard.' },
  },
};

/**
 * The canonical set prescription for one exercise role, given the user's goal
 * and experience. Mobility never inherits strength volume. This is the exact
 * `{ sets, reps, rest_seconds, notes }` persisted to `workout_exercises`.
 */
export function prescribeSet(input: {
  role: PrescriptionRole;
  goal: ProgrammeGoal | string | null | undefined;
  experience: ExerciseDifficulty;
}): SetPrescription {
  const bucket = prescriptionGoalBucket(input.goal);
  switch (input.role) {
    case 'mobility':
      return { sets: 2, restSeconds: 15, ...HOLD };
    case 'compound':
      return { ...COMPOUND[bucket][input.experience] };
    case 'accessory':
      return { ...ACCESSORY[bucket] };
    case 'core':
      return { ...CORE[bucket] };
  }
}

// ── Derived, drift-proof session summary (§8) ──────────────────────────────

const BUCKET_INTENT: Record<PrescriptionGoalBucket, string> = {
  strength:  'A strength-focused session: heavier compound lifts in lower rep ranges with longer rest, then moderate-rep accessory and core work.',
  fat_loss:  'A metabolic strength session: moderate loads, higher reps and shorter rest to keep the effort up throughout.',
  endurance: 'A running-support strength session: enough load to build durability, kept clear of the fatigue that would affect your runs.',
  general:   'A balanced strength session: moderate rep ranges across compound, accessory and core work.',
};

const ROLE_LABEL: Record<PrescriptionRole, string> = {
  compound: 'Compound lifts', accessory: 'Accessories', core: 'Core', mobility: 'Mobility',
};
const ROLE_ORDER: PrescriptionRole[] = ['compound', 'accessory', 'core', 'mobility'];

/**
 * A truthful one-paragraph summary of a strength session, built entirely from
 * `prescribeSet` for the roles the session actually contains — so it always
 * agrees with the per-exercise sets/reps/rest shown in the workout, and can
 * never be a hand-written universal claim that drifts (§8).
 */
export function describeStrengthPrescription(
  roles: PrescriptionRole[],
  goal: ProgrammeGoal | string | null | undefined,
  experience: ExerciseDifficulty,
): string {
  const bucket = prescriptionGoalBucket(goal);
  const present = ROLE_ORDER.filter(r => roles.includes(r));
  if (present.length === 0) return BUCKET_INTENT[bucket];

  const parts = present.map(role => {
    const rx = prescribeSet({ role, goal, experience });
    if (role === 'mobility') return `${ROLE_LABEL[role]}: ${rx.sets} sets, slow controlled holds`;
    return `${ROLE_LABEL[role]}: ${rx.sets}×${rx.repRangeLabel}`;
  });

  const rests = present
    .filter(r => r !== 'mobility')
    .map(role => prescribeSet({ role, goal, experience }).restSeconds);
  const restClause = rests.length
    ? ` Rest ${Math.min(...rests)}–${Math.max(...rests)}s between sets.`
    : '';

  return `${BUCKET_INTENT[bucket]} ${parts.join(' · ')}.${restClause} Each exercise below lists its own sets, reps and rest.`;
}

// ACP Intelligence™ — Beta Feedback #011. Workout Session Summary.
//
// Pure, deterministic, ZERO-LLM (spec §12/§13). Turns the evidence a strength
// session already collected — logged sets, actual load/reps, completion %,
// perceived difficulty, exercise ratings, free-text notes, and the user's
// previous logged session for the same exercises — into:
//   1. a typed WorkoutSessionEvidence object (§17), and
//   2. a grounded, templated "what happened" summary + one coaching line.
//
// It never computes anything with a model, never claims physiology ("you are
// stronger"), never converts one session into a durable preference or a plan
// change (§19/§21/§27). Free-text is CLASSIFIED conservatively and kept
// session-local; health/pain language is reduced to a neutral phrasing, never
// a diagnosis (§14/§25).

// ── Inputs (caller assembles from canonical tables) ────────────────────────

export interface SessionExerciseInput {
  exerciseId: string;
  name: string;
  /** workout_exercises.sets — the prescription for this session */
  plannedSets: number | null;
  plannedReps: number | null;
  /** this session's actual workout_set_logs rows for this exercise */
  loggedSets: { setNumber: number; reps: number | null; weightKg: number | null }[];
  /** exercise_ratings.rating (1-5). Persistent per-exercise value; its dimension
   *  is UNDEFINED in the product (§15) — reported factually here, never used as
   *  a difficulty or adaptation signal. */
  rating: number | null;
  /** workout_history.exercise_notes[exerciseId] — this session's free-text note */
  note: string | null;
  /** logged sets for this exercise from the user's most recent OTHER completed
   *  session, or null when there is no prior data (→ no progression claim) */
  previousSets: { reps: number | null; weightKg: number | null }[] | null;
}

export interface WorkoutSessionInput {
  workoutTitle: string;
  plannedExerciseCount: number;
  actualDurationMinutes: number | null;
  completionPercentage: number | null;
  /** workout_history.perceived_difficulty */
  perceivedDifficulty: 'easy' | 'about_right' | 'difficult' | null;
  /** workout_history.rating (1-5) — session-level; semantics undefined, factual only */
  sessionRating: number | null;
  exercises: SessionExerciseInput[];
}

// ── Free-text classification (§14) ────────────────────────────────────────

export type NoteCategory =
  | 'health_sensitive'    // pain / injury language — never diagnosed
  | 'preference_dislike'  // explicit dislike
  | 'progression_intent'  // "go heavier next time"
  | 'difficulty'          // "too easy" / "too hard"
  | 'technique_fit'       // "couldn't feel it", form/balance
  | 'other';

// Conservative, order matters: a note that mentions pain is health_sensitive
// even if it also says "too heavy".
const HEALTH_RE = /\b(hurts?|painful?|pain|injur\w*|strain\w*|pulled|tweak\w*|ache[sd]?|aching|sharp\b|numb\b|dizz\w*|nause\w*|shoulder hurt|knee hurt|back hurt)\b/i;
const DISLIKE_RE = /\b(hate[sd]?|dislike[sd]?|can'?t stand|can not stand|not a fan|loathe|despise)\b/i;
const PROGRESS_RE = /\b(go(ing)? heavier|heavier next|add(ing)? (weight|load)|more weight|increase (the )?weight|level up|too light)\b/i;
const TOO_HARD_RE = /\b(too hard|too heavy|struggled|could ?n'?t finish|couldn ?not finish|failed|brutal|killed me|way too much)\b/i;
const TOO_EASY_RE = /\b(too easy|felt easy|no challenge|not challenging|barely felt|way too easy)\b/i;
const TECHNIQUE_RE = /\b(could ?n'?t feel|didn'?t feel it|form (was )?off|lost balance|grip (gave|failed)|range of motion|felt it in the wrong)\b/i;

/**
 * Classifies one exercise note. `safeSummary` is a neutral phrasing safe to
 * surface or (in future) persist — it NEVER contains a medical conclusion and
 * NEVER echoes raw pain text. `null` means "nothing structured to say" — the
 * UI may still show the user their own raw words (session-local, their text).
 */
export function classifyExerciseNote(text: string): { category: NoteCategory; safeSummary: string | null } {
  const t = (text ?? '').trim();
  if (!t) return { category: 'other', safeSummary: null };
  if (HEALTH_RE.test(t)) return { category: 'health_sensitive', safeSummary: 'Reported discomfort during this exercise' };
  if (DISLIKE_RE.test(t)) return { category: 'preference_dislike', safeSummary: 'Noted they dislike this exercise' };
  if (PROGRESS_RE.test(t)) return { category: 'progression_intent', safeSummary: 'Noted they want more load next time' };
  if (TOO_HARD_RE.test(t)) return { category: 'difficulty', safeSummary: 'Noted it felt too hard' };
  if (TOO_EASY_RE.test(t)) return { category: 'difficulty', safeSummary: 'Noted it felt too easy' };
  if (TECHNIQUE_RE.test(t)) return { category: 'technique_fit', safeSummary: 'Left a form / feel comment' };
  return { category: 'other', safeSummary: null };
}

// ── Actual-to-actual load comparison (§22) ────────────────────────────────

export interface LoadComparison {
  exerciseId: string;
  name: string;
  direction: 'up' | 'down' | 'same' | 'no_previous';
  /** top-set weight delta in kg when both sessions have a known load */
  deltaKg: number | null;
}

function topWeight(sets: { weightKg: number | null }[] | null | undefined): number | null {
  const ws = (sets ?? []).map(s => s.weightKg).filter((w): w is number => typeof w === 'number' && w > 0);
  return ws.length > 0 ? Math.max(...ws) : null;
}

export function compareLoads(ex: SessionExerciseInput): LoadComparison {
  const cur = topWeight(ex.loggedSets);
  const prev = topWeight(ex.previousSets);
  if (cur == null || prev == null) {
    return { exerciseId: ex.exerciseId, name: ex.name, direction: 'no_previous', deltaKg: null };
  }
  const delta = Math.round((cur - prev) * 100) / 100;
  return {
    exerciseId: ex.exerciseId, name: ex.name,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
    deltaKg: delta,
  };
}

// ── Evidence assembly (§17) ───────────────────────────────────────────────

export interface WorkoutSessionEvidence {
  workoutTitle: string;
  completedExerciseCount: number;
  plannedExerciseCount: number;
  loggedSetCount: number;
  completionPercentage: number | null;
  actualDurationMinutes: number | null;
  perceivedDifficulty: 'easy' | 'about_right' | 'difficult' | null;
  sessionRating: number | null;
  ratedExerciseCount: number;
  positiveRatingCount: number;
  notes: { exerciseName: string; text: string; category: NoteCategory; safeSummary: string | null }[];
  /** only exercises with a real previous session to compare against */
  loadChanges: LoadComparison[];
}

/** An exercise counts as completed when all prescribed sets were logged (or, when there's no set prescription, at least one set was logged). */
function isExerciseComplete(e: SessionExerciseInput): boolean {
  return e.plannedSets == null || e.plannedSets <= 0
    ? e.loggedSets.length > 0
    : e.loggedSets.length >= e.plannedSets;
}

export function buildWorkoutSessionEvidence(input: WorkoutSessionInput): WorkoutSessionEvidence {
  const rated = input.exercises.filter(e => typeof e.rating === 'number');
  return {
    workoutTitle: input.workoutTitle,
    completedExerciseCount: input.exercises.filter(isExerciseComplete).length,
    plannedExerciseCount: input.plannedExerciseCount,
    loggedSetCount: input.exercises.reduce((s, e) => s + e.loggedSets.length, 0),
    completionPercentage: input.completionPercentage,
    actualDurationMinutes: input.actualDurationMinutes,
    perceivedDifficulty: input.perceivedDifficulty,
    sessionRating: input.sessionRating,
    ratedExerciseCount: rated.length,
    positiveRatingCount: rated.filter(e => (e.rating ?? 0) >= 4).length,
    notes: input.exercises
      .filter(e => e.note && e.note.trim())
      .map(e => {
        const c = classifyExerciseNote(e.note!.trim());
        return { exerciseName: e.name, text: e.note!.trim(), category: c.category, safeSummary: c.safeSummary };
      }),
    loadChanges: input.exercises.map(compareLoads).filter(l => l.direction !== 'no_previous'),
  };
}

// ── Deterministic user-facing summary (§11/§13) ───────────────────────────

const DIFFICULTY_PHRASE: Record<'easy' | 'about_right' | 'difficult', string> = {
  easy: 'felt easy',
  about_right: 'felt about right',
  difficult: 'felt hard',
};

export interface WorkoutSessionSummary {
  /** short grounded fact lines — every number here is computed, never modelled */
  facts: string[];
  /** one templated coaching sentence, bounded to what one session supports */
  coachingLine: string;
}

export function summarizeWorkoutSession(ev: WorkoutSessionEvidence): WorkoutSessionSummary {
  const facts: string[] = [];

  facts.push(`${ev.completedExerciseCount} of ${ev.plannedExerciseCount} exercises completed.`);
  if (ev.actualDurationMinutes != null && ev.actualDurationMinutes > 0) {
    facts.push(`${ev.actualDurationMinutes} min.`);
  }
  if (ev.completionPercentage != null) {
    facts.push(`${Math.round(ev.completionPercentage)}% of prescribed sets logged.`);
  }
  if (ev.perceivedDifficulty) {
    facts.push(`You said it ${DIFFICULTY_PHRASE[ev.perceivedDifficulty]}.`);
  }
  if (ev.ratedExerciseCount > 0) {
    facts.push(`Rated ${ev.positiveRatingCount} of ${ev.ratedExerciseCount} exercise${ev.ratedExerciseCount === 1 ? '' : 's'} 4★ or higher.`);
  }

  const up = ev.loadChanges.filter(l => l.direction === 'up');
  const down = ev.loadChanges.filter(l => l.direction === 'down');
  if (up.length > 0) {
    facts.push(`Load increased on ${up.length} exercise${up.length === 1 ? '' : 's'} vs your last logged session.`);
  }
  if (down.length > 0) {
    facts.push(`Load was lighter on ${down.length} exercise${down.length === 1 ? '' : 's'} vs your last logged session.`);
  }

  for (const n of ev.notes) {
    if (n.category === 'health_sensitive') {
      facts.push(`Note on ${n.exerciseName}: reported some discomfort.`);
    } else if (n.safeSummary) {
      facts.push(`Note on ${n.exerciseName}: ${n.safeSummary.replace(/^./, c => c.toLowerCase())}.`);
    } else {
      facts.push(`Note on ${n.exerciseName}: “${n.text}”.`);
    }
  }

  const fullyCompleted =
    ev.plannedExerciseCount > 0 && ev.completedExerciseCount >= ev.plannedExerciseCount;

  let coachingLine: string;
  if (!fullyCompleted) {
    coachingLine = `You logged ${ev.completedExerciseCount} of ${ev.plannedExerciseCount} exercises. A partial session still counts — pick the rest up next time.`;
  } else if (ev.perceivedDifficulty === 'difficult') {
    coachingLine = `You finished the full session and it felt hard. If that keeps happening, ACP will ease the next one — one session on its own doesn’t change your plan.`;
  } else if (ev.perceivedDifficulty === 'easy') {
    coachingLine = `You finished the full session and it felt easy. If a few more feel the same, ACP may add a little challenge next time.`;
  } else if (ev.perceivedDifficulty === 'about_right') {
    coachingLine = `You finished the full session and it felt about right — nicely matched. Keep going.`;
  } else {
    coachingLine = `You finished the full session. Keep going — consistency is what moves the needle.`;
  }

  return { facts, coachingLine };
}

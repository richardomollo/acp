import {
  StyleSheet, View, TouchableOpacity, Alert,
  ScrollView, Dimensions, TextInput,
  KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize, shadows, darkTheme } from '@/constants/theme';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ensureNotificationPermission, scheduleRestEndNotification, cancelNotification,
} from '@/services/notifications';
import { workoutExecutionService, type PerceivedDifficulty } from '@/services/workout-execution-service';
import { ExerciseMedia } from '@/components/exercise-media';
import {
  buildWorkoutSessionEvidence, summarizeWorkoutSession,
  type WorkoutSessionSummary, type SessionExerciseInput, type WorkoutSessionInput,
} from '@/lib/workout-session-summary';

const SCREEN_W = Dimensions.get('window').width;
const GIF_SIZE = SCREEN_W - 120;

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkoutExercise {
  id: string;
  sort_order: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  notes: string | null;
  exercises: {
    id: string;
    name: string;
    body_part: string | null;
    target_muscle: string | null;
    equipment: string | null;
    instructions: string[];
    gif_url: string | null;
  };
}

interface Workout {
  id: string;
  title: string;
  category: string;
  duration_minutes: number;
  is_activity_block: boolean;
  description: string | null;
}

interface SetLog {
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number;
  restSecondsActual: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_GRADIENTS: Record<string, readonly [string, string]> = {
  full_body: [palette.blue500, '#0044ee'],
  hiit:      ['#ef4444', '#f97316'],
  mobility:  ['#15803d', '#16a34a'],
  core:      ['#7c3aed', '#9333ea'],
  push:      ['#111111', '#374151'],
  pull:      ['#1d4ed8', '#1e40af'],
  legs:      ['#92400e', '#b45309'],
  strength:  ['#000000', '#111827'],
};
const DEFAULT_GRAD: readonly [string, string] = [palette.ink900, '#333'];

// Dark theme for the active-workout screen (matches the reference dashboard:
// near-black background, dark card surfaces, off-white text, one bright
// lime-green accent for progress/highlights, small semantic colors kept for
// rating stars / heart / warnings) — shared with fitness-journey.tsx via
// constants/theme.ts so both screens stay visually in sync.
const DARK = darkTheme;

// ── Timer hook ────────────────────────────────────────────────────────────────

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    ref.current = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);

  return seconds;
}

// Wall-clock based (rather than decrement-per-tick) so the countdown
// self-corrects the instant the app returns from background — RN's JS
// timers pause while backgrounded, so a naive setInterval/setTimeout
// countdown would otherwise resume from wherever it stalled instead of
// reflecting how much rest time has actually elapsed.
function useCountdown(from: number, onDone: () => void) {
  const [remaining, setRemaining] = useState(from);
  const doneRef = useRef(false);
  const targetRef = useRef(Date.now() + from * 1000);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    doneRef.current = false;
    targetRef.current = Date.now() + from * 1000;
    setRemaining(from);
  }, [from]);

  useEffect(() => {
    const tick = () => {
      const secsLeft = Math.max(0, Math.round((targetRef.current - Date.now()) / 1000));
      setRemaining(secsLeft);
      if (secsLeft <= 0 && !doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };
    const interval = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => { clearInterval(interval); sub.remove(); };
  }, []);

  return remaining;
}

// Matches both the historical ExerciseDB-era "body weight" (two words) and
// MuscleWiki's real "Bodyweight" (one word) vocabulary — verified live
// (Beta Readiness Step 1) that MuscleWiki's own equipment value has no space.
function isBodyweight(equipment: string | null): boolean {
  return (equipment ?? '').toLowerCase().replace(/\s+/g, '') === 'bodyweight';
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

type Phase = 'exercise' | 'rest' | 'done';

function LogStepper({
  value, min, max, step, suffix = '', onChange,
}: {
  value: number; min: number; max: number; step: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={l.stepper}>
      <TouchableOpacity
        style={[l.stepBtn, value <= min && l.stepBtnDisabled]}
        onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
        disabled={value <= min} hitSlop={10}
      >
        <Ionicons name="remove" size={14} color={value <= min ? DARK.textFaint : DARK.text} />
      </TouchableOpacity>
      <ThemedText style={l.stepVal}>{value}{suffix}</ThemedText>
      <TouchableOpacity
        style={[l.stepBtn, value >= max && l.stepBtnDisabled]}
        onPress={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
        disabled={value >= max} hitSlop={10}
      >
        <Ionicons name="add" size={14} color={value >= max ? DARK.textFaint : DARK.text} />
      </TouchableOpacity>
    </View>
  );
}

const l = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: DARK.cardAlt,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK.border,
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepVal: { fontSize: 14, fontWeight: '800', color: DARK.text, minWidth: 40, textAlign: 'center' },
});

const MOTIVATION_QUOTES = [
  'Every rep counts.',
  "You're stronger than yesterday.",
  'Breathe. You’ve got this.',
  'Rest now, crush it next set.',
  'Progress, not perfection.',
  'Small steps, big results.',
  'Your only competition is you.',
  'Champions rest smart.',
  'Discipline beats motivation.',
  'One set closer to your goal.',
  'Keep showing up.',
  'Strong body, strong mind.',
  'This is your moment.',
  'Push comes after pause.',
  'You showed up. That’s the hard part.',
];

function RestTimer({
  seconds, onSkip, onNaturalEnd,
}: { seconds: number; onSkip: () => void; onNaturalEnd: () => void }) {
  const [phase, setPhase] = useState<'resting' | 'done'>('resting');
  const remaining = useCountdown(seconds, useCallback(() => {
    setPhase('done');
    onNaturalEnd();
  }, [onNaturalEnd]));
  const [quote] = useState(() => MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)]);

  if (phase === 'done') return null;

  return (
    <View style={r.overlay}>
      <View style={r.box}>
        <ThemedText style={r.label}>Rest</ThemedText>
        <ThemedText style={r.count}>{remaining}s</ThemedText>
        <ThemedText style={r.quote}>{quote}</ThemedText>
        <TouchableOpacity style={r.skipBtn} onPress={onSkip}>
          <ThemedText style={r.skipText}>Skip rest</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const r = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  box: { backgroundColor: DARK.card, borderRadius: radii.xl, padding: 36, alignItems: 'center', width: 260, borderWidth: 1, borderColor: DARK.border },
  label: { fontSize: 14, fontWeight: '700', color: DARK.textMuted, marginBottom: 8 },
  count: { fontSize: 64, fontWeight: '900', color: DARK.accent, letterSpacing: -2, paddingTop: 40 },
  quote: { fontSize: 13.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 14, lineHeight: 18 },
  skipBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  skipText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ── Main player ────────────────────────────────────────────────────────────────

export default function WorkoutPlayerScreen() {
  // Beta #010 — plan link (present only when launched from Home's plan
  // recommendation). When set, finishing moves plan_activity_completions +
  // plan_activity_execution directly, and the done screen returns to Home.
  const { workoutId, planId, activityIndex, plannedDate } = useLocalSearchParams<{
    workoutId: string; planId?: string; activityIndex?: string; plannedDate?: string;
  }>();
  const planLink = useMemo(
    () => (planId && activityIndex != null && activityIndex !== '' && plannedDate
      ? { planId, activityIndex: Number(activityIndex), plannedDate }
      : null),
    [planId, activityIndex, plannedDate],
  );
  const router = useRouter();

  const [workout, setWorkout]         = useState<Workout | null>(null);
  const [exercises, setExercises]     = useState<WorkoutExercise[]>([]);
  const [queue, setQueue]             = useState<WorkoutExercise[]>([]);
  const [skippedIds, setSkippedIds]   = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [completedSets, setCompletedSets] = useState<Record<string, number>>({});
  const [resting, setResting]         = useState(false);
  const [restSecs, setRestSecs]       = useState(60);
  const [phase, setPhase]             = useState<Phase>('exercise');
  const [startTs]                     = useState(Date.now());
  const elapsed                       = useTimer();
  const listRef                       = useRef<ScrollView>(null);
  const restNotificationIdRef         = useRef<string | null>(null);

  const [setLogs, setSetLogs]         = useState<SetLog[]>([]);
  const [logWeight, setLogWeight]     = useState(0);
  const [logReps, setLogReps]         = useState(10);

  const [historyId, setHistoryId]     = useState<string | null>(null);
  const [sessionNote, setSessionNote] = useState('');
  const [savingNote, setSavingNote]   = useState(false);
  const [noteSaved, setNoteSaved]     = useState(false);

  const [exerciseNotes, setExerciseNotes]     = useState<Record<string, string>>({});
  const [showNoteInput, setShowNoteInput]     = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const [userId, setUserId]                   = useState<string | null>(null);
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<Set<string>>(new Set());
  const [exerciseRatings, setExerciseRatings] = useState<Record<string, number>>({});
  const [sessionRating, setSessionRating]     = useState(0);
  const [savingRating, setSavingRating]       = useState(false);

  // Day 3 — session persistence/resume + activity-block + difficulty check-in
  const [reopenedSummary, setReopenedSummary] = useState(false); // true if this session was already completed (read-only reopen)
  const [perceivedDifficulty, setPerceivedDifficulty] = useState<PerceivedDifficulty | null>(null);
  const [activityDurationMin, setActivityDurationMin] = useState(0);
  const [completionPct, setCompletionPct]     = useState<number | null>(null);
  // Beta #011 — deterministic session summary shown on the done screen.
  // `sessionEvidenceInput` is the difficulty/rating-independent part, set once
  // at finish; `sessionSummary` is derived from it + the current taps.
  const [sessionEvidenceInput, setSessionEvidenceInput] =
    useState<Omit<WorkoutSessionInput, 'perceivedDifficulty' | 'sessionRating'> | null>(null);
  const [sessionSummary, setSessionSummary]   = useState<WorkoutSessionSummary | null>(null);

  const lastSetCompletedAtRef                 = useRef<number | null>(null);

  const cancelPendingRestNotification = useCallback(() => {
    if (restNotificationIdRef.current) {
      cancelNotification(restNotificationIdRef.current);
      restNotificationIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Requested up front so the rest-end alarm doesn't interrupt the first
    // rest period with a permission prompt.
    ensureNotificationPermission();
    return () => { cancelPendingRestNotification(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!workoutId) return;
    (async () => {
      const session = await authService.getSession();
      const uid = session?.user.id ?? null;
      setUserId(uid);

      const [wRes, exRes, favRes, ratingRes] = await Promise.all([
        supabase.from('workouts').select('id, title, category, duration_minutes, is_activity_block, description').eq('id', workoutId).single(),
        supabase
          .from('workout_exercises')
          .select(`
            id, sort_order, sets, reps, duration_seconds, rest_seconds, notes,
            exercises ( id, name, body_part, target_muscle, equipment, instructions, gif_url )
          `)
          .eq('workout_id', workoutId)
          .order('sort_order'),
        uid ? supabase.from('exercise_favorites').select('exercise_id').eq('user_id', uid).eq('source', 'db') : Promise.resolve({ data: [] }),
        uid ? supabase.from('exercise_ratings').select('exercise_id, rating').eq('user_id', uid).eq('source', 'db') : Promise.resolve({ data: [] }),
      ]);
      const loadedExercises = (exRes.data as unknown as WorkoutExercise[]) ?? [];
      const loadedWorkout = wRes.data as Workout ?? null;
      setWorkout(loadedWorkout);
      setExercises(loadedExercises);
      setQueue(loadedExercises);
      setFavoriteExerciseIds(new Set(((favRes.data as any[]) ?? []).map(r => r.exercise_id)));
      setExerciseRatings(Object.fromEntries(((ratingRes.data as any[]) ?? []).map(r => [r.exercise_id, r.rating])));
      setActivityDurationMin(loadedWorkout?.duration_minutes ?? 0);

      // Day 3 — resolve/create the session up front: resumes an in-progress
      // one (hydrating already-logged sets so the queue picks up where it
      // left off), or reopens a completed one as a read-only summary rather
      // than silently starting a duplicate.
      if (uid && workoutId) {
        const started = await workoutExecutionService.startWorkout(uid, workoutId as string);
        if (started.status === 'not_authorized') {
          setLoading(false);
          return;
        }
        setHistoryId(started.historyId);

        if (started.status === 'already_completed') {
          const summary = await workoutExecutionService.getWorkoutSummary(started.historyId);
          setCompletionPct((summary.history as any)?.completion_percentage ?? null);
          setPerceivedDifficulty((summary.history as any)?.perceived_difficulty ?? null);
          setReopenedSummary(true);
          setPhase('done');
        } else if (started.status === 'resumed') {
          const logged = await workoutExecutionService.getLoggedSets(started.historyId);
          const doneCounts: Record<string, number> = {};
          const hydratedLogs: SetLog[] = [];
          for (const log of logged) {
            const we = loadedExercises.find(e => e.exercises.id === log.exerciseId);
            if (!we) continue;
            doneCounts[we.id] = Math.max(doneCounts[we.id] ?? 0, log.setNumber);
            hydratedLogs.push({ exerciseId: log.exerciseId, setNumber: log.setNumber, weightKg: log.weightKg, reps: log.reps ?? 0, restSecondsActual: null });
          }
          setCompletedSets(doneCounts);
          setSetLogs(hydratedLogs);
          // Skip straight past any exercise whose prescribed sets are already fully logged.
          setQueue(loadedExercises.filter(e => (doneCounts[e.id] ?? 0) < (e.sets ?? 1)));
        }
      }

      setLoading(false);
    })();
  }, [workoutId]);

  const toggleExerciseFavorite = async (exerciseId: string) => {
    if (!userId) return;
    const isFav = favoriteExerciseIds.has(exerciseId);
    setFavoriteExerciseIds(prev => {
      const next = new Set(prev);
      isFav ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
    if (isFav) {
      await supabase.from('exercise_favorites').delete()
        .eq('user_id', userId).eq('source', 'db').eq('exercise_id', exerciseId);
    } else {
      await supabase.from('exercise_favorites').insert({ user_id: userId, source: 'db', exercise_id: exerciseId });
    }
  };

  const rateExercise = async (exerciseId: string, rating: number) => {
    if (!userId) return;
    setExerciseRatings(prev => ({ ...prev, [exerciseId]: rating }));
    await supabase.from('exercise_ratings')
      .upsert({ user_id: userId, source: 'db', exercise_id: exerciseId, rating, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,source,exercise_id' });
  };

  const rateSession = async (rating: number) => {
    if (!historyId || savingRating) return;
    setSessionRating(rating);
    setSavingRating(true);
    await supabase.from('workout_history').update({ rating }).eq('id', historyId);
    setSavingRating(false);
  };

  const currentExercise = queue[0];
  const nextExercise    = queue[1];
  const totalExercises  = exercises.length;
  const doneCount       = totalExercises - queue.length;
  const progress        = totalExercises > 0 ? (doneCount / totalExercises) : 0;
  const grad            = workout ? (CARD_GRADIENTS[workout.category] ?? DEFAULT_GRAD) : DEFAULT_GRAD;
  const wasSkipped      = currentExercise ? skippedIds.has(currentExercise.id) : false;

  const doneSets = currentExercise ? (completedSets[currentExercise.id] ?? 0) : 0;
  const totalSets = currentExercise?.sets ?? 1;

  useEffect(() => {
    if (!currentExercise) return;
    setLogReps(currentExercise.reps ?? 10);
    const lastLog = [...setLogs].reverse().find(l => l.exerciseId === currentExercise.exercises.id);
    setLogWeight(lastLog?.weightKg ?? 0);
    setShowNoteInput(!!exerciseNotes[currentExercise.exercises.id]?.trim());
    setShowInstructions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExercise?.id]);

  const markSetDone = () => {
    if (!currentExercise) return;
    const bodyweight = isBodyweight(currentExercise.exercises.equipment);
    const newDone = doneSets + 1;
    const now = Date.now();
    const restSecondsActual = lastSetCompletedAtRef.current != null
      ? Math.round((now - lastSetCompletedAtRef.current) / 1000)
      : null;
    lastSetCompletedAtRef.current = now;
    const weightKg = bodyweight ? null : (logWeight > 0 ? logWeight : null);
    setCompletedSets(prev => ({ ...prev, [currentExercise.id]: newDone }));
    setSetLogs(prev => [...prev, {
      exerciseId: currentExercise.exercises.id,
      setNumber: newDone,
      weightKg,
      reps: logReps,
      restSecondsActual,
    }]);
    // Persisted immediately (not batched at the end) so progress survives
    // quitting mid-workout and the session is genuinely resumable (Day 3
    // section 13) — optimistic, like the rest of this screen's writes.
    if (userId && historyId) {
      workoutExecutionService.saveSet(userId, historyId, currentExercise.exercises.id, newDone, { reps: logReps, weightKg, restSecondsActual }).catch(() => {});
    }

    if (newDone < totalSets) {
      // Still more sets — start rest
      setRestSecs(currentExercise.rest_seconds);
      setResting(true);
      scheduleRestEndNotification(currentExercise.rest_seconds, currentExercise.exercises.name)
        .then(id => { restNotificationIdRef.current = id; })
        .catch(() => {});
    } else {
      // All sets done — move to next exercise or finish
      advanceExercise();
    }
  };

  const advanceExercise = () => {
    setResting(false);
    const remaining = queue.slice(1);
    setQueue(remaining);
    if (remaining.length === 0) finishWorkout();
  };

  const skipForNow = () => {
    if (queue.length <= 1 || !currentExercise) return;
    setSkippedIds(prev => new Set(prev).add(currentExercise.id));
    setQueue(prev => [...prev.slice(1), prev[0]]);
    setResting(false);
  };

  const finishWorkout = useCallback(async () => {
    setPhase('done');
    const durationMinutes = workout?.is_activity_block ? activityDurationMin : Math.round(elapsed / 60);
    // Every set was already persisted as it was logged (markSetDone), so
    // finishing only needs to: save any per-exercise notes, then mark the
    // session complete and compute its completion percentage.
    if (userId && historyId && workoutId) {
      const cleanExerciseNotes = Object.fromEntries(
        Object.entries(exerciseNotes)
          .map(([exId, note]) => [exId, note.trim()])
          .filter(([, note]) => note.length > 0),
      );
      if (Object.keys(cleanExerciseNotes).length > 0) {
        await supabase.from('workout_history').update({ exercise_notes: cleanExerciseNotes }).eq('id', historyId);
      }
      const { completionPercentage } = await workoutExecutionService.completeWorkout(
        userId, historyId, workoutId as string, { actualDurationMinutes: durationMinutes },
      );
      setCompletionPct(completionPercentage);

      // Beta #010 — the workout is persisted; now move the CANONICAL plan state
      // (completion + Day 9 execution) so Home reflects it on next focus with no
      // separate confirm tap. Best-effort — never blocks the completion flow.
      if (planLink) {
        workoutExecutionService.linkPlanActivityCompletion({
          userId, planId: planLink.planId, activityIndex: planLink.activityIndex,
          plannedDate: planLink.plannedDate, historyId, completionPercentage, durationMinutes,
        }).catch(() => {});
      }

      // Beta #011 — assemble the deterministic session-summary inputs (strength
      // sessions only). Set logs come from the DB (getLoggedSets), not local
      // state, so the just-logged final set is never one render behind. The
      // user-facing text is derived reactively below so a later difficulty /
      // rating tap flows straight into it.
      if (workout && !workout.is_activity_block) {
        const exerciseIds = exercises.map(e => e.exercises.id);
        const [loggedSets, previousByExercise] = await Promise.all([
          workoutExecutionService.getLoggedSets(historyId).catch(() => [] as Awaited<ReturnType<typeof workoutExecutionService.getLoggedSets>>),
          workoutExecutionService.getPreviousExerciseSets(userId, historyId, exerciseIds).catch(() => ({} as Record<string, { reps: number | null; weightKg: number | null }[]>)),
        ]);
        const exInputs: SessionExerciseInput[] = exercises.map(we => {
          const exId = we.exercises.id;
          return {
            exerciseId: exId,
            name: we.exercises.name,
            plannedSets: we.sets,
            plannedReps: we.reps,
            loggedSets: loggedSets
              .filter(l => l.exerciseId === exId)
              .map(l => ({ setNumber: l.setNumber, reps: l.reps, weightKg: l.weightKg })),
            rating: exerciseRatings[exId] ?? null,
            note: exerciseNotes[exId]?.trim() || null,
            previousSets: previousByExercise[exId] ?? null,
          };
        });
        setSessionEvidenceInput({
          workoutTitle: workout.title,
          plannedExerciseCount: exercises.length,
          actualDurationMinutes: durationMinutes,
          completionPercentage,
          exercises: exInputs,
        });
      }
    }
  }, [elapsed, workoutId, exerciseNotes, userId, historyId, workout, activityDurationMin, planLink, exercises, exerciseRatings]);

  // Beta #011 — derive the summary text reactively so a difficulty / session-
  // rating tap on the done screen updates it immediately. Purely deterministic.
  useEffect(() => {
    if (!sessionEvidenceInput) { setSessionSummary(null); return; }
    const evidence = buildWorkoutSessionEvidence({
      ...sessionEvidenceInput,
      perceivedDifficulty,
      sessionRating: sessionRating || null,
    });
    setSessionSummary(summarizeWorkoutSession(evidence));
  }, [sessionEvidenceInput, perceivedDifficulty, sessionRating]);

  const chooseDifficulty = async (value: PerceivedDifficulty) => {
    if (!userId || !historyId) return;
    setPerceivedDifficulty(value);
    await workoutExecutionService.setPerceivedDifficulty(userId, historyId, value);
    if (planLink) {
      workoutExecutionService.setPlanActivityDifficulty({
        userId, planId: planLink.planId, activityIndex: planLink.activityIndex, perceived: value,
      }).catch(() => {});
    }
  };

  const handleSaveNote = async () => {
    if (!historyId || !sessionNote.trim()) return;
    setSavingNote(true);
    const { error } = await supabase
      .from('workout_history')
      .update({ notes: sessionNote.trim() })
      .eq('id', historyId);
    setSavingNote(false);
    if (!error) setNoteSaved(true);
  };

  const handleSkipRest = () => {
    setResting(false);
    cancelPendingRestNotification();
  };

  if (loading || !workout || (!workout.is_activity_block && exercises.length === 0)) {
    return <View style={s.center}><ThemedText style={{ color: DARK.textMuted }}>Loading…</ThemedText></View>;
  }

  // ── Activity block (Day 3) ── Run/Walk/Mobility/Recovery blocks have no
  // catalogue exercises at all — a simple duration + "mark done" flow rather
  // than pretending they're MuscleWiki exercises (section 12).
  if (workout.is_activity_block && phase !== 'done') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={s.headerSafe}>
            <View style={s.headerRow}>
              <TouchableOpacity
                style={s.quitBtn}
                onPress={() => Alert.alert('Quit workout?', 'Your progress so far has already been saved.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Quit', style: 'destructive', onPress: () => router.back() },
                ])}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color={DARK.text} />
              </TouchableOpacity>
              <View style={s.headerCenter}>
                <ThemedText style={s.headerTitle}>{workout.title}</ThemedText>
                <ThemedText style={s.headerTimer}>{formatTime(elapsed)}</ThemedText>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </SafeAreaView>
          <ScrollView contentContainerStyle={s.scrollContent}>
            <View style={s.exTitleWrap}>
              <ThemedText style={s.exName}>{workout.title}</ThemedText>
            </View>
            {workout.description ? <ThemedText style={{ fontSize: 15, color: DARK.textMuted, lineHeight: 21, marginBottom: 20 }}>{workout.description}</ThemedText> : null}
            <View style={s.logCard}>
              <ThemedText style={s.logLabel}>Actual duration</ThemedText>
              <View style={s.logRow}>
                <View style={s.logItem}>
                  <LogStepper value={activityDurationMin} min={0} max={240} step={5} suffix=" min" onChange={setActivityDurationMin} />
                </View>
              </View>
            </View>
          </ScrollView>
          <SafeAreaView edges={['bottom']} style={s.actions}>
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGrad]} onPress={finishWorkout} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={22} color={DARK.bg} />
              <ThemedText style={s.actionBtnText}>Mark as Done</ThemedText>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </>
    );
  }

  // ── Done screen ──────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={grad} style={s.doneRoot} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={s.doneScroll} keyboardShouldPersistTaps="handled">
              <View style={s.doneTrophy}>
                <Ionicons name="trophy" size={64} color="#FFD700" />
              </View>
              <ThemedText style={s.doneTitle}>Workout Complete!</ThemedText>
              <ThemedText style={s.doneSub}>{workout.title}</ThemedText>

              <View style={s.doneStats}>
                <View style={s.doneStat}>
                  <ThemedText style={s.doneStatVal}>{formatTime(elapsed)}</ThemedText>
                  <ThemedText style={s.doneStatLabel}>Duration</ThemedText>
                </View>
                <View style={s.doneStatDivider} />
                <View style={s.doneStat}>
                  <ThemedText style={s.doneStatVal}>{totalExercises}</ThemedText>
                  <ThemedText style={s.doneStatLabel}>Exercises</ThemedText>
                </View>
                <View style={s.doneStatDivider} />
                <View style={s.doneStat}>
                  <ThemedText style={s.doneStatVal}>
                    {Object.values(completedSets).reduce((a, b) => a + b, 0)}
                  </ThemedText>
                  <ThemedText style={s.doneStatLabel}>Sets</ThemedText>
                </View>
              </View>

              {completionPct != null ? (
                <ThemedText style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13.5, marginBottom: 20, textAlign: 'center' }}>
                  {completionPct}% of prescribed work completed
                </ThemedText>
              ) : null}

              {/* Beta #011 — grounded session summary. Deterministic: every line
                  is computed from this session's own evidence (no model). */}
              {sessionSummary ? (
                <View style={s.summaryCard}>
                  <ThemedText style={s.summaryLabel}>Session summary</ThemedText>
                  {sessionSummary.facts.map((f, i) => (
                    <View key={i} style={s.summaryRow}>
                      <View style={s.summaryDot} />
                      <ThemedText style={s.summaryFact}>{f}</ThemedText>
                    </View>
                  ))}
                  <ThemedText style={s.summaryCoaching}>{sessionSummary.coachingLine}</ThemedText>
                </View>
              ) : null}

              {historyId && !reopenedSummary ? (
                <View style={s.ratingCard}>
                  <ThemedText style={s.noteCardLabel}>How did that feel?</ThemedText>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {(['easy', 'about_right', 'difficult'] as PerceivedDifficulty[]).map(opt => (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => chooseDifficulty(opt)}
                        style={{
                          flex: 1, minHeight: 44, paddingHorizontal: 6, borderRadius: radii.lg,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: perceivedDifficulty === opt ? '#fff' : 'rgba(255,255,255,0.12)',
                        }}
                      >
                        <ThemedText style={{ fontSize: 12.5, fontWeight: '700', textAlign: 'center', color: perceivedDifficulty === opt ? palette.ink900 : '#fff' }}>
                          {opt === 'easy' ? 'Easy' : opt === 'about_right' ? 'About right' : 'Difficult'}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {historyId ? (
                <View style={s.ratingCard}>
                  <ThemedText style={s.noteCardLabel}>Rate this session</ThemedText>
                  <View style={s.ratingStarsRow}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <TouchableOpacity key={n} hitSlop={8} onPress={() => rateSession(n)}>
                        <Ionicons
                          name={sessionRating >= n ? 'star' : 'star-outline'}
                          size={30}
                          color="#FFD700"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {historyId ? (
                <View style={s.noteCard}>
                  <ThemedText style={s.noteCardLabel}>How did it feel?</ThemedText>
                  <TextInput
                    style={s.noteCardInput}
                    placeholder="Jot a note about this session..."
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    value={sessionNote}
                    onChangeText={text => { setSessionNote(text); setNoteSaved(false); }}
                    maxLength={280}
                    multiline
                  />
                  <TouchableOpacity
                    style={[s.noteSaveBtn, (!sessionNote.trim() || savingNote) && s.noteSaveBtnDisabled]}
                    onPress={handleSaveNote}
                    disabled={!sessionNote.trim() || savingNote}
                  >
                    <ThemedText style={s.noteSaveBtnText}>
                      {savingNote ? 'Saving…' : noteSaved ? 'Saved ✓' : 'Save Note'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Beta #010 — when launched from the plan, pop straight back to
                  Home so the user immediately sees the activity marked done /
                  the exercise ring updated (the Home focus-refresh re-reads the
                  now-persisted completion). */}
              <TouchableOpacity
                style={s.doneBtn}
                onPress={() => (planLink ? router.dismissAll() : router.replace('/fitness-journey'))}
                activeOpacity={0.85}
              >
                <ThemedText style={s.doneBtnText}>{planLink ? 'Done' : 'View My Journey'}</ThemedText>
                <Ionicons name="arrow-forward" size={18} color={palette.ink900} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.doneBtnGhost}
                onPress={() => router.replace((planLink ? '/fitness-journey' : '/workout-hub') as any)}
              >
                <ThemedText style={s.doneBtnGhostText}>{planLink ? 'View my progress' : 'Back to Workouts'}</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
          </SafeAreaView>
        </LinearGradient>
      </>
    );
  }

  const instructions = currentExercise.exercises.instructions ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        {/* Rest overlay */}
        {resting ? (
          <RestTimer seconds={restSecs} onSkip={handleSkipRest} onNaturalEnd={cancelPendingRestNotification} />
        ) : null}

        {/* ── Header ── */}
        <View style={s.header}>
          <SafeAreaView edges={['top']} style={s.headerSafe}>
            <View style={s.headerRow}>
              <TouchableOpacity
                style={s.quitBtn}
                onPress={() => Alert.alert('Quit workout?', 'Your progress will be lost.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Quit', style: 'destructive', onPress: () => { cancelPendingRestNotification(); router.back(); } },
                ])}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color={DARK.text} />
              </TouchableOpacity>

              <View style={s.headerCenter}>
                <ThemedText style={s.headerTitle}>{workout.title}</ThemedText>
                <ThemedText style={s.headerTimer}>{formatTime(elapsed)}</ThemedText>
              </View>

              <TouchableOpacity
                style={s.journeyBtn}
                onPress={() => router.push('/fitness-journey')}
                hitSlop={10}
              >
                <Ionicons name="stats-chart-outline" size={20} color={DARK.text} />
              </TouchableOpacity>
            </View>

            {/* Progress bar */}
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: DARK.accent }]} />
            </View>
            <ThemedText style={s.progressLabel}>
              {doneCount + 1} of {totalExercises}
            </ThemedText>
          </SafeAreaView>
        </View>

        {/* ── Exercise content ── */}
        <ScrollView ref={listRef} style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Exercise name & muscle */}
          <View style={s.exTitleWrap}>
            {wasSkipped ? (
              <View style={s.skippedBadge}>
                <Ionicons name="return-down-back-outline" size={12} color={palette.warning500} />
                <ThemedText style={s.skippedBadgeText}>Back to this one</ThemedText>
              </View>
            ) : null}
            <View style={s.exNameRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.exName}>{currentExercise.exercises.name}</ThemedText>
                {currentExercise.exercises.target_muscle ? (
                  <ThemedText style={s.exMuscle}>{currentExercise.exercises.target_muscle}</ThemedText>
                ) : null}
              </View>
              <TouchableOpacity
                hitSlop={10}
                onPress={() => toggleExerciseFavorite(currentExercise.exercises.id)}
                disabled={!userId}
              >
                <Ionicons
                  name={favoriteExerciseIds.has(currentExercise.exercises.id) ? 'heart' : 'heart-outline'}
                  size={24}
                  color={favoriteExerciseIds.has(currentExercise.exercises.id) ? palette.danger500 : DARK.textFaint}
                />
              </TouchableOpacity>
            </View>
            <View style={s.exRatingRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n} hitSlop={6} disabled={!userId}
                  onPress={() => rateExercise(currentExercise.exercises.id, n)}
                >
                  <Ionicons
                    name={(exerciseRatings[currentExercise.exercises.id] ?? 0) >= n ? 'star' : 'star-outline'}
                    size={16}
                    color={palette.warning500}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* GIF/video demonstration — real MuscleWiki media is video (ExerciseMedia resolves the short-lived token and picks the video/image renderer accordingly); the jsDelivr GIF fallback for historical/ExerciseDB-era exercises still renders as a static image. */}
          {currentExercise?.exercises.gif_url ? (
            <View style={s.gifWrap}>
              <ExerciseMedia url={currentExercise.exercises.gif_url} style={s.gif} />
            </View>
          ) : null}

          {/* Sets progress */}
          <View style={s.setsCard}>
            <ThemedText style={s.setsLabel}>Sets</ThemedText>
            <View style={s.setsDots}>
              {Array.from({ length: totalSets }).map((_, i) => (
                <View key={i} style={[s.setDot, i < doneSets && s.setDotDone]} />
              ))}
            </View>
            <ThemedText style={s.setsText}>
              {doneSets} / {totalSets} sets complete
              {currentExercise.reps ? ` · ${currentExercise.reps} reps each` : ''}
              {currentExercise.duration_seconds ? ` · ${currentExercise.duration_seconds}s each` : ''}
            </ThemedText>
          </View>

          {/* Log this set */}
          <View style={s.logCard}>
            <ThemedText style={s.logLabel}>Log Set {doneSets + 1}</ThemedText>
            <View style={s.logRow}>
              {!isBodyweight(currentExercise.exercises.equipment) && (
                <>
                  <View style={s.logItem}>
                    <ThemedText style={s.logItemLabel}>Weight</ThemedText>
                    <LogStepper value={logWeight} min={0} max={500} step={2.5} suffix="kg" onChange={setLogWeight} />
                  </View>
                  <View style={s.logDivider} />
                </>
              )}
              <View style={s.logItem}>
                <ThemedText style={s.logItemLabel}>Reps</ThemedText>
                <LogStepper value={logReps} min={1} max={50} step={1} onChange={setLogReps} />
              </View>
            </View>
          </View>

          {/* Equipment */}
          {currentExercise.exercises.equipment && currentExercise.exercises.equipment !== 'body weight' ? (
            <View style={s.equipRow}>
              <Ionicons name="barbell-outline" size={14} color={DARK.textMuted} />
              <ThemedText style={s.equipText}>{currentExercise.exercises.equipment}</ThemedText>
            </View>
          ) : null}

          {/* Trainer's note on this exercise */}
          {currentExercise.notes ? (
            <View style={s.noteWrap}>
              <Ionicons name="create-outline" size={14} color={DARK.accent} />
              <ThemedText style={s.noteText}>{currentExercise.notes}</ThemedText>
            </View>
          ) : null}

          {/* Your own note for this exercise */}
          {showNoteInput ? (
            <View style={s.myNoteWrap}>
              <ThemedText style={s.myNoteLabel}>Your note</ThemedText>
              <TextInput
                style={s.myNoteInput}
                placeholder="e.g. felt a pull in my shoulder, try lighter next time..."
                placeholderTextColor={DARK.textFaint}
                value={exerciseNotes[currentExercise.exercises.id] ?? ''}
                onChangeText={text => setExerciseNotes(prev => ({ ...prev, [currentExercise.exercises.id]: text }))}
                maxLength={200}
                multiline
              />
            </View>
          ) : (
            <TouchableOpacity style={s.addNoteBtn} onPress={() => setShowNoteInput(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={15} color={DARK.accent} />
              <ThemedText style={s.addNoteBtnText}>Add a note for this exercise</ThemedText>
            </TouchableOpacity>
          )}

          {/* Instructions */}
          {instructions.length > 0 ? (
            <View style={s.instructionsWrap}>
              <TouchableOpacity
                style={s.instructionsHeader}
                onPress={() => setShowInstructions(v => !v)}
                activeOpacity={0.7}
              >
                <ThemedText style={s.instructionsSectionTitle}>How to</ThemedText>
                <Ionicons
                  name={showInstructions ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={DARK.textFaint}
                />
              </TouchableOpacity>
              {showInstructions ? instructions.map((step, i) => (
                <View key={i} style={s.instructionRow}>
                  <View style={s.instructionNum}>
                    <ThemedText style={s.instructionNumText}>{i + 1}</ThemedText>
                  </View>
                  <ThemedText style={s.instructionText}>{step}</ThemedText>
                </View>
              )) : null}
            </View>
          ) : null}

          {/* Up next */}
          {nextExercise ? (
            <View style={s.upNext}>
              <ThemedText style={s.upNextLabel}>Up next</ThemedText>
              <ThemedText style={s.upNextName}>{nextExercise.exercises.name}</ThemedText>
            </View>
          ) : (
            <View style={s.upNext}>
              <ThemedText style={s.upNextLabel}>Last exercise!</ThemedText>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ── Action button ── */}
        <SafeAreaView edges={['bottom']} style={s.actions}>
          <TouchableOpacity style={[s.actionBtn, s.actionBtnGrad]} onPress={markSetDone} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle" size={22} color={DARK.bg} />
            <ThemedText style={s.actionBtnText}>
              {doneSets + 1 < totalSets
                ? `Done — Set ${doneSets + 1} of ${totalSets}`
                : nextExercise
                  ? 'Complete & Next Exercise'
                  : 'Finish Workout'
              }
            </ThemedText>
          </TouchableOpacity>

          {nextExercise ? (
            <TouchableOpacity
              style={s.skipExBtn}
              onPress={skipForNow}
            >
              <Ionicons name="return-down-forward-outline" size={14} color={DARK.textMuted} />
              <ThemedText style={s.skipExText}>Equipment in use — skip for now</ThemedText>
            </TouchableOpacity>
          ) : null}
        </SafeAreaView>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },

  // Header
  header: {
    backgroundColor: DARK.bg,
    borderBottomWidth: 1, borderBottomColor: DARK.border,
  },
  headerSafe: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 14 },
  quitBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: DARK.cardAlt, alignItems: 'center', justifyContent: 'center' },
  journeyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: DARK.cardAlt, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: DARK.text },
  headerTimer: { fontSize: 22, fontWeight: '900', color: DARK.text, letterSpacing: -0.5, marginTop: 2 },
  progressTrack: { height: 5, backgroundColor: DARK.cardAlt, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 5, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: DARK.textMuted, textAlign: 'center' },

  // Content
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  exTitleWrap: { marginBottom: 20 },
  skippedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: DARK.cardAlt, borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10,
  },
  skippedBadgeText: { fontSize: 11.5, fontWeight: '700', color: palette.warning500 },
  exNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: DARK.text },
  exMuscle: { fontSize: 14, color: DARK.textMuted, marginTop: 4 },
  exRatingRow: { flexDirection: 'row', gap: 4, marginTop: 8 },

  gifWrap: {
    marginBottom: 16, borderRadius: radii.xl, overflow: 'hidden',
    backgroundColor: DARK.card, alignItems: 'center',
  },
  gif: {
    width: GIF_SIZE, height: GIF_SIZE,
  },

  // Sets card
  setsCard: {
    backgroundColor: DARK.card, borderRadius: radii.lg,
    borderWidth: 1, borderColor: DARK.border,
    padding: 16, marginBottom: 16,
  },
  setsLabel: { fontSize: 11, fontWeight: '700', color: DARK.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  setsDots: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  setDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: DARK.cardAlt, borderWidth: 1.5, borderColor: DARK.border },
  setDotDone: { backgroundColor: DARK.accent, borderColor: DARK.accent },
  setsText: { fontSize: 14, fontWeight: '600', color: DARK.textMuted },

  logCard: {
    backgroundColor: DARK.card, borderRadius: radii.lg,
    borderWidth: 1, borderColor: DARK.border,
    padding: 12, marginBottom: 16,
  },
  logLabel: { fontSize: 11, fontWeight: '700', color: DARK.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  logRow: { flexDirection: 'row', alignItems: 'center' },
  logItem: { flex: 1, alignItems: 'center', gap: 4 },
  logItemLabel: { fontSize: 12, fontWeight: '700', color: DARK.textMuted },
  logDivider: { width: 1, height: 28, backgroundColor: DARK.border },

  equipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  equipText: { fontSize: 13, fontWeight: '500', color: DARK.textMuted },

  noteWrap: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: DARK.card, borderRadius: radii.md,
    padding: 12, marginBottom: 16,
  },
  noteText: { flex: 1, fontSize: 13.5, color: DARK.text, lineHeight: 18, fontStyle: 'italic' },

  myNoteWrap: {
    backgroundColor: DARK.card, borderRadius: radii.md,
    borderWidth: 1, borderColor: DARK.border,
    padding: 12, marginBottom: 16,
  },
  myNoteLabel: {
    fontSize: 11, fontWeight: '700', color: DARK.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  myNoteInput: { fontSize: 13.5, color: DARK.text, lineHeight: 18, minHeight: 36, padding: 0 },
  addNoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, marginBottom: 16,
  },
  addNoteBtnText: { fontSize: 13, fontWeight: '600', color: DARK.accent },

  // Instructions
  instructionsWrap: { backgroundColor: DARK.card, borderRadius: radii.lg, padding: 16, marginBottom: 16, gap: 10 },
  instructionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  instructionsSectionTitle: { fontSize: 12, fontWeight: '700', color: DARK.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  instructionRow: { flexDirection: 'row', gap: 10 },
  instructionNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: DARK.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  instructionNumText: { fontSize: 10, fontWeight: '800', color: DARK.bg },
  instructionText: { flex: 1, fontSize: 14, color: DARK.text, lineHeight: 20 },

  // Up next
  upNext: { backgroundColor: DARK.card, borderRadius: radii.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: DARK.border },
  upNextLabel: { fontSize: 11, fontWeight: '700', color: DARK.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  upNextName: { fontSize: 15, fontWeight: '700', color: DARK.text },

  // Actions
  actions: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
    backgroundColor: DARK.bg, borderTopWidth: 1, borderTopColor: DARK.border,
    gap: 8,
  },
  actionBtn: { borderRadius: radii.xl, overflow: 'hidden' },
  actionBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, backgroundColor: DARK.accent },
  actionBtnText: { fontSize: 17, fontWeight: '800', color: DARK.bg },
  skipExBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  skipExText: { fontSize: 13.5, fontWeight: '600', color: DARK.textMuted },

  // Done screen
  doneRoot: { flex: 1 },
  doneScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  ratingCard: {
    alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radii.xl, padding: 18, marginBottom: 16, alignItems: 'center', gap: 10,
  },
  ratingStarsRow: { flexDirection: 'row', gap: 8 },

  noteCard: {
    alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radii.xl, padding: 18, marginBottom: 20, gap: 10,
  },

  // Beta #011 — session summary card
  summaryCard: {
    alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radii.xl, padding: 18, marginBottom: 16, gap: 8,
  },
  summaryLabel: {
    fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2,
  },
  summaryRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  summaryDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)', marginTop: 7 },
  summaryFact: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 18 },
  summaryCoaching: {
    fontSize: 13, color: '#fff', lineHeight: 19, marginTop: 6,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)',
  },
  noteCardLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  noteCardInput: {
    fontSize: 14, color: '#fff', lineHeight: 19, minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radii.md, padding: 12,
  },
  noteSaveBtn: {
    alignSelf: 'flex-end', backgroundColor: '#fff',
    borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 9,
  },
  noteSaveBtnDisabled: { opacity: 0.4 },
  noteSaveBtnText: { fontSize: 13, fontWeight: '700', color: palette.ink900 },
  doneTrophy: { marginBottom: 20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.6, marginBottom: 8, textAlign: 'center' },
  doneSub: { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 32, textAlign: 'center' },
  doneStats: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radii.xl, padding: 20, marginBottom: 32, gap: 4, alignSelf: 'stretch',
  },
  doneStat: { flex: 1, alignItems: 'center' },
  doneStatVal: { fontSize: 26, fontWeight: '900', color: '#fff' },
  doneStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  doneStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  doneBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: radii.xl,
    paddingHorizontal: 28, paddingVertical: 16, marginBottom: 12, alignSelf: 'stretch', justifyContent: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: palette.ink900 },
  doneBtnGhost: { paddingVertical: 10 },
  doneBtnGhostText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
});

import {
  StyleSheet, View, TouchableOpacity, Alert,
  ScrollView, Dimensions, Image, TextInput,
  KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ensureNotificationPermission, scheduleRestEndNotification, cancelNotification,
} from '@/services/notifications';

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

function isBodyweight(equipment: string | null): boolean {
  return (equipment ?? '').trim().toLowerCase() === 'body weight';
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
        <Ionicons name="remove" size={16} color={value <= min ? palette.gray300 : palette.ink900} />
      </TouchableOpacity>
      <ThemedText style={l.stepVal}>{value}{suffix}</ThemedText>
      <TouchableOpacity
        style={[l.stepBtn, value >= max && l.stepBtnDisabled]}
        onPress={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
        disabled={value >= max} hitSlop={10}
      >
        <Ionicons name="add" size={16} color={value >= max ? palette.gray300 : palette.ink900} />
      </TouchableOpacity>
    </View>
  );
}

const l = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border,
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepVal: { fontSize: 16, fontWeight: '800', color: palette.ink900, minWidth: 56, textAlign: 'center' },
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  box: { backgroundColor: palette.ink900, borderRadius: radii.xl, padding: 36, alignItems: 'center', width: 260 },
  label: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: 8 },
  count: { fontSize: 64, fontWeight: '900', color: '#fff', letterSpacing: -2, paddingTop: 40 },
  quote: { fontSize: 13.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 14, lineHeight: 18 },
  skipBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  skipText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ── Main player ────────────────────────────────────────────────────────────────

export default function WorkoutPlayerScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
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
        supabase.from('workouts').select('id, title, category, duration_minutes').eq('id', workoutId).single(),
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
      setWorkout(wRes.data as Workout ?? null);
      setExercises(loadedExercises);
      setQueue(loadedExercises);
      setFavoriteExerciseIds(new Set(((favRes.data as any[]) ?? []).map(r => r.exercise_id)));
      setExerciseRatings(Object.fromEntries(((ratingRes.data as any[]) ?? []).map(r => [r.exercise_id, r.rating])));
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
    setCompletedSets(prev => ({ ...prev, [currentExercise.id]: newDone }));
    setSetLogs(prev => [...prev, {
      exerciseId: currentExercise.exercises.id,
      setNumber: newDone,
      weightKg: bodyweight ? null : (logWeight > 0 ? logWeight : null),
      reps: logReps,
      restSecondsActual,
    }]);

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
    const durationMinutes = Math.round(elapsed / 60);
    const session = await authService.getSession();
    if (session?.user.id && workoutId) {
      const cleanExerciseNotes = Object.fromEntries(
        Object.entries(exerciseNotes)
          .map(([exId, note]) => [exId, note.trim()])
          .filter(([, note]) => note.length > 0),
      );
      const { data: history } = await supabase
        .from('workout_history')
        .insert({
          user_id: session.user.id,
          workout_id: workoutId,
          duration_minutes: durationMinutes,
          exercise_notes: cleanExerciseNotes,
        })
        .select('id')
        .single();

      if (history) {
        setHistoryId(history.id);

        if (setLogs.length > 0) {
          await supabase.from('workout_set_logs').insert(
            setLogs.map(log => ({
              user_id: session.user.id,
              workout_history_id: history.id,
              exercise_id: log.exerciseId,
              set_number: log.setNumber,
              weight_kg: log.weightKg,
              reps: log.reps,
              rest_seconds_actual: log.restSecondsActual,
            })),
          );
        }
      }
    }
  }, [elapsed, workoutId, setLogs, exerciseNotes]);

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

  if (loading || !workout || exercises.length === 0) {
    return <View style={s.center}><ThemedText style={{ color: palette.gray450 }}>Loading…</ThemedText></View>;
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

              <TouchableOpacity
                style={s.doneBtn}
                onPress={() => router.replace('/fitness-journey')}
                activeOpacity={0.85}
              >
                <ThemedText style={s.doneBtnText}>View My Journey</ThemedText>
                <Ionicons name="arrow-forward" size={18} color={palette.ink900} />
              </TouchableOpacity>
              <TouchableOpacity style={s.doneBtnGhost} onPress={() => router.replace('/(tabs)/fitness')}>
                <ThemedText style={s.doneBtnGhostText}>Back to Workouts</ThemedText>
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
                <Ionicons name="close" size={20} color={palette.ink900} />
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
                <Ionicons name="stats-chart-outline" size={20} color={palette.ink900} />
              </TouchableOpacity>
            </View>

            {/* Progress bar */}
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: grad[0] }]} />
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
                <Ionicons name="return-down-back-outline" size={12} color={palette.warning800} />
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
                  color={favoriteExerciseIds.has(currentExercise.exercises.id) ? palette.danger500 : palette.gray300}
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

          {/* GIF demonstration */}
          {currentExercise.exercises.gif_url ? (
            <View style={s.gifWrap}>
              <Image
                source={{ uri: currentExercise.exercises.gif_url }}
                style={s.gif}
                resizeMode="contain"
              />
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
              <Ionicons name="barbell-outline" size={14} color={palette.gray450} />
              <ThemedText style={s.equipText}>{currentExercise.exercises.equipment}</ThemedText>
            </View>
          ) : null}

          {/* Trainer's note on this exercise */}
          {currentExercise.notes ? (
            <View style={s.noteWrap}>
              <Ionicons name="create-outline" size={14} color={palette.blue500} />
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
                placeholderTextColor={palette.gray300}
                value={exerciseNotes[currentExercise.exercises.id] ?? ''}
                onChangeText={text => setExerciseNotes(prev => ({ ...prev, [currentExercise.exercises.id]: text }))}
                maxLength={200}
                multiline
              />
            </View>
          ) : (
            <TouchableOpacity style={s.addNoteBtn} onPress={() => setShowNoteInput(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={15} color={palette.blue500} />
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
                  color={palette.gray300}
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
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
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
              <Ionicons name="return-down-forward-outline" size={14} color={palette.gray450} />
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
  root: { flex: 1, backgroundColor: palette.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  headerSafe: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 14 },
  quitBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  journeyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: palette.ink900 },
  headerTimer: { fontSize: 22, fontWeight: '900', color: palette.ink900, letterSpacing: -0.5, marginTop: 2 },
  progressTrack: { height: 5, backgroundColor: palette.hairline, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 5, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: palette.gray450, textAlign: 'center' },

  // Content
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  exTitleWrap: { marginBottom: 20 },
  skippedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: palette.warning50, borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10,
  },
  skippedBadgeText: { fontSize: 11.5, fontWeight: '700', color: palette.warning800 },
  exNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: palette.ink900 },
  exMuscle: { fontSize: 14, color: palette.gray450, marginTop: 4 },
  exRatingRow: { flexDirection: 'row', gap: 4, marginTop: 8 },

  gifWrap: {
    marginBottom: 16, borderRadius: radii.xl, overflow: 'hidden',
    backgroundColor: palette.white, alignItems: 'center',
  },
  gif: {
    width: GIF_SIZE, height: GIF_SIZE,
  },

  // Sets card
  setsCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 16,
  },
  setsLabel: { fontSize: 11, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  setsDots: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  setDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: palette.border, borderWidth: 1.5, borderColor: palette.gray300 },
  setDotDone: { backgroundColor: palette.success700, borderColor: palette.success700 },
  setsText: { fontSize: 14, fontWeight: '600', color: palette.gray450 },

  logCard: {
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 16,
  },
  logLabel: { fontSize: 11, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  logRow: { flexDirection: 'row', alignItems: 'center' },
  logItem: { flex: 1, alignItems: 'center', gap: 8 },
  logItemLabel: { fontSize: 12, fontWeight: '700', color: palette.gray450 },
  logDivider: { width: 1, height: 40, backgroundColor: palette.hairline },

  equipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  equipText: { fontSize: 13, fontWeight: '500', color: palette.gray450 },

  noteWrap: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: palette.blue25, borderRadius: radii.md,
    padding: 12, marginBottom: 16,
  },
  noteText: { flex: 1, fontSize: 13.5, color: palette.ink700, lineHeight: 18, fontStyle: 'italic' },

  myNoteWrap: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 12, marginBottom: 16,
  },
  myNoteLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  myNoteInput: { fontSize: 13.5, color: palette.ink900, lineHeight: 18, minHeight: 36, padding: 0 },
  addNoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, marginBottom: 16,
  },
  addNoteBtnText: { fontSize: 13, fontWeight: '600', color: palette.blue500 },

  // Instructions
  instructionsWrap: { backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 16, marginBottom: 16, gap: 10 },
  instructionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  instructionsSectionTitle: { fontSize: 12, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },
  instructionRow: { flexDirection: 'row', gap: 10 },
  instructionNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.blue500, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  instructionNumText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  instructionText: { flex: 1, fontSize: 14, color: palette.ink700, lineHeight: 20 },

  // Up next
  upNext: { backgroundColor: palette.blue25, borderRadius: radii.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#d4dcff' },
  upNextLabel: { fontSize: 11, fontWeight: '700', color: palette.blue500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  upNextName: { fontSize: 15, fontWeight: '700', color: palette.ink900 },

  // Actions
  actions: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
    backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.hairline,
    gap: 8,
  },
  actionBtn: { borderRadius: radii.xl, overflow: 'hidden' },
  actionBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, backgroundColor: palette.ink900 },
  actionBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  skipExBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  skipExText: { fontSize: 13.5, fontWeight: '600', color: palette.gray450 },

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

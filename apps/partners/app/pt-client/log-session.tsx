// Lets a trainer log an in-person session on the client's behalf: either
// completing a workout they already assigned (with real numbers) or a fully
// freeform ad-hoc session with no pre-made workout. Exercise-picker/thumbnail
// helpers are duplicated from assign-workout.tsx rather than shared — this
// monorepo has no shared package between apps/screens, and per-file
// duplication is this codebase's established convention.
import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchExercisesByBodyPart, type ExerciseDBExercise } from '../../services/exercisedb';

const palette = {
  ink900: '#000000', ink700: '#333333', gray450: '#6b7280', gray300: '#9ca3af',
  white: '#ffffff', hairline: '#f0f0f0', border: '#e5e7eb', surfaceMuted: '#f9fafb',
  blue500: '#1d3cb0', blue25: '#f0f5ff',
  success50: '#f0fdf4', success700: '#16a34a',
  danger600: '#dc2626', warning500: '#f59e0b',
};
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 100 };

const GIF_BASE = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main';
const TARGET_TO_FOLDER: Record<string, string> = {
  pectorals: 'pectorals', lats: 'lats', 'upper back': 'upper-back',
  delts: 'delts', biceps: 'biceps', triceps: 'triceps',
  abs: 'abs', abdominals: 'abs', glutes: 'glutes',
  quads: 'quads', quadriceps: 'quads', hamstrings: 'hamstrings',
  calves: 'calves', gastrocnemius: 'calves', forearms: 'forearms',
  traps: 'traps', 'cardiovascular system': 'cardio',
  spine: 'spine', adductors: 'adductors', abductors: 'abductors',
  'serratus anterior': 'serratus-anterior',
};
function getGifUrl(name: string, target: string): string | null {
  const folder = TARGET_TO_FOLDER[target?.toLowerCase()];
  if (!folder) return null;
  const slug = name.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
  return `${GIF_BASE}/${folder}/${slug}.gif`;
}

const BODY_PARTS = [
  { key: 'chest',      label: 'Chest',    icon: 'fitness-outline'   },
  { key: 'back',       label: 'Back',     icon: 'body-outline'      },
  { key: 'shoulders',  label: 'Shoulders',icon: 'barbell-outline'   },
  { key: 'upper arms', label: 'Arms',     icon: 'barbell-outline'   },
  { key: 'upper legs', label: 'Quads',    icon: 'walk-outline'      },
  { key: 'lower legs', label: 'Calves',   icon: 'footsteps-outline' },
  { key: 'waist',      label: 'Core',     icon: 'shield-outline'    },
  { key: 'cardio',     label: 'Cardio',   icon: 'heart-outline'     },
  { key: 'lower arms', label: 'Forearms', icon: 'hand-left-outline' },
] as const;

const EQUIPMENT_ICON: Record<string, string> = {
  'body weight': 'body-outline', dumbbell: 'barbell-outline',
  barbell: 'barbell-outline', cable: 'git-branch-outline',
  'leverage machine': 'cog-outline', band: 'link-outline',
  kettlebell: 'barbell-outline', 'smith machine': 'barbell-outline',
};

function ExerciseThumb({ gifUrl, icon, size = 44 }: { gifUrl: string | null; icon: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!gifUrl || failed) {
    return (
      <View style={[thumbStyles.fallback, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Ionicons name={icon as any} size={size * 0.45} color={palette.ink900} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: gifUrl }}
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: palette.surfaceMuted }}
      contentFit="cover"
      onError={() => setFailed(true)}
      transition={150}
    />
  );
}
const thumbStyles = StyleSheet.create({
  fallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

function Stepper({
  value, min, max, onDecrement, onIncrement, suffix = '',
}: { value: number; min: number; max: number; onDecrement: () => void; onIncrement: () => void; suffix?: string }) {
  return (
    <View style={s.stepper}>
      <TouchableOpacity style={[s.stepBtn, value <= min && s.stepBtnDisabled]} onPress={onDecrement} disabled={value <= min} hitSlop={10}>
        <Ionicons name="remove" size={15} color={value <= min ? palette.gray300 : palette.ink900} />
      </TouchableOpacity>
      <ThemedText style={s.stepVal}>{value}{suffix}</ThemedText>
      <TouchableOpacity style={[s.stepBtn, value >= max && s.stepBtnDisabled]} onPress={onIncrement} disabled={value >= max} hitSlop={10}>
        <Ionicons name="add" size={15} color={value >= max ? palette.gray300 : palette.ink900} />
      </TouchableOpacity>
    </View>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface SetEntry { setNumber: number; weightKg: number | null; reps: number; }

interface SessionExercise {
  key: string;
  exerciseId: string | null;   // resolved exercises.id — null for a New Session exercise until save
  externalId: string;          // ExerciseDB id, used to dedupe the picker
  name: string; target: string; bodyPart: string; equipment: string;
  difficulty: string; instructions: string[]; gifUrl: string | null;
  sets: SetEntry[];
}

interface AssignedWorkout { id: string; title: string; }

// ── Exercise picker modal (trimmed — no AI generator, this is for logging what already happened) ──

function ExercisePicker({
  visible, addedIds, onClose, onAdd,
}: { visible: boolean; addedIds: Set<string>; onClose: () => void; onAdd: (ex: ExerciseDBExercise) => void }) {
  const [bodyPart, setBodyPart] = useState<string>('chest');
  const [exercises, setExercises] = useState<ExerciseDBExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bp: string) => {
    setLoading(true); setError(null); setExercises([]);
    try {
      setExercises(await fetchExercisesByBodyPart(bp, 20, 0));
    } catch (e: any) {
      setError(e.message ?? 'Could not load exercises');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (visible) load(bodyPart); }, [visible, bodyPart]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ps.root}>
        <SafeAreaView edges={['top']} style={ps.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={ps.closeBtn}>
            <Ionicons name="close" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={ps.headerTitle}>Add Exercise</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ps.bpRail} style={ps.bpScroll}>
          {BODY_PARTS.map(bp => (
            <TouchableOpacity
              key={bp.key}
              style={[ps.bpChip, bodyPart === bp.key && ps.bpChipActive]}
              onPress={() => setBodyPart(bp.key)}
              activeOpacity={0.75}
            >
              <Ionicons name={bp.icon as any} size={14} color={bodyPart === bp.key ? '#fff' : palette.gray450} />
              <ThemedText style={[ps.bpChipText, bodyPart === bp.key && ps.bpChipTextActive]}>{bp.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={ps.errorWrap}>
            <ThemedText style={ps.errorText}>{error}</ThemedText>
            <TouchableOpacity style={ps.retryBtn} onPress={() => load(bodyPart)}>
              <ThemedText style={ps.retryText}>Try again</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={ex => ex.id}
            contentContainerStyle={ps.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={<ThemedText style={ps.resultLabel}>{exercises.length} exercises · tap to add</ThemedText>}
            renderItem={({ item: ex }) => {
              const already = addedIds.has(ex.id);
              const equipIcon = EQUIPMENT_ICON[ex.equipment] ?? 'barbell-outline';
              const gifUrl = getGifUrl(ex.name, ex.target);
              return (
                <TouchableOpacity
                  style={[ps.exRow, already && ps.exRowAdded]}
                  onPress={() => { if (!already) onAdd(ex); }}
                  activeOpacity={already ? 1 : 0.75}
                >
                  <ExerciseThumb gifUrl={gifUrl} icon={equipIcon} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={ps.exName} numberOfLines={2}>{ex.name}</ThemedText>
                    <ThemedText style={ps.exTarget}>{ex.target} · {ex.equipment}</ThemedText>
                  </View>
                  {already ? (
                    <View style={ps.addedBadge}>
                      <Ionicons name="checkmark" size={14} color={palette.success700} />
                      <ThemedText style={ps.addedText}>Added</ThemedText>
                    </View>
                  ) : (
                    <View style={ps.addBtn}><Ionicons name="add" size={18} color={palette.blue500} /></View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={<View style={{ height: 60 }} />}
          />
        )}

        {addedIds.size > 0 && (
          <SafeAreaView edges={['bottom']} style={ps.ctaBar}>
            <TouchableOpacity style={ps.ctaBtn} onPress={onClose} activeOpacity={0.85}>
              <ThemedText style={ps.ctaBtnText}>Add {addedIds.size} {addedIds.size === 1 ? 'Exercise' : 'Exercises'}</ThemedText>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

// ── Per-exercise set-logging card ───────────────────────────────────────────────

function SessionExerciseCard({
  exercise, onAddSet, onRemoveSet, onRemoveExercise,
}: {
  exercise: SessionExercise;
  onAddSet: (weightKg: number | null, reps: number) => void;
  onRemoveSet: (setNumber: number) => void;
  onRemoveExercise: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(10);

  return (
    <View style={s.entryCard}>
      <View style={s.entryTop}>
        <ExerciseThumb gifUrl={exercise.gifUrl} icon={EQUIPMENT_ICON[exercise.equipment] ?? 'barbell-outline'} size={48} />
        <View style={{ flex: 1 }}>
          <ThemedText style={s.entryName} numberOfLines={2}>{exercise.name}</ThemedText>
          <ThemedText style={s.entryTarget}>{exercise.target} · {exercise.equipment}</ThemedText>
        </View>
        <TouchableOpacity onPress={onRemoveExercise} hitSlop={8} style={s.removeBtn}>
          <Ionicons name="trash-outline" size={15} color={palette.danger600} />
        </TouchableOpacity>
      </View>

      {exercise.sets.length > 0 && (
        <View style={s.setsList}>
          {exercise.sets.map(set => (
            <View key={set.setNumber} style={s.setRow}>
              <ThemedText style={s.setLabel}>Set {set.setNumber}</ThemedText>
              <ThemedText style={s.setValue}>
                {set.weightKg != null ? `${set.weightKg}kg × ` : ''}{set.reps} reps
              </ThemedText>
              <TouchableOpacity onPress={() => onRemoveSet(set.setNumber)} hitSlop={8}>
                <Ionicons name="close" size={15} color={palette.gray300} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {adding ? (
        <View style={s.addSetRow}>
          <View style={s.controlItem}>
            <ThemedText style={s.controlLabel}>Weight</ThemedText>
            <Stepper value={weight} min={0} max={500} suffix="kg"
              onDecrement={() => setWeight(w => Math.max(0, w - 2.5))}
              onIncrement={() => setWeight(w => Math.min(500, w + 2.5))} />
          </View>
          <View style={s.controlDivider} />
          <View style={s.controlItem}>
            <ThemedText style={s.controlLabel}>Reps</ThemedText>
            <Stepper value={reps} min={1} max={50}
              onDecrement={() => setReps(r => Math.max(1, r - 1))}
              onIncrement={() => setReps(r => Math.min(50, r + 1))} />
          </View>
          <TouchableOpacity
            style={s.confirmSetBtn}
            onPress={() => { onAddSet(weight > 0 ? weight : null, reps); setAdding(false); }}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.addSetBtn} onPress={() => setAdding(true)} activeOpacity={0.7}>
          <Ionicons name="add" size={16} color={palette.blue500} />
          <ThemedText style={s.addSetBtnText}>Add Set</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function LogSessionScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  return <LogSessionForm key={clientId} />;
}

function LogSessionForm() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  const [mode, setMode] = useState<'assigned' | 'new'>('assigned');
  const [name, setName] = useState(`Session — ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`);

  const [assignedWorkouts, setAssignedWorkouts] = useState<AssignedWorkout[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [loadingExercises, setLoadingExercises] = useState(false);

  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const addedIds = new Set(exercises.map(e => e.externalId));

  useEffect(() => {
    (async () => {
      setLoadingWorkouts(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingWorkouts(false); return; }
      const { data: pt } = await supabase.from('personal_trainers').select('id').eq('user_id', user.id).single();
      if (!pt) { setLoadingWorkouts(false); return; }
      const { data } = await supabase
        .from('workouts')
        .select('id, title')
        .eq('user_id', clientId)
        .eq('assigned_by', pt.id)
        .order('created_at', { ascending: false });
      setAssignedWorkouts((data as any) ?? []);
      setLoadingWorkouts(false);
    })();
  }, [clientId]);

  const selectAssignedWorkout = async (workoutId: string) => {
    setSelectedWorkoutId(workoutId);
    setLoadingExercises(true);
    const { data } = await supabase
      .from('workout_exercises')
      .select('sets, reps, exercises(id, name, target_muscle, body_part, equipment, difficulty, instructions, gif_url, external_id)')
      .eq('workout_id', workoutId)
      .order('sort_order', { ascending: true });

    const mapped: SessionExercise[] = ((data as any) ?? []).map((row: any) => ({
      key: row.exercises.id,
      exerciseId: row.exercises.id,
      externalId: row.exercises.external_id,
      name: row.exercises.name,
      target: row.exercises.target_muscle,
      bodyPart: row.exercises.body_part,
      equipment: row.exercises.equipment,
      difficulty: row.exercises.difficulty,
      instructions: row.exercises.instructions ?? [],
      gifUrl: row.exercises.gif_url,
      sets: [],
    }));
    setExercises(mapped);
    setLoadingExercises(false);
  };

  const handleAddExercise = (ex: ExerciseDBExercise) => {
    const entry: SessionExercise = {
      key: `${Date.now()}-${Math.random()}`,
      exerciseId: null,
      externalId: ex.id,
      name: ex.name, target: ex.target, bodyPart: ex.bodyPart,
      equipment: ex.equipment, difficulty: ex.difficulty,
      instructions: ex.instructions ?? [],
      gifUrl: getGifUrl(ex.name, ex.target),
      sets: [],
    };
    setExercises(prev => [...prev, entry]);
  };

  const addSet = (key: string, weightKg: number | null, reps: number) => {
    setExercises(prev => prev.map(e => e.key === key
      ? { ...e, sets: [...e.sets, { setNumber: e.sets.length + 1, weightKg, reps }] }
      : e));
  };
  const removeSet = (key: string, setNumber: number) => {
    setExercises(prev => prev.map(e => e.key === key
      ? { ...e, sets: e.sets.filter(s => s.setNumber !== setNumber).map((s, i) => ({ ...s, setNumber: i + 1 })) }
      : e));
  };
  const removeExercise = (key: string) => setExercises(prev => prev.filter(e => e.key !== key));

  const totalSetsLogged = exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const canSave = totalSetsLogged > 0 && (mode === 'assigned' ? !!selectedWorkoutId : name.trim().length > 0);

  const handleFinish = async () => {
    if (!canSave || !clientId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Sign in required'); setSaving(false); return; }
      const { data: pt } = await supabase.from('personal_trainers').select('id').eq('user_id', user.id).single();
      if (!pt) { Alert.alert('Error', 'Trainer profile not found.'); setSaving(false); return; }

      let workoutId = selectedWorkoutId;

      if (mode === 'new') {
        const { data: workout, error: wErr } = await supabase
          .from('workouts')
          .insert({
            title: name.trim(), category: 'full_body', location_type: 'gym',
            difficulty: 'intermediate', duration_minutes: Math.max(10, totalSetsLogged * 3),
            is_active: true, user_id: clientId, assigned_by: pt.id,
          })
          .select('id').single();
        if (wErr || !workout) { Alert.alert('Error', wErr?.message ?? 'Failed to save session.'); setSaving(false); return; }
        workoutId = workout.id;

        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          const { data: exRow } = await supabase
            .from('exercises')
            .upsert({
              name: ex.name, body_part: ex.bodyPart, target_muscle: ex.target,
              equipment: ex.equipment, difficulty: ex.difficulty,
              instructions: ex.instructions, gif_url: ex.gifUrl,
              external_id: ex.externalId, source: 'ExerciseDB',
            }, { onConflict: 'external_id' })
            .select('id').single();
          if (!exRow) continue;
          ex.exerciseId = exRow.id;
          await supabase.from('workout_exercises').insert({
            workout_id: workoutId, exercise_id: exRow.id, sort_order: i + 1,
            sets: ex.sets.length || 1, reps: ex.sets[0]?.reps ?? 10, rest_seconds: 60,
          });
        }
      }

      const durationMinutes = Math.max(10, Math.round(totalSetsLogged * 2.5));
      const { data: history, error: hErr } = await supabase
        .from('workout_history')
        .insert({
          user_id: clientId, workout_id: workoutId, duration_minutes: durationMinutes,
          rating: rating > 0 ? rating : null, notes: note.trim() || null,
          logged_by_pt_id: pt.id,
        })
        .select('id').single();
      if (hErr || !history) { Alert.alert('Error', hErr?.message ?? 'Failed to log session.'); setSaving(false); return; }

      const setLogRows = exercises.flatMap(ex => ex.sets.map(set => ({
        user_id: clientId, workout_history_id: history.id,
        exercise_id: ex.exerciseId, set_number: set.setNumber,
        weight_kg: set.weightKg, reps: set.reps, logged_by_pt_id: pt.id,
      })));
      if (setLogRows.length > 0) await supabase.from('workout_set_logs').insert(setLogRows);

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ExercisePicker
        visible={pickerOpen}
        addedIds={new Set(addedIds)}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercise}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={palette.ink900} />
            </TouchableOpacity>
            <ThemedText style={s.headerTitle}>Log Session</ThemedText>
            <TouchableOpacity
              style={[s.saveBtn, (!canSave || saving) && s.saveBtnDisabled]}
              onPress={handleFinish}
              disabled={!canSave || saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={s.saveBtnText}>Finish</ThemedText>}
            </TouchableOpacity>
          </SafeAreaView>

          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.togglePill, mode === 'assigned' && s.togglePillActive]}
                onPress={() => setMode('assigned')}
              >
                <ThemedText style={[s.toggleText, mode === 'assigned' && s.toggleTextActive]}>Assigned Workout</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.togglePill, mode === 'new' && s.togglePillActive]}
                onPress={() => setMode('new')}
              >
                <ThemedText style={[s.toggleText, mode === 'new' && s.toggleTextActive]}>New Session</ThemedText>
              </TouchableOpacity>
            </View>

            {mode === 'assigned' ? (
              loadingWorkouts ? (
                <ActivityIndicator color={palette.blue500} style={{ marginTop: 20 }} />
              ) : assignedWorkouts.length === 0 ? (
                <ThemedText style={s.emptyText}>No workouts assigned to this client yet.</ThemedText>
              ) : (
                <View style={{ marginBottom: 20 }}>
                  {assignedWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[s.workoutPickRow, selectedWorkoutId === w.id && s.workoutPickRowActive]}
                      onPress={() => selectAssignedWorkout(w.id)}
                    >
                      <ThemedText style={[s.workoutPickText, selectedWorkoutId === w.id && s.workoutPickTextActive]}>{w.title}</ThemedText>
                      {selectedWorkoutId === w.id && <Ionicons name="checkmark-circle" size={18} color={palette.blue500} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )
            ) : (
              <TextInput
                style={s.nameInput}
                placeholder="Session name..."
                placeholderTextColor={palette.gray300}
                value={name}
                onChangeText={setName}
                maxLength={60}
              />
            )}

            {loadingExercises && <ActivityIndicator color={palette.blue500} style={{ marginTop: 12 }} />}

            {exercises.map(ex => (
              <SessionExerciseCard
                key={ex.key}
                exercise={ex}
                onAddSet={(weightKg, reps) => addSet(ex.key, weightKg, reps)}
                onRemoveSet={setNumber => removeSet(ex.key, setNumber)}
                onRemoveExercise={() => removeExercise(ex.key)}
              />
            ))}

            {mode === 'new' && (
              <TouchableOpacity style={s.addExRow} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={18} color={palette.blue500} />
                <ThemedText style={s.addExRowLink}>Add Exercise</ThemedText>
              </TouchableOpacity>
            )}

            {exercises.length > 0 && (
              <>
                <ThemedText style={s.sectionLabel}>How did it go? (optional)</ThemedText>
                <View style={s.ratingRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity key={n} onPress={() => setRating(rating === n ? 0 : n)} hitSlop={6}>
                      <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={26} color={palette.warning500} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={s.noteInput}
                  placeholder="Session notes (optional)..."
                  placeholderTextColor={palette.gray300}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },
  saveBtn: { backgroundColor: palette.blue500, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 10, minWidth: 68, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: palette.gray300 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  content: { paddingHorizontal: 16, paddingTop: 20 },

  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  togglePill: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.white,
  },
  togglePillActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  toggleText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  toggleTextActive: { color: '#fff' },

  emptyText: { fontSize: 14, color: palette.gray300, marginBottom: 20 },

  workoutPickRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: radii.md,
    borderWidth: 1, borderColor: palette.border, marginBottom: 8,
  },
  workoutPickRowActive: { borderColor: palette.blue500, backgroundColor: palette.blue25 },
  workoutPickText: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  workoutPickTextActive: { color: palette.blue500 },

  nameInput: {
    fontSize: 20, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3,
    marginBottom: 20, borderBottomWidth: 2, borderBottomColor: palette.hairline, paddingBottom: 10,
  },

  entryCard: { borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.white, marginBottom: 10, overflow: 'hidden' },
  entryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, paddingBottom: 10 },
  entryName: { fontSize: 14, fontWeight: '800', color: palette.ink900, lineHeight: 18 },
  entryTarget: { fontSize: 11.5, color: palette.gray300, marginTop: 2, fontWeight: '500' },
  removeBtn: { padding: 4 },

  setsList: { paddingHorizontal: 14, paddingBottom: 8, gap: 6 },
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 8,
  },
  setLabel: { fontSize: 12, fontWeight: '700', color: palette.gray450, width: 44 },
  setValue: { fontSize: 13, fontWeight: '700', color: palette.ink900, flex: 1 },

  addSetRow: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: palette.hairline, backgroundColor: palette.surfaceMuted,
  },
  controlItem: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 6 },
  controlLabel: { fontSize: 10, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.4 },
  controlDivider: { width: 1, height: 40, backgroundColor: palette.hairline },
  confirmSetBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: palette.success700,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },

  addSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  addSetBtnText: { fontSize: 13, fontWeight: '700', color: palette.blue500 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { borderColor: palette.hairline },
  stepVal: { fontSize: 14, fontWeight: '800', color: palette.ink900, minWidth: 40, textAlign: 'center' },

  addExRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginBottom: 8 },
  addExRowLink: { fontSize: 14, fontWeight: '700', color: palette.blue500 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: palette.ink700, marginTop: 8, marginBottom: 10 },
  ratingRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  noteInput: {
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: palette.ink900,
    minHeight: 80, textAlignVertical: 'top',
  },
});

const ps = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white, paddingTop: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  closeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },

  bpScroll: { borderBottomWidth: 1, borderBottomColor: palette.hairline, maxHeight: 56 },
  bpRail: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  bpChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.white,
  },
  bpChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  bpChipText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  bpChipTextActive: { color: '#fff' },

  list: { paddingHorizontal: 16, paddingTop: 12 },
  resultLabel: { fontSize: 11, fontWeight: '600', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  exRowAdded: { opacity: 0.55 },
  exName: { fontSize: 14, fontWeight: '700', color: palette.ink900, lineHeight: 18 },
  exTarget: { fontSize: 12, color: palette.gray300, marginTop: 2, fontWeight: '500' },

  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.success50, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4 },
  addedText: { fontSize: 11, fontWeight: '700', color: palette.success700 },

  errorWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  errorText: { fontSize: 13, color: palette.gray450, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: palette.blue500, borderRadius: radii.pill },
  retryText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  ctaBar: { borderTopWidth: 1, borderTopColor: palette.hairline, backgroundColor: palette.white, paddingHorizontal: 16, paddingTop: 12 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: palette.blue500, borderRadius: radii.pill, paddingVertical: 14 },
  ctaBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

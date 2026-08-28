import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseMedia } from '@/components/exercise-media';
import { LinearGradient } from 'expo-linear-gradient';

const GIF_SIZE = Dimensions.get('window').width - 88; // card has 14px padding each side + 20px outer each side

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
    difficulty: string | null;
    instructions: string[];
    gif_url: string | null;
  };
}

interface Workout {
  id: string;
  title: string;
  description: string | null;
  category: string;
  location_type: string;
  difficulty: string;
  duration_minutes: number;
  goal: string | null;
  equipment: string | null;
  user_id: string | null;
  assigned_by: string | null;
  is_activity_block: boolean;
  personal_trainers: { professional_name: string | null; full_name: string } | null;
}

// ── Visual config ──────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: palette.surfaceMuted, text: palette.gray450 },
  intermediate: { bg: palette.surfaceMuted, text: palette.ink700  },
  advanced:     { bg: palette.ink900,       text: '#fff'          },
};

const BODY_PART_META: Record<string, { label: string; icon: string }> = {
  chest:        { label: 'Chest',     icon: 'fitness-outline'   },
  back:         { label: 'Back',      icon: 'body-outline'      },
  shoulders:    { label: 'Shoulders', icon: 'barbell-outline'   },
  'upper arms': { label: 'Arms',      icon: 'barbell-outline'   },
  'lower arms': { label: 'Forearms',  icon: 'hand-left-outline' },
  'upper legs': { label: 'Quads',     icon: 'walk-outline'      },
  'lower legs': { label: 'Calves',    icon: 'footsteps-outline' },
  waist:        { label: 'Core',      icon: 'shield-outline'    },
  cardio:       { label: 'Cardio',    icon: 'heart-outline'     },
  neck:         { label: 'Neck',      icon: 'body-outline'      },
};
const BODY_PART_ORDER = Object.keys(BODY_PART_META);

function bodyPartMeta(bodyPart: string | null) {
  return BODY_PART_META[bodyPart ?? ''] ?? { label: bodyPart ?? 'Other', icon: 'body-outline' };
}

// Activity blocks (running/walking — no exercises) get a concrete CTA
// matching their content rather than the generic "Start Workout" (section
// 16/14) — keyed off the title ACP itself sets (WORKOUT_TYPE_SPECS), which
// only ever says "Run" or "Walk" for this category today.
function startCtaLabel(workout: Workout): string {
  if (!workout.is_activity_block) return 'Start Workout';
  const title = workout.title.toLowerCase();
  if (title.includes('run')) return 'Start Run';
  if (title.includes('walk')) return 'Start Walk';
  return 'Start Activity';
}

function prescriptionLabel(ex: WorkoutExercise): string {
  const parts: string[] = [];
  if (ex.sets)             parts.push(`${ex.sets} sets`);
  if (ex.reps)             parts.push(`${ex.reps} reps`);
  if (ex.duration_seconds) parts.push(`${ex.duration_seconds}s`);
  if (ex.rest_seconds)     parts.push(`${ex.rest_seconds}s rest`);
  return parts.join(' · ');
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function WorkoutDetailScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();

  const [workout, setWorkout]       = useState<Workout | null>(null);
  const [exercises, setExercises]   = useState<WorkoutExercise[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const [userId, setUserId]         = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [exerciseRatings, setExerciseRatings]         = useState<Record<string, number>>({});
  const [workoutFavorited, setWorkoutFavorited]       = useState(false);

  useEffect(() => {
    if (!workoutId) return;
    (async () => {
      const session = await authService.getSession();
      const uid = session?.user.id ?? null;
      setUserId(uid);

      const [workoutRes, exRes, ratingRes, workoutFavRes] = await Promise.all([
        supabase.from('workouts').select('*, personal_trainers(professional_name, full_name)').eq('id', workoutId).single(),
        supabase
          .from('workout_exercises')
          .select(`
            id, sort_order, sets, reps, duration_seconds, rest_seconds, notes,
            exercises ( id, name, body_part, target_muscle, equipment, difficulty, instructions, gif_url )
          `)
          .eq('workout_id', workoutId)
          .order('sort_order'),
        uid ? supabase.from('exercise_ratings').select('exercise_id, rating').eq('user_id', uid).eq('source', 'db') : Promise.resolve({ data: [] }),
        uid ? supabase.from('workout_favorites').select('id').eq('user_id', uid).eq('workout_id', workoutId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setWorkout(workoutRes.data as Workout ?? null);
      setExercises((exRes.data as unknown as WorkoutExercise[]) ?? []);
      setExerciseRatings(Object.fromEntries(((ratingRes.data as any[]) ?? []).map(r => [r.exercise_id, r.rating])));
      setWorkoutFavorited(!!workoutFavRes.data);
      setLoading(false);
    })();
  }, [workoutId]);

  const toggleExpand = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const rateExercise = async (exerciseId: string, rating: number) => {
    if (!userId) return;
    setExerciseRatings(prev => ({ ...prev, [exerciseId]: rating }));
    await supabase.from('exercise_ratings')
      .upsert({ user_id: userId, source: 'db', exercise_id: exerciseId, rating, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,source,exercise_id' });
  };

  const toggleWorkoutFavorite = async () => {
    if (!userId || !workout) return;
    const next = !workoutFavorited;
    setWorkoutFavorited(next);
    if (next) {
      await supabase.from('workout_favorites').insert({ user_id: userId, workout_id: workout.id });
    } else {
      await supabase.from('workout_favorites').delete().eq('user_id', userId).eq('workout_id', workout.id);
    }
  };

  const groups = useMemo(() => {
    const byPart = new Map<string, WorkoutExercise[]>();
    for (const we of exercises) {
      const key = we.exercises.body_part ?? 'other';
      if (!byPart.has(key)) byPart.set(key, []);
      byPart.get(key)!.push(we);
    }
    return [...byPart.entries()].sort(([a], [b]) => {
      const ai = BODY_PART_ORDER.indexOf(a);
      const bi = BODY_PART_ORDER.indexOf(b);
      return (ai === -1 ? BODY_PART_ORDER.length : ai) - (bi === -1 ? BODY_PART_ORDER.length : bi);
    });
  }, [exercises]);

  const handleDelete = () => {
    if (!workout) return;
    Alert.alert(
      'Delete workout?',
      `"${workout.title}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.from('workouts').delete().eq('id', workout.id);
            setDeleting(false);
            if (error) {
              Alert.alert('Error', error.message ?? 'Failed to delete workout.');
              return;
            }
            router.back();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={s.loadingRoot}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={s.loadingRoot}>
        <ThemedText style={{ color: palette.gray450 }}>Workout not found.</ThemedText>
      </View>
    );
  }

  const diff = DIFFICULTY_COLORS[workout.difficulty] ?? DIFFICULTY_COLORS.beginner;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <LinearGradient
          colors={[palette.blue100, 'rgba(208,224,255,0)']}
          style={s.topFadeBg}
          pointerEvents="none"
        />
        {/* ── Hero ── */}
        <View style={s.hero}>
          <SafeAreaView edges={['top']} style={s.heroSafe}>
            <View style={s.heroTopRow}>
              <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="arrow-back" size={22} color={palette.ink900} />
              </TouchableOpacity>
              <View style={s.heroActions}>
                <TouchableOpacity
                  style={s.editBtn}
                  onPress={toggleWorkoutFavorite}
                  disabled={!userId}
                  hitSlop={12}
                >
                  <Ionicons
                    name={workoutFavorited ? 'heart' : 'heart-outline'}
                    size={19}
                    color={workoutFavorited ? '#ff6b6b' : palette.ink900}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.editBtn}
                  onPress={() => router.push({ pathname: '/schedule-workout', params: { workoutId: workout.id } } as any)}
                  hitSlop={12}
                >
                  <Ionicons name="calendar-outline" size={18} color={palette.ink900} />
                </TouchableOpacity>
                {workout.user_id && workout.user_id === userId ? (
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={handleDelete}
                    disabled={deleting}
                    hitSlop={12}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color={palette.danger600} />
                    ) : (
                      <Ionicons name="trash-outline" size={19} color={palette.danger600} />
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={s.heroMeta}>
              <View style={s.badgeRow}>
                <View style={[s.diffBadge, { backgroundColor: diff.bg }]}>
                  <ThemedText style={[s.diffText, { color: diff.text }]}>
                    {workout.difficulty.charAt(0).toUpperCase() + workout.difficulty.slice(1)}
                  </ThemedText>
                </View>
                {workout.assigned_by && (
                  <View style={s.assignedBadge}>
                    <Ionicons name="person-outline" size={11} color={palette.blue600} />
                    <ThemedText style={s.assignedBadgeText}>
                      Assigned by {workout.personal_trainers?.professional_name || workout.personal_trainers?.full_name || 'your trainer'}
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText style={s.heroTitle}>{workout.title}</ThemedText>
              {workout.description ? (
                <ThemedText style={s.heroDesc}>{workout.description}</ThemedText>
              ) : null}

              {/* Stats strip */}
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Ionicons name="time-outline" size={16} color={palette.gray450} />
                  <ThemedText style={s.statText}>{workout.duration_minutes} min</ThemedText>
                </View>
                {!workout.is_activity_block && (
                  <>
                    <View style={s.statDivider} />
                    <View style={s.statItem}>
                      <Ionicons name="list-outline" size={16} color={palette.gray450} />
                      <ThemedText style={s.statText}>{exercises.length} exercises</ThemedText>
                    </View>
                  </>
                )}
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Ionicons name={workout.location_type === 'home' ? 'home-outline' : 'barbell-outline'} size={16} color={palette.gray450} />
                  <ThemedText style={s.statText}>
                    {workout.location_type === 'home' ? 'Home' : workout.location_type === 'gym' ? 'Gym' : 'Any'}
                  </ThemedText>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* ── Exercise list ── */}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {!workout.is_activity_block && <ThemedText style={s.sectionTitle}>Exercises</ThemedText>}

          {!workout.is_activity_block && groups.map(([bodyPart, items]) => {
              const meta = bodyPartMeta(bodyPart);
              return (
                <View key={bodyPart}>
                  <View style={s.groupHeader}>
                    <Ionicons name={meta.icon as any} size={13} color={palette.gray300} />
                    <ThemedText style={s.groupHeaderText}>{meta.label}</ThemedText>
                  </View>

                  {items.map(we => {
                    const ex = we.exercises;
                    const isOpen = !!expanded[we.id];

                    return (
                      <TouchableOpacity
                        key={we.id}
                        style={s.exCard}
                        onPress={() => toggleExpand(we.id)}
                        activeOpacity={0.85}
                      >
                        <View style={s.exMain}>
                          <View style={s.exHeader}>
                            <View style={s.exIconWrap}>
                              <Ionicons name={meta.icon as any} size={18} color={palette.blue600} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <ThemedText style={s.exName}>{ex.name}</ThemedText>
                              {ex.target_muscle ? (
                                <ThemedText style={s.exMuscle}>{ex.target_muscle}</ThemedText>
                              ) : null}
                            </View>
                            <Ionicons
                              name={isOpen ? 'chevron-up' : 'chevron-down'}
                              size={18} color={palette.gray300}
                            />
                          </View>

                          {/* Prescription */}
                          <ThemedText style={s.exPrescription}>{prescriptionLabel(we)}</ThemedText>

                          {/* Equipment chips */}
                          {ex.equipment && ex.equipment !== 'body weight' ? (
                            <View style={s.equipChip}>
                              <Ionicons name="barbell-outline" size={11} color={palette.gray450} />
                              <ThemedText style={s.equipText}>{ex.equipment}</ThemedText>
                            </View>
                          ) : (
                            <View style={s.equipChip}>
                              <Ionicons name="checkmark-circle-outline" size={11} color={palette.success700} />
                              <ThemedText style={[s.equipText, { color: palette.success700 }]}>No equipment</ThemedText>
                            </View>
                          )}

                          {/* Expanded: GIF + step-by-step instructions */}
                          {isOpen ? (
                            <>
                              <View style={s.rateRow}>
                                <ThemedText style={s.rateLabel}>Your rating</ThemedText>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                  {[1, 2, 3, 4, 5].map(n => (
                                    <TouchableOpacity key={n} hitSlop={6} onPress={() => rateExercise(ex.id, n)} disabled={!userId}>
                                      <Ionicons
                                        name={(exerciseRatings[ex.id] ?? 0) >= n ? 'star' : 'star-outline'}
                                        size={18}
                                        color={palette.warning500}
                                      />
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                              {we.notes ? (
                                <View style={s.noteWrap}>
                                  <Ionicons name="create-outline" size={13} color={palette.blue600} />
                                  <ThemedText style={s.noteText}>{we.notes}</ThemedText>
                                </View>
                              ) : null}
                              {ex.gif_url ? (
                                <View style={s.gifWrap}>
                                  <ExerciseMedia url={ex.gif_url} style={s.gif} />
                                </View>
                              ) : null}
                              {ex.instructions?.length > 0 ? (
                                <View style={s.instructions}>
                                  {ex.instructions.map((step, i) => (
                                    <View key={i} style={s.instructionRow}>
                                      <View style={s.instructionNum}>
                                        <ThemedText style={s.instructionNumText}>{i + 1}</ThemedText>
                                      </View>
                                      <ThemedText style={s.instructionText}>{step}</ThemedText>
                                    </View>
                                  ))}
                                </View>
                              ) : null}

                              <TouchableOpacity
                                style={s.historyBtn}
                                onPress={() => router.push({ pathname: '/exercise-history', params: { exerciseId: ex.id, name: ex.name } } as any)}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="stats-chart-outline" size={14} color={palette.blue600} />
                                <ThemedText style={s.historyBtnText}>View Weight History</ThemedText>
                                <Ionicons name="chevron-forward" size={14} color={palette.blue600} />
                              </TouchableOpacity>
                            </>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* ── Sticky Start CTA ── */}
        <SafeAreaView edges={['bottom']} style={s.ctaWrap}>
          <TouchableOpacity
            style={[s.startBtn, s.startBtnGrad]}
            onPress={() => router.push({ pathname: '/workout-player', params: { workoutId: workout.id } })}
            activeOpacity={0.88}
          >
            <Ionicons name="play" size={20} color="#fff" />
            <ThemedText style={s.startBtnText}>{startCtaLabel(workout)}</ThemedText>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  // Hero — transparent so the topFadeBg gradient (same blue100 wash Home uses) shows through
  hero: {
    paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  heroSafe: { paddingHorizontal: 20, paddingTop: 8 },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.danger50,
    alignItems: 'center', justifyContent: 'center',
  },
  heroMeta: {},
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  diffBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill,
  },
  diffText: { fontSize: 11, fontWeight: '700' },
  assignedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill,
  },
  assignedBadgeText: { fontSize: 11, fontWeight: '700', color: palette.blue600 },
  heroTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: palette.ink900, marginBottom: 8 },
  heroDesc: { fontSize: fontSize.sm, color: palette.gray450, lineHeight: 20, marginBottom: 14 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  statDivider: { width: 1, height: 14, backgroundColor: palette.hairline },

  // List
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14,
  },

  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, marginBottom: 10,
  },
  groupHeaderText: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  // Exercise card
  exCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.borderFaint,
    padding: 14, marginBottom: 10,
  },
  exMain: { flex: 1 },
  exHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  exIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  exName: { fontSize: 15, fontWeight: '700', color: palette.ink900, lineHeight: 20 },
  exMuscle: { fontSize: 12, color: palette.gray450, marginTop: 1 },
  exPrescription: { fontSize: 13, fontWeight: '600', color: palette.blue500, marginBottom: 6 },
  equipChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
  },
  equipText: { fontSize: 11, fontWeight: '600', color: palette.gray450 },

  rateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10,
  },
  rateLabel: { fontSize: 12.5, fontWeight: '600', color: palette.gray450 },

  noteWrap: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
    padding: 10, marginTop: 10,
  },
  noteText: { flex: 1, fontSize: 12.5, color: palette.ink700, lineHeight: 17, fontStyle: 'italic' },

  gifWrap: {
    marginTop: 10, borderRadius: radii.lg, overflow: 'hidden',
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
  },
  gif: {
    width: GIF_SIZE, height: GIF_SIZE,
  },
  instructions: {
    marginTop: 12, padding: 12,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, gap: 8,
  },
  instructionRow: { flexDirection: 'row', gap: 10 },
  instructionNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: palette.gray450,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  instructionNumText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  instructionText: { flex: 1, fontSize: 13, color: palette.ink700, lineHeight: 18 },

  historyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 10,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
  },
  historyBtnText: { fontSize: 13, fontWeight: '700', color: palette.blue600 },

  // CTA
  ctaWrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.hairline },
  startBtn: { borderRadius: radii.xl, overflow: 'hidden' },
  startBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, backgroundColor: palette.ink900 },
  startBtnText: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
});

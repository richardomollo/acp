import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Workout {
  id: string;
  title: string;
  description: string | null;
  category: string;
  location_type: 'home' | 'gym' | 'both';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration_minutes: number;
  goal: string | null;
  equipment: string | null;
  user_id: string | null;
}

// ── Constants (mirrors (tabs)/fitness.tsx) ──────────────────────────────────────

const BODY_PARTS = [
  { key: 'chest',       label: 'Chest',     icon: 'fitness-outline'    },
  { key: 'back',        label: 'Back',       icon: 'body-outline'       },
  { key: 'shoulders',   label: 'Shoulders',  icon: 'barbell-outline'    },
  { key: 'upper arms',  label: 'Arms',       icon: 'barbell-outline'    },
  { key: 'upper legs',  label: 'Quads',      icon: 'walk-outline'       },
  { key: 'lower legs',  label: 'Calves',     icon: 'footsteps-outline'  },
  { key: 'waist',       label: 'Core',       icon: 'shield-outline'     },
  { key: 'cardio',      label: 'Cardio',     icon: 'heart-outline'      },
  { key: 'lower arms',  label: 'Forearms',   icon: 'hand-left-outline'  },
  { key: 'neck',        label: 'Neck',       icon: 'body-outline'       },
] as const;

const LOCATION_TABS = [
  { key: 'all',  label: 'All'  },
  { key: 'home', label: '🏠 Home' },
  { key: 'gym',  label: '🏋️ Gym'  },
  { key: 'favorites', label: '❤️ Favorites' },
] as const;

const CARD_STYLES: Record<string, { icon: string }> = {
  full_body: { icon: 'body-outline'     },
  hiit:      { icon: 'flame-outline'    },
  mobility:  { icon: 'leaf-outline'     },
  core:      { icon: 'shield-outline'   },
  push:      { icon: 'barbell-outline'  },
  pull:      { icon: 'fitness-outline'  },
  legs:      { icon: 'walk-outline'     },
  strength:  { icon: 'trophy-outline'   },
};

const DEFAULT_CARD = { icon: 'barbell-outline' };

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: palette.success50,  text: palette.success700 },
  intermediate: { bg: palette.warning50,  text: palette.warning800 },
  advanced:     { bg: palette.danger50,   text: palette.danger600  },
};

const GOAL_LABELS: Record<string, string> = {
  lose_weight:      'Lose Weight',
  build_muscle:     'Build Muscle',
  improve_mobility: 'Mobility',
  general_fitness:  'General Fitness',
};

const CATEGORY_LABELS: Record<string, string> = {
  full_body: 'Full Body',
  hiit:      'HIIT',
  mobility:  'Mobility',
  core:      'Core',
  push:      'Push',
  pull:      'Pull',
  legs:      'Legs',
  strength:  'Strength',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function WorkoutCard({
  workout, onPress, favorited, onToggleFavorite,
}: {
  workout: Workout; onPress: () => void;
  favorited: boolean; onToggleFavorite: () => void;
}) {
  const cs   = CARD_STYLES[workout.category] ?? DEFAULT_CARD;
  const diff = DIFFICULTY_COLORS[workout.difficulty] ?? DIFFICULTY_COLORS.beginner;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.88}>
      <View style={s.cardBody}>
        <View style={s.cardTopRow}>
          <View style={s.catIconWrap}>
            <Ionicons name={cs.icon as any} size={19} color={palette.ink900} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <ThemedText style={s.cardTitle} numberOfLines={1}>{workout.title}</ThemedText>
            <ThemedText style={s.catLabel}>{CATEGORY_LABELS[workout.category] ?? workout.category}</ThemedText>
          </View>
          <TouchableOpacity hitSlop={10} onPress={onToggleFavorite}>
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={19}
              color={favorited ? palette.danger500 : palette.gray300}
            />
          </TouchableOpacity>
          <View style={s.locationPill}>
            <ThemedText style={s.locationPillText}>
              {workout.location_type === 'home' ? '🏠 Home' : workout.location_type === 'gym' ? '🏋️ Gym' : '🌐 Any'}
            </ThemedText>
          </View>
        </View>

        {workout.description ? (
          <ThemedText style={s.cardDesc} numberOfLines={2}>{workout.description}</ThemedText>
        ) : null}

        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <Ionicons name="time-outline" size={13} color={palette.gray450} />
            <ThemedText style={s.metaText}>{workout.duration_minutes} min</ThemedText>
          </View>
          {workout.equipment && workout.equipment !== 'None' ? (
            <View style={s.metaItem}>
              <Ionicons name="barbell-outline" size={13} color={palette.gray450} />
              <ThemedText style={s.metaText} numberOfLines={1}>Equipment needed</ThemedText>
            </View>
          ) : (
            <View style={s.metaItem}>
              <Ionicons name="checkmark-circle-outline" size={13} color={palette.success700} />
              <ThemedText style={[s.metaText, { color: palette.success700 }]}>No equipment</ThemedText>
            </View>
          )}
        </View>

        <View style={s.cardFooter}>
          <View style={[s.diffBadge, { backgroundColor: diff.bg }]}>
            <ThemedText style={[s.diffText, { color: diff.text }]}>
              {workout.difficulty.charAt(0).toUpperCase() + workout.difficulty.slice(1)}
            </ThemedText>
          </View>
          {workout.goal ? (
            <ThemedText style={s.goalLabel}>{GOAL_LABELS[workout.goal] ?? workout.goal}</ThemedText>
          ) : null}
          <View style={s.startBtn}>
            <ThemedText style={s.startBtnText}>View</ThemedText>
            <Ionicons name="arrow-forward" size={13} color={palette.ink900} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BrowseExercisesScreen() {
  const router = useRouter();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading]   = useState(true);
  const [location, setLocation] = useState<'all' | 'home' | 'gym' | 'favorites'>('all');
  const [userId, setUserId]     = useState<string | null>(null);
  const [favoriteWorkoutIds, setFavoriteWorkoutIds] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      const uid = session?.user.id ?? null;

      const [{ data }, favRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, title, description, category, location_type, difficulty, duration_minutes, goal, equipment, user_id')
          .eq('is_active', true)
          .is('user_id', null)
          .order('location_type')
          .order('difficulty'),
        uid ? supabase.from('workout_favorites').select('workout_id').eq('user_id', uid) : Promise.resolve({ data: [] }),
      ]);

      if (active) {
        setUserId(uid);
        setWorkouts((data as Workout[]) ?? []);
        setFavoriteWorkoutIds(new Set(((favRes.data as any[]) ?? []).map(r => r.workout_id)));
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  const toggleWorkoutFavorite = async (workoutId: string) => {
    if (!userId) return;
    const isFav = favoriteWorkoutIds.has(workoutId);
    setFavoriteWorkoutIds(prev => {
      const next = new Set(prev);
      isFav ? next.delete(workoutId) : next.add(workoutId);
      return next;
    });
    if (isFav) {
      await supabase.from('workout_favorites').delete().eq('user_id', userId).eq('workout_id', workoutId);
    } else {
      await supabase.from('workout_favorites').insert({ user_id: userId, workout_id: workoutId });
    }
  };

  const filtered = useMemo(() => {
    if (location === 'favorites') return workouts.filter(w => favoriteWorkoutIds.has(w.id));
    if (location === 'all') return workouts;
    return workouts.filter(w => w.location_type === location || w.location_type === 'both');
  }, [workouts, location, favoriteWorkoutIds]);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Browse Exercises</ThemedText>
          <ThemedText style={s.headerSub}>By body part & premade workouts</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* ── Browse by Body Part ── */}
          <View style={s.bodyPartSection}>
            <View style={s.bodyPartHeader}>
              <ThemedText style={s.bodyPartEyebrow}>EXERCISES</ThemedText>
              <ThemedText style={s.bodyPartTitle}>Browse by Body Part</ThemedText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bodyPartRail}>
              {BODY_PARTS.map(bp => (
                <TouchableOpacity
                  key={bp.key}
                  style={s.bpCard}
                  onPress={() => router.push({ pathname: '/exercises-by-body-part', params: { bodyPart: bp.key } } as any)}
                  activeOpacity={0.8}
                >
                  <View style={s.bpIconWrap}>
                    <Ionicons name={bp.icon as any} size={22} color={palette.ink900} />
                  </View>
                  <ThemedText style={s.bpLabel}>{bp.label}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── Premade Workouts ── */}
          <View style={s.bodyPartHeader}>
            <ThemedText style={s.bodyPartEyebrow}>FEATURED</ThemedText>
            <ThemedText style={s.bodyPartTitle}>Premade Workouts</ThemedText>
          </View>

          <View style={s.locationTabs}>
            {LOCATION_TABS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[s.locationTab, location === t.key && s.locationTabActive]}
                onPress={() => setLocation(t.key)}
                activeOpacity={0.7}
              >
                <ThemedText style={[s.locationTabText, location === t.key && s.locationTabTextActive]}>
                  {t.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {filtered.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="barbell-outline" size={32} color={palette.gray300} />
              </View>
              <ThemedText style={s.emptyText}>No workouts found</ThemedText>
              <ThemedText style={s.emptySub}>Try different filters</ThemedText>
            </View>
          ) : (
            filtered.map(w => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: w.id } })}
                favorited={favoriteWorkoutIds.has(w.id)}
                onToggleFavorite={() => toggleWorkoutFavorite(w.id)}
              />
            ))
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  locationTabs: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1, borderColor: palette.border,
    borderRadius: radii.md, padding: 4, gap: 4,
    marginBottom: 14,
  },
  locationTab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  locationTabActive: { backgroundColor: palette.white, ...shadows.sm },
  locationTabText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray300 },
  locationTabTextActive: { color: palette.ink900 },

  // ── Workout card
  card: {
    marginBottom: 14, borderRadius: radii.xl,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
  },
  cardBody: { padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  catIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: palette.ink900 },
  catLabel: { fontSize: 12, fontWeight: '600', color: palette.gray300, marginTop: 1 },
  locationPill: {
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, flexShrink: 0,
  },
  locationPillText: { fontSize: 11.5, fontWeight: '600', color: palette.gray450 },
  cardDesc: { fontSize: 13, color: palette.gray450, lineHeight: 18, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13, fontWeight: '500', color: palette.gray450 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline },
  diffBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill },
  diffText: { fontSize: 11, fontWeight: '700' },
  goalLabel: { flex: 1, fontSize: 12, color: palette.gray300, fontWeight: '500' },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.hairline, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  startBtnText: { fontSize: 12.5, fontWeight: '700', color: palette.ink900 },

  // ── Empty
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.hairline, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink700, marginBottom: 6 },
  emptySub: { fontSize: fontSize.sm, color: palette.gray300 },

  // ── Body part browser
  bodyPartSection: { marginTop: 0, marginBottom: 20 },
  bodyPartHeader: { marginBottom: 14 },
  bodyPartEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, color: palette.gray300, textTransform: 'uppercase', marginBottom: 4 },
  bodyPartTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },
  bodyPartRail: { gap: 10, paddingBottom: 4 },
  bpCard: {
    width: 88, alignItems: 'center', gap: 8,
    backgroundColor: palette.white,
    borderWidth: 1, borderColor: palette.hairline,
    borderRadius: radii.xl, paddingVertical: 16,
  },
  bpIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  bpLabel: { fontSize: 11.5, fontWeight: '700', color: palette.ink700, textAlign: 'center' },
});

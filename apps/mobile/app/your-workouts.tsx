import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect } from 'react';
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
  created_at: string;
  assigned_by: string | null;
}

// ── Constants (mirrors (tabs)/fitness.tsx) ──────────────────────────────────────

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

function WorkoutCard({ workout, onPress }: { workout: Workout; onPress: () => void }) {
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
            <ThemedText style={s.catLabel}>
              {CATEGORY_LABELS[workout.category] ?? workout.category}
              {workout.assigned_by ? ' · Assigned by trainer' : ''}
            </ThemedText>
          </View>
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

export default function YourWorkoutsScreen() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user.id) {
        setWorkouts([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('workouts')
        .select('id, title, description, category, location_type, difficulty, duration_minutes, goal, equipment, user_id, created_at, assigned_by')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      setWorkouts((data as Workout[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Your Workouts</ThemedText>
          <ThemedText style={s.headerSub}>{workouts.length} created</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : workouts.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="barbell-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>No workouts yet</ThemedText>
          <ThemedText style={s.emptySub}>Lana builds your workouts for you — check My Plan for your personalized recommendation.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {workouts.map(w => (
            <WorkoutCard
              key={w.id}
              workout={w}
              onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: w.id } })}
            />
          ))}
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

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },

  // ── Workout card (mirrors (tabs)/fitness.tsx)
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
});

// A single shared profile screen for both the Fitness Hub and Nutrition
// Hub — fitness and nutrition goals go hand in hand, so there's one goal
// (fitness_profile.goal) instead of two that could drift out of sync.
// Experience level / preferred location are fitness-specific; cuisine
// preference / weight goals are nutrition-specific — all live on the same
// fitness_profile row.
import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface FitnessGoal {
  key: 'lose_weight' | 'build_muscle' | 'improve_mobility' | 'general_fitness' | 'maintain_weight' | 'eat_healthier';
  label: string;
  desc: string;
  icon: string;
  color: string;
}

interface ExperienceLevel {
  key: 'beginner' | 'intermediate' | 'advanced';
  label: string;
  desc: string;
  icon: string;
}

interface CuisinePref {
  key: 'kenyan' | 'mixed' | 'vegetarian';
  label: string;
  icon: string;
}

const GOALS: FitnessGoal[] = [
  { key: 'build_muscle',     label: 'Build Muscle',    desc: 'Strength & hypertrophy',  icon: 'barbell-outline',  color: '#1d4ed8' },
  { key: 'lose_weight',      label: 'Lose Weight',     desc: 'Burn fat & get lean',      icon: 'flame-outline',    color: '#ef4444' },
  { key: 'general_fitness',  label: 'General Fitness', desc: 'Overall health & energy',  icon: 'heart-outline',    color: '#16a34a' },
  { key: 'improve_mobility', label: 'Mobility',        desc: 'Flexibility & recovery',   icon: 'leaf-outline',     color: '#7c3aed' },
  { key: 'maintain_weight',  label: 'Maintain Weight', desc: 'Stay where you are',       icon: 'trending-up-outline', color: '#0891b2' },
  { key: 'eat_healthier',    label: 'Eat Healthier',   desc: 'Better food, fewer processed meals', icon: 'nutrition-outline', color: '#f59e0b' },
];

const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  { key: 'beginner',     label: 'Beginner',     desc: 'New to working out', icon: 'leaf-outline'    },
  { key: 'intermediate', label: 'Intermediate', desc: 'Training 6+ months', icon: 'barbell-outline' },
  { key: 'advanced',     label: 'Advanced',     desc: 'Serious athlete',    icon: 'trophy-outline'  },
];

const CUISINES: CuisinePref[] = [
  { key: 'kenyan',     label: 'Kenyan',     icon: 'restaurant-outline' },
  { key: 'mixed',      label: 'Mixed',      icon: 'globe-outline' },
  { key: 'vegetarian', label: 'Vegetarian', icon: 'leaf-outline' },
];

export default function FitnessGoalsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [level, setLevel] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [startingWeight, setStartingWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }
    setUserId(session.user.id);

    const { data } = await supabase
      .from('fitness_profile')
      .select('goals, experience_level, cuisine_preference, starting_weight_kg, goal_weight_kg')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setGoals(data?.goals ?? []);
    setLevel(data?.experience_level ?? null);
    setCuisine(data?.cuisine_preference ?? null);
    setStartingWeight(data?.starting_weight_kg != null ? String(data.starting_weight_kg) : '');
    setGoalWeight(data?.goal_weight_kg != null ? String(data.goal_weight_kg) : '');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveProfile = async (patch: Record<string, string | number | null | string[]>) => {
    if (!userId || saving) return;
    setSaving(true);

    const { error } = await supabase.from('fitness_profile').upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

    if (error) {
      Alert.alert('Error', 'Failed to save your preference. Please try again.');
    }
    setSaving(false);
  };

  // `goal` (singular) is kept as the first-selected goal for backward
  // compatibility with readers that only understand one goal (e.g. the
  // workout generator's category picker).
  const toggleGoal = (key: string) => {
    const next = goals.includes(key) ? goals.filter(g => g !== key) : [...goals, key];
    setGoals(next);
    saveProfile({ goals: next, goal: next[0] ?? null });
  };
  const selectLevel = (key: string) => { setLevel(key); saveProfile({ experience_level: key }); };
  const selectCuisine = (key: string) => { setCuisine(key); saveProfile({ cuisine_preference: key }); };

  const saveWeights = () => {
    saveProfile({
      starting_weight_kg: startingWeight.trim() ? Number(startingWeight) : null,
      goal_weight_kg: goalWeight.trim() ? Number(goalWeight) : null,
    });
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>My Goals</ThemedText>
          <ThemedText style={s.headerSub}>Powers both your Fitness &amp; Nutrition Hub</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ThemedText style={s.sectionTitle}>My Goal</ThemedText>
          <View style={s.goalsGrid}>
            {GOALS.map(g => {
              const active = goals.includes(g.key);
              return (
                <TouchableOpacity
                  key={g.key}
                  style={[s.goalCard, active && { borderColor: g.color, borderWidth: 2 }]}
                  onPress={() => toggleGoal(g.key)}
                  activeOpacity={0.8}
                  disabled={saving}
                >
                  <View style={[s.goalIcon, { backgroundColor: active ? g.color : palette.surfaceMuted }]}>
                    <Ionicons name={g.icon as any} size={20} color={active ? '#fff' : palette.gray450} />
                  </View>
                  <ThemedText style={[s.goalLabel, active && { color: g.color }]}>{g.label}</ThemedText>
                  <ThemedText style={s.goalDesc}>{g.desc}</ThemedText>
                  {active && (
                    <View style={[s.goalCheck, { backgroundColor: g.color }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <ThemedText style={s.multiHint}>Tap to select as many as apply.</ThemedText>

          <ThemedText style={s.sectionTitle}>My Level</ThemedText>
          <View style={s.levelRow}>
            {EXPERIENCE_LEVELS.map(lv => {
              const active = level === lv.key;
              return (
                <TouchableOpacity
                  key={lv.key}
                  style={[s.levelCard, active && s.levelCardActive]}
                  onPress={() => selectLevel(lv.key)}
                  activeOpacity={0.8}
                  disabled={saving}
                >
                  <Ionicons name={lv.icon as any} size={18} color={active ? '#fff' : palette.gray450} />
                  <ThemedText style={[s.levelLabel, active && s.levelLabelActive]}>{lv.label}</ThemedText>
                  <ThemedText style={[s.levelDesc, active && { color: 'rgba(255,255,255,0.75)' }]}>{lv.desc}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <ThemedText style={s.sectionTitle}>Preferred Cuisine</ThemedText>
          <View style={s.levelRow}>
            {CUISINES.map(c => {
              const active = cuisine === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[s.levelCard, active && s.levelCardActive]}
                  onPress={() => selectCuisine(c.key)}
                  activeOpacity={0.8}
                  disabled={saving}
                >
                  <Ionicons name={c.icon as any} size={18} color={active ? '#fff' : palette.gray450} />
                  <ThemedText style={[s.levelLabel, active && s.levelLabelActive]}>{c.label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <ThemedText style={s.sectionTitle}>Weight Goal (optional)</ThemedText>
          <View style={s.weightRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.weightLabel}>Starting (kg)</ThemedText>
              <TextInput
                style={s.weightInput}
                keyboardType="decimal-pad"
                placeholder="e.g. 95"
                placeholderTextColor={palette.gray300}
                value={startingWeight}
                onChangeText={setStartingWeight}
                onBlur={saveWeights}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.weightLabel}>Goal (kg)</ThemedText>
              <TextInput
                style={s.weightInput}
                keyboardType="decimal-pad"
                placeholder="e.g. 85"
                placeholderTextColor={palette.gray300}
                value={goalWeight}
                onChangeText={setGoalWeight}
                onBlur={saveWeights}
              />
            </View>
          </View>

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
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  multiHint: { fontSize: 11.5, color: palette.gray300, marginBottom: 24 },
  goalCard: {
    width: '47%', borderRadius: radii.xl,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    padding: 14, gap: 6,
  },
  goalIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  goalLabel: { fontSize: 13, fontWeight: '800', color: palette.ink900, letterSpacing: -0.1 },
  goalDesc: { fontSize: 11, color: palette.gray300, lineHeight: 14 },
  goalCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  levelRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  levelCard: {
    flex: 1, borderRadius: radii.xl, padding: 12, gap: 4, alignItems: 'center',
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
  },
  levelCardActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  levelLabel: { fontSize: 12, fontWeight: '800', color: palette.ink900, textAlign: 'center' },
  levelLabelActive: { color: '#fff' },
  levelDesc: { fontSize: 10, color: palette.gray300, textAlign: 'center', lineHeight: 13 },

  weightRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  weightLabel: { fontSize: 12, fontWeight: '700', color: palette.gray450, marginBottom: 8 },
  weightInput: {
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: palette.ink900,
  },
});

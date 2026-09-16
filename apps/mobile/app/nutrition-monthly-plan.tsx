// Lana Nutrition — Monthly → Weekly → Daily Planning V1. The monthly
// strategy screen (§48): goal, targets, and 4 week objectives with status —
// never a 28-day grid, never inline recipe details.
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { nutritionPlanningService, type NutritionCycleRow, type NutritionWeekRow } from '@/services/nutrition-planning-service';
import { nutritionReferenceService } from '@/services/nutrition-reference-service';
import { resolveDailyMacroTargets } from '@/lib/nutrition/daily-macro-targets';

const GOAL_LABEL: Record<string, string> = {
  lose_weight: 'Lose body fat', build_muscle: 'Build muscle', improve_mobility: 'Improve mobility',
  general_fitness: 'General fitness', maintain_weight: 'Maintain weight', eat_healthier: 'Eat healthier',
  improve_running: 'Improve running', improve_health: 'Improve health', healthy_lifestyle: 'Healthy lifestyle',
  body_recomposition: 'Body recomposition', reduce_stress: 'Reduce stress',
};

export default function NutritionMonthlyPlanScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<NutritionCycleRow | null>(null);
  const [weeks, setWeeks] = useState<NutritionWeekRow[]>([]);
  const [proteinTarget, setProteinTarget] = useState<{ min: number; max: number } | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const session = await authService.getSession();
        if (!session?.user.id) { if (active) setCycle(null); return; }
        const plan = await nutritionPlanningService.getCurrentPlan(session.user.id);
        if (!active) return;
        if (!plan) { setCycle(null); setWeeks([]); return; }
        setCycle(plan.cycle);
        const { data } = await supabase.from('nutrition_weekly_plans')
          .select('*').eq('cycle_id', plan.cycle.id).order('week_start_date');
        if (active) setWeeks(((data ?? []) as any[]).map(r => ({
          id: r.id, cycleId: r.cycle_id, userId: r.user_id, weekStartDate: r.week_start_date, weekEndDate: r.week_end_date,
          objective: r.objective, objectiveReason: r.objective_reason ?? null, objectiveTheme: r.objective_theme ?? null, status: r.status,
        })));
        const targets = resolveDailyMacroTargets(await nutritionReferenceService.resolveUserReferenceContext(session.user.id));
        if (active) setProteinTarget(targets.proteinTargetG);
      } catch {
        if (active) { setCycle(null); setWeeks([]); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.title}>Your 4-week plan</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.blue500} /></View>
      ) : !cycle ? (
        <View style={s.center}>
          <ThemedText style={s.emptyTitle}>Your 4-week nutrition plan is complete.</ThemedText>
          <TouchableOpacity style={s.reviewLink}>
            <ThemedText style={s.reviewLinkText}>Review progress</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <ThemedText style={s.sectionLabel}>Goal</ThemedText>
          <ThemedText style={s.goalText}>{cycle.goal ? (GOAL_LABEL[cycle.goal] ?? cycle.goal) : 'Not set'}</ThemedText>

          {proteinTarget && (
            <>
              <ThemedText style={[s.sectionLabel, { marginTop: 18 }]}>Targets</ThemedText>
              <ThemedText style={s.goalText}>Protein {Math.round(proteinTarget.min)}–{Math.round(proteinTarget.max)}g</ThemedText>
              <ThemedText style={s.suggestedByLana}>Suggested by Lana</ThemedText>
            </>
          )}

          <ThemedText style={[s.sectionLabel, { marginTop: 22 }]}>Weeks</ThemedText>
          {weeks.map(w => (
            <TouchableOpacity
              key={w.id}
              style={s.weekRow}
              onPress={() => w.status !== 'scheduled' && router.push('/nutrition-weekly-plan' as any)}
              accessibilityRole="button"
              accessibilityLabel={`Week ${w.objective}`}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={s.weekObjective}>{w.objective}</ThemedText>
                <ThemedText style={s.weekDates}>{w.weekStartDate} – {w.weekEndDate}</ThemedText>
              </View>
              <View style={[s.statusChip, w.status === 'current' && s.statusChipCurrent]}>
                <ThemedText style={[s.statusChipText, w.status === 'current' && s.statusChipTextCurrent]}>
                  {w.status === 'current' ? 'Current' : w.status === 'scheduled' ? 'Scheduled' : 'Completed'}
                </ThemedText>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: palette.ink900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, textAlign: 'center' },
  reviewLink: { paddingVertical: 10 },
  reviewLinkText: { fontSize: 13.5, fontWeight: '700', color: palette.blue600 },
  body: { paddingHorizontal: 20, paddingBottom: 48 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  goalText: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  suggestedByLana: { fontSize: 11, color: palette.gray300, marginTop: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  weekObjective: { fontSize: 13.5, fontWeight: '700', color: palette.ink900 },
  weekDates: { fontSize: 11, color: palette.gray450, marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted },
  statusChipCurrent: { backgroundColor: palette.blue50 },
  statusChipText: { fontSize: 10, fontWeight: '700', color: palette.gray450 },
  statusChipTextCurrent: { color: palette.blue600 },
});

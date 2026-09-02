import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isNutritionSavedMealsEnabled } from '@/lib/flags';
import { authService } from '@/services/auth';
import { savedMealService } from '@/services/saved-meal-service';
import {
  draftFromSavedMeal, computeSavedMealPreview, setComponentPortion, unitOptionsForFood,
  type SavedMealDraft,
} from '@/lib/nutrition/saved-meal';
import type { LogUnit, MealSlot } from '@/lib/nutrition/food-types';

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snack' },
];

type Phase = 'review' | 'logging' | 'done';

export default function SavedMealLogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; slot?: string }>();
  const mealId = typeof params.id === 'string' ? params.id : '';

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<SavedMealDraft | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [slot, setSlot] = useState<MealSlot | null>(
    (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(params.slot as MealSlot) ? (params.slot as MealSlot) : null,
  );
  const [phase, setPhase] = useState<Phase>('review');
  const [loadError, setLoadError] = useState(false);
  const [results, setResults] = useState<{ itemId: string; ok: boolean; error?: string }[]>([]);
  const [prepareErrors, setPrepareErrors] = useState<{ key: string; message: string }[]>([]);

  useEffect(() => {
    if (!isNutritionSavedMealsEnabled()) { router.replace('/log-food'); return; }
    let active = true;
    (async () => {
      const sess = await authService.getSession();
      if (active) setUserId(sess?.user.id ?? null);
      try {
        const meal = await savedMealService.get(mealId);
        if (!active) return;
        if (!meal) { setLoadError(true); return; }
        setName(meal.name);
        const d = draftFromSavedMeal(meal);
        setDraft(d);
        setIncluded(new Set(d.components.map(c => c.key)));
      } catch {
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [mealId, router]);

  const activeComponents = useMemo(
    () => (draft ? draft.components.filter(c => included.has(c.key)) : []),
    [draft, included],
  );
  const preview = useMemo(() => computeSavedMealPreview(activeComponents), [activeComponents]);

  if (loadError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[s.root, s.centre]}>
          <ThemedText style={s.loadErr}>That meal could not be loaded.</ThemedText>
          <TouchableOpacity onPress={() => router.back()}><ThemedText style={s.link}>Go back</ThemedText></TouchableOpacity>
        </View>
      </>
    );
  }
  if (!draft) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[s.root, s.centre]}><ActivityIndicator size="large" color={palette.blue500} /></View>
      </>
    );
  }

  const canLog = activeComponents.length > 0 && preview.unresolved.length === 0;

  const doLog = async () => {
    if (!userId || !canLog) return;
    setPhase('logging');
    const res = await savedMealService.log(userId, mealId, activeComponents, slot);
    setPrepareErrors(res.prepareErrors);
    setResults(res.results.map(r => ({ itemId: r.itemId, ok: r.ok, error: r.error })));
    setPhase('done');
  };

  const loggedCount = results.filter(r => r.ok).length;
  const failedCount = results.length - loggedCount;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle} numberOfLines={1}>{phase === 'done' ? 'Meal logged' : name}</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {phase === 'logging' && (
          <View style={s.centre}>
            <ActivityIndicator size="large" color={palette.blue500} />
            <ThemedText style={s.centreText}>Logging your meal…</ThemedText>
          </View>
        )}

        {phase === 'review' && (
          <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
            <ThemedText style={s.lede}>Review what you’re logging. Each food is recorded on its own, just like logging them one by one.</ThemedText>

            <View style={s.rowBetween}>
              <ThemedText style={s.sectionLabel}>Foods</ThemedText>
              <TouchableOpacity onPress={() => setEditing(v => !v)}>
                <ThemedText style={s.link}>{editing ? 'Done editing' : 'Edit amounts'}</ThemedText>
              </TouchableOpacity>
            </View>

            {draft.components.map(c => {
              const on = included.has(c.key);
              const r = preview.resolved.find(x => x.key === c.key);
              const err = preview.unresolved.find(x => x.key === c.key);
              const unitOptions = unitOptionsForFood(c.food);
              return (
                <View key={c.key} style={[s.compCard, !on && s.compCardOff]}>
                  <View style={s.compTop}>
                    <TouchableOpacity
                      onPress={() => setIncluded(prev => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                        return next;
                      })}
                      hitSlop={8}
                      style={s.checkWrap}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? palette.blue600 : palette.gray300} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[s.compName, !on && s.compNameOff]}>{c.food.name}</ThemedText>
                      <ThemedText style={s.compMeta}>
                        {c.unit === 'serving' ? (c.servingLabel ?? `${c.quantity} serving`) : `${c.quantity} ${c.unit}`}
                        {on && r?.energyKcal != null ? ` · ${Math.round(r.energyKcal)} kcal` : ''}
                        {on && err ? ' · needs a valid amount' : ''}
                      </ThemedText>
                    </View>
                  </View>

                  {editing && on && (
                    <>
                      <View style={s.amountRow}>
                        <TextInput
                          style={s.amountInput}
                          value={c.quantity}
                          onChangeText={t => setDraft(d => (d ? setComponentPortion(d, c.key, { quantity: t }) : d))}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                        <View style={s.unitChips}>
                          {unitOptions.map(u => (
                            <TouchableOpacity
                              key={u}
                              style={[s.unitChip, c.unit === u && s.unitChipOn]}
                              onPress={() => setDraft(d => (d ? setComponentPortion(d, c.key, {
                                unit: u as LogUnit,
                                servingLabel: u === 'serving' ? (c.servingLabel ?? c.food.servings[0]?.label ?? null) : null,
                              }) : d))}
                            >
                              <ThemedText style={[s.unitChipText, c.unit === u && s.unitChipTextOn]}>{u}</ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      {c.unit === 'serving' && c.food.servings.length > 0 && (
                        <View style={s.servingWrap}>
                          {c.food.servings.map(sv => (
                            <TouchableOpacity
                              key={sv.label}
                              style={[s.servingChip, c.servingLabel === sv.label && s.servingChipOn]}
                              onPress={() => setDraft(d => (d ? setComponentPortion(d, c.key, { servingLabel: sv.label }) : d))}
                            >
                              <ThemedText style={[s.servingChipText, c.servingLabel === sv.label && s.servingChipTextOn]}>{sv.label}</ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}

            <View style={s.totalsCard}>
              <ThemedText style={s.totalsTitle}>Approximate totals</ThemedText>
              <ThemedText style={s.totalsLine}>
                {Math.round(preview.energyKcal)} kcal · {Math.round(preview.proteinG)} g protein · {Math.round(preview.carbohydrateG)} g carbs · {Math.round(preview.fatG)} g fat
              </ThemedText>
              {preview.completeness.energyKcal.level !== 'complete' && activeComponents.length > 0 && (
                <ThemedText style={s.totalsNote}>Some foods are missing nutrient data — treat this as a lower bound.</ThemedText>
              )}
            </View>

            <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>Meal</ThemedText>
            <View style={s.slotRow}>
              {SLOTS.map(sl => (
                <TouchableOpacity
                  key={sl.key}
                  style={[s.slotChip, slot === sl.key && s.slotChipOn]}
                  onPress={() => setSlot(sl.key === slot ? null : sl.key)}
                >
                  <ThemedText style={[s.slotChipText, slot === sl.key && s.slotChipTextOn]}>{sl.label}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, !canLog && s.primaryBtnDisabled]}
              onPress={doLog}
              disabled={!canLog}
              activeOpacity={0.85}
            >
              <ThemedText style={s.primaryBtnText}>
                Add meal · {activeComponents.length} food{activeComponents.length === 1 ? '' : 's'}
              </ThemedText>
            </TouchableOpacity>
            {activeComponents.length === 0 && (
              <ThemedText style={s.hint}>Tick at least one food to log.</ThemedText>
            )}
          </ScrollView>
        )}

        {phase === 'done' && (
          <ScrollView contentContainerStyle={s.pad}>
            <ThemedText style={s.lede}>
              {failedCount === 0 && prepareErrors.length === 0
                ? `Logged ${loggedCount} food${loggedCount === 1 ? '' : 's'} from ${name}.`
                : `Logged ${loggedCount} of ${results.length || activeComponents.length}. ${failedCount || prepareErrors.length} didn’t save.`}
            </ThemedText>

            {draft.components.filter(c => included.has(c.key)).map(c => {
              const r = results.find(x => x.itemId === c.key);
              const prep = prepareErrors.find(x => x.key === c.key);
              const ok = r?.ok ?? false;
              return (
                <View key={c.key} style={s.resultRow}>
                  <Ionicons
                    name={ok ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={ok ? palette.blue600 : palette.danger500}
                  />
                  <ThemedText style={s.resultName}>{c.food.name}</ThemedText>
                  <ThemedText style={s.resultMeta}>{ok ? 'Saved' : prep ? 'Bad amount' : 'Not saved'}</ThemedText>
                </View>
              );
            })}

            {failedCount > 0 && (
              <TouchableOpacity
                style={s.primaryBtn}
                activeOpacity={0.85}
                onPress={async () => {
                  if (!userId) return;
                  const failedKeys = new Set(results.filter(r => !r.ok).map(r => r.itemId));
                  const retryComponents = activeComponents.filter(c => failedKeys.has(c.key));
                  setPhase('logging');
                  const res = await savedMealService.log(userId, mealId, retryComponents, slot);
                  setResults(prev => {
                    const merged = new Map(prev.map(r => [r.itemId, r]));
                    for (const r of res.results) merged.set(r.itemId, { itemId: r.itemId, ok: r.ok, error: r.error });
                    return [...merged.values()];
                  });
                  setPhase('done');
                }}
              >
                <ThemedText style={s.primaryBtnText}>Retry the {failedCount} that failed</ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={failedCount > 0 ? s.secondaryBtn : s.primaryBtn}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <ThemedText style={failedCount > 0 ? s.secondaryBtnText : s.primaryBtnText}>Done</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centreText: { fontSize: 14, color: palette.gray450 },
  loadErr: { fontSize: 14, color: palette.gray450 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: palette.ink900 },
  pad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 56 },

  lede: { fontSize: 13, color: palette.gray450, lineHeight: 19, marginBottom: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  link: { fontSize: 13, fontWeight: '800', color: palette.blue600 },
  hint: { fontSize: 12.5, color: palette.gray450, textAlign: 'center', marginTop: 10 },

  compCard: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, padding: 12, marginBottom: 10 },
  compCardOff: { opacity: 0.5 },
  compTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkWrap: { paddingVertical: 2 },
  compName: { fontSize: 14.5, fontWeight: '800', color: palette.ink900 },
  compNameOff: { textDecorationLine: 'line-through' },
  compMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  amountInput: {
    width: 82, height: 42, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 15, fontWeight: '700', color: palette.ink900,
  },
  unitChips: { flexDirection: 'row', gap: 6 },
  unitChip: { paddingHorizontal: 12, height: 42, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
  unitChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  unitChipText: { fontSize: 12.5, fontWeight: '700', color: palette.ink700 },
  unitChipTextOn: { color: '#fff' },
  servingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  servingChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  servingChipOn: { backgroundColor: palette.blue50, borderColor: palette.blue500 },
  servingChipText: { fontSize: 12, fontWeight: '600', color: palette.ink700 },
  servingChipTextOn: { color: palette.blue600 },

  totalsCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 14, marginTop: 4 },
  totalsTitle: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  totalsLine: { fontSize: 13, fontWeight: '700', color: palette.ink900, lineHeight: 19 },
  totalsNote: { fontSize: 11.5, color: palette.gray450, marginTop: 8 },

  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  slotChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  slotChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  slotChipTextOn: { color: '#fff' },

  primaryBtn: {
    marginTop: 22, height: 52, borderRadius: radii.xl, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  secondaryBtn: {
    marginTop: 12, height: 52, borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '800', color: palette.ink900 },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  resultName: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.ink900 },
  resultMeta: { fontSize: 12, color: palette.gray450 },
});

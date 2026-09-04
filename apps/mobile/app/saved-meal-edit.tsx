import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useEffect, useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isNutritionSavedMealsEnabled } from '@/lib/flags';
import { authService } from '@/services/auth';
import { foodLogService } from '@/services/food-log-service';
import { savedMealService } from '@/services/saved-meal-service';
import { FoodSearchPicker } from '@/components/nutrition/food-search-picker';
import {
  emptyDraft, draftFromSavedMeal, addComponent, removeComponent, setComponentFood,
  setComponentPortion, reorderComponent, renameDraft, validateDraft,
  computeSavedMealPreview, componentsFromPrefill, unitOptionsForFood,
  type SavedMealDraft, type PrefillComponent,
} from '@/lib/nutrition/saved-meal';
import type { CanonicalFood, LogUnit } from '@/lib/nutrition/food-types';

export default function SavedMealEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; prefill?: string; name?: string; homemade?: string; slot?: string }>();
  const editingId = typeof params.id === 'string' && params.id.length > 0 ? params.id : null;
  const homemade = params.homemade === '1';
  const initialName = typeof params.name === 'string' ? params.name : '';

  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SavedMealDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<'add' | string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!isNutritionSavedMealsEnabled()) { router.replace('/log-food'); return; }
    let active = true;
    (async () => {
      const sess = await authService.getSession();
      if (active) setUserId(sess?.user.id ?? null);

      if (editingId) {
        try {
          const meal = await savedMealService.get(editingId);
          if (active) setDraft(meal ? draftFromSavedMeal(meal) : emptyDraft());
        } catch {
          if (active) { setDraft(emptyDraft()); Alert.alert('Could not load', 'That meal could not be loaded.'); }
        }
        return;
      }

      if (typeof params.prefill === 'string' && params.prefill.length > 0) {
        try {
          const specs = JSON.parse(params.prefill) as PrefillComponent[];
          const ids = [...new Set(specs.map(s => s.foodId))];
          const foods = await Promise.all(ids.map(id => foodLogService.getFood(id).catch(() => null)));
          const byId = new Map<string, CanonicalFood>();
          foods.forEach(f => { if (f) byId.set(f.id, f); });
          if (active) setDraft({ ...emptyDraft(), name: initialName, components: componentsFromPrefill(specs, byId) });
        } catch {
          if (active) setDraft({ ...emptyDraft(), name: initialName });
        }
        return;
      }

      if (active) setDraft({ ...emptyDraft(), name: initialName });
    })();
    return () => { active = false; };
  }, [editingId, params.prefill, initialName, router]);

  const onPickFood = useCallback(async (foodId: string) => {
    const target = pickerFor;
    setPickerFor(null);
    if (!target) return;
    try {
      const food = await foodLogService.getFood(foodId);
      if (!food) return;
      setDraft(d => (d ? (target === 'add' ? addComponent(d, food) : setComponentFood(d, target, food)) : d));
    } catch { /* leave the draft unchanged */ }
  }, [pickerFor]);

  if (!draft) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[s.root, s.centre]}><ActivityIndicator size="large" color={palette.blue500} /></View>
      </>
    );
  }

  const preview = computeSavedMealPreview(draft.components);
  const validation = validateDraft(draft);
  const errFor = (key: string) => validation.componentErrors.find(e => e.key === key)?.message ?? null;

  const save = async () => {
    if (!userId || saving) return;
    if (!validation.ok) { setShowErrors(true); return; }
    setSaving(true);
    try {
      if (editingId) {
        await savedMealService.update(editingId, draft);
        router.back();
      } else {
        const newId = await savedMealService.create(userId, draft);
        // Came here to log a cooked meal, not just to save a definition —
        // hand straight to the log screen so the meal is recorded now.
        if (homemade) {
          router.replace({
            pathname: '/saved-meal-log',
            params: { id: newId, ...(params.slot ? { slot: String(params.slot) } : {}) },
          });
        } else {
          router.back();
        }
      }
    } catch {
      setSaving(false);
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>
            {editingId ? 'Edit meal' : homemade ? 'Build your meal' : 'Create a meal'}
          </ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          {homemade && !editingId && (
            <ThemedText style={s.homemadeHint}>
              Add each ingredient with its amount. We total the verified nutrition facts, then
              log it and keep it in My Meals for next time.
            </ThemedText>
          )}
          <ThemedText style={s.fieldLabel}>Name</ThemedText>
          <TextInput
            style={[s.nameInput, showErrors && validation.nameError && s.inputError]}
            placeholder="e.g. My Breakfast"
            placeholderTextColor={palette.gray300}
            value={draft.name}
            onChangeText={t => setDraft(d => (d ? renameDraft(d, t) : d))}
            maxLength={90}
          />
          {showErrors && validation.nameError && <ThemedText style={s.errText}>{validation.nameError}</ThemedText>}

          <ThemedText style={[s.fieldLabel, { marginTop: 22 }]}>Foods</ThemedText>
          {draft.components.length === 0 && (
            <ThemedText style={s.hint}>Add the foods this meal is made of. Each keeps its own source and nutrition.</ThemedText>
          )}

          {draft.components.map((c, i) => {
            const unitOptions = unitOptionsForFood(c.food);
            const r = preview.resolved.find(x => x.key === c.key);
            const cErr = errFor(c.key);
            return (
              <View key={c.key} style={[s.compCard, showErrors && cErr && s.inputError]}>
                <View style={s.compTop}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.compName}>{c.food.name}</ThemedText>
                    <ThemedText style={s.compMeta}>
                      {c.food.brand ? `${c.food.brand} · ` : ''}Source: {c.food.source}
                    </ThemedText>
                  </View>
                  <View style={s.reorder}>
                    <TouchableOpacity disabled={i === 0} onPress={() => setDraft(d => (d ? reorderComponent(d, i, i - 1) : d))} hitSlop={8}>
                      <Ionicons name="chevron-up" size={16} color={i === 0 ? palette.gray200 : palette.gray450} />
                    </TouchableOpacity>
                    <TouchableOpacity disabled={i === draft.components.length - 1} onPress={() => setDraft(d => (d ? reorderComponent(d, i, i + 1) : d))} hitSlop={8}>
                      <Ionicons name="chevron-down" size={16} color={i === draft.components.length - 1 ? palette.gray200 : palette.gray450} />
                    </TouchableOpacity>
                  </View>
                </View>

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

                <View style={s.compBottom}>
                  <ThemedText style={cErr ? s.errText : s.compPreview}>
                    {cErr ?? (r ? `≈ ${Math.round(r.grams)} g · ${r.energyKcal != null ? `${Math.round(r.energyKcal)} kcal` : 'kcal unknown'}` : '')}
                  </ThemedText>
                  <View style={s.compActions}>
                    <TouchableOpacity onPress={() => setPickerFor(c.key)}>
                      <ThemedText style={s.actionLink}>Change</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDraft(d => (d ? removeComponent(d, c.key) : d))}>
                      <ThemedText style={s.actionLinkMuted}>Remove</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}

          <TouchableOpacity style={s.addRow} onPress={() => setPickerFor('add')}>
            <Ionicons name="add-circle-outline" size={18} color={palette.blue600} />
            <ThemedText style={s.addRowText}>Add food</ThemedText>
          </TouchableOpacity>

          {draft.components.length > 0 && (
            <View style={s.totalsCard}>
              <ThemedText style={s.totalsTitle}>Approximate totals</ThemedText>
              <Row label="Calories" value={`${Math.round(preview.energyKcal)} kcal`} />
              <Row label="Protein" value={`${Math.round(preview.proteinG)} g`} />
              <Row label="Carbs" value={`${Math.round(preview.carbohydrateG)} g`} />
              <Row label="Fat" value={`${Math.round(preview.fatG)} g`} />
              <Row label="Fibre" value={`${Math.round(preview.fibreG)} g`} />
              {(preview.unresolved.length > 0 || preview.completeness.energyKcal.level !== 'complete') && (
                <ThemedText style={s.totalsNote}>
                  {preview.unresolved.length > 0
                    ? 'Fix the amounts flagged above — those foods aren’t counted yet.'
                    : 'Some foods are missing nutrient data, so these totals are a lower bound.'}
                </ThemedText>
              )}
            </View>
          )}

          {showErrors && !validation.ok && validation.componentErrors.some(e => e.key === '') && (
            <ThemedText style={s.errText}>Add at least one food.</ThemedText>
          )}

          <TouchableOpacity
            style={[s.saveBtn, (saving || !validation.ok) && s.saveBtnDisabled]}
            onPress={save}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={s.saveBtnText}>{editingId ? 'Save changes' : 'Save meal'}</ThemedText>}
          </TouchableOpacity>

          {editingId && (
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={() => Alert.alert('Delete this meal?', 'Your logged food history is kept. Only the saved meal is removed.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete', style: 'destructive', onPress: async () => {
                    try { await savedMealService.remove(editingId); router.back(); }
                    catch { Alert.alert('Could not delete', 'Please try again.'); }
                  },
                },
              ])}
            >
              <ThemedText style={s.deleteBtnText}>Delete meal</ThemedText>
            </TouchableOpacity>
          )}
        </ScrollView>

        {pickerFor && (
          <FoodSearchPicker
            title={pickerFor === 'add' ? 'Add a food' : 'Change food'}
            onClose={() => setPickerFor(null)}
            onPick={onPickFood}
          />
        )}
      </View>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.trow}>
      <ThemedText style={s.tlabel}>{label}</ThemedText>
      <ThemedText style={s.tvalue}>{value}</ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  centre: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  pad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 60 },

  fieldLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  hint: { fontSize: 12.5, color: palette.gray450, lineHeight: 18, marginBottom: 6 },
  homemadeHint: { fontSize: 12.5, color: palette.gray450, lineHeight: 18, marginBottom: 16 },
  nameInput: {
    height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 14, fontSize: 15, fontWeight: '600', color: palette.ink900,
  },
  inputError: { borderColor: palette.danger500 },
  errText: { fontSize: 12.5, color: palette.danger500, marginTop: 6 },

  compCard: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, padding: 14, marginTop: 10 },
  compTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  compName: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  compMeta: { fontSize: 11.5, color: palette.gray450, marginTop: 2 },
  reorder: { flexDirection: 'row', gap: 10, paddingTop: 2 },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  amountInput: {
    width: 84, height: 44, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: palette.ink900,
  },
  unitChips: { flexDirection: 'row', gap: 6 },
  unitChip: { paddingHorizontal: 13, height: 44, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
  unitChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  unitChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  unitChipTextOn: { color: '#fff' },
  servingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  servingChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  servingChipOn: { backgroundColor: palette.blue50, borderColor: palette.blue500 },
  servingChipText: { fontSize: 12.5, fontWeight: '600', color: palette.ink700 },
  servingChipTextOn: { color: palette.blue600 },

  compBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  compPreview: { fontSize: 13, fontWeight: '700', color: palette.ink900, flex: 1 },
  compActions: { flexDirection: 'row', gap: 16 },
  actionLink: { fontSize: 13, fontWeight: '800', color: palette.blue600 },
  actionLinkMuted: { fontSize: 13, fontWeight: '700', color: palette.gray450 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  addRowText: { fontSize: 14, fontWeight: '800', color: palette.blue600 },

  totalsCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 16, marginTop: 6 },
  totalsTitle: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  trow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  tlabel: { fontSize: 13.5, color: palette.ink700 },
  tvalue: { fontSize: 13.5, fontWeight: '800', color: palette.ink900 },
  totalsNote: { fontSize: 11.5, color: palette.gray450, marginTop: 10, lineHeight: 16 },

  saveBtn: {
    marginTop: 24, height: 52, borderRadius: radii.xl, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  deleteBtn: { marginTop: 14, height: 48, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: palette.danger600 },
});

import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { foodLogService } from '@/services/food-log-service';
import { isNutritionSavedMealsEnabled } from '@/lib/flags';
import {
  MANUAL_MACRO_FIELDS, MANUAL_MACRO_LABEL, USER_PROVIDED_NUTRITION_DISCLOSURE,
  buildManualHomemadeMealInput, type ManualMacroField,
} from '@/lib/nutrition/homemade-meal';
import type { MealSlot } from '@/lib/nutrition/food-types';

// ACP Intelligence™ — Nutrition N6.5 (Beta Feedback #018). The fork a user
// reaches when a cooked dish isn't in the food database. Two honest routes,
// no LLM, no invented facts:
//   • Build from ingredients → the existing N6 saved-meal editor (a
//     deterministic sum of verified canonical foods, reusable next time).
//   • Enter the numbers      → a plain form; the values are the user's own,
//     logged as an estimate, micros left unknown.

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snack' },
];

const SAVED_MEALS_ENABLED = isNutritionSavedMealsEnabled();

export default function HomemadeMealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; slot?: string }>();
  const initialName = typeof params.name === 'string' ? params.name : '';
  const initialSlot = (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(params.slot as MealSlot)
    ? (params.slot as MealSlot)
    : null;

  const [mode, setMode] = useState<'choose' | 'manual'>('choose');

  // manual form
  const [name, setName] = useState(initialName);
  const [grams, setGrams] = useState('');
  const [portionNote, setPortionNote] = useState('');
  const [macros, setMacros] = useState<Partial<Record<ManualMacroField, string>>>({});
  const [slot, setSlot] = useState<MealSlot | null>(initialSlot);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; grams?: string }>({});
  const [macroErrors, setMacroErrors] = useState<Partial<Record<ManualMacroField, string>>>({});

  const goBuildFromIngredients = () => {
    router.replace({
      pathname: '/saved-meal-edit',
      params: { name: initialName, homemade: '1', ...(initialSlot ? { slot: initialSlot } : {}) },
    });
  };

  const logManual = async () => {
    if (saving) return;
    const built = buildManualHomemadeMealInput({
      name,
      grams: Number(grams),
      portionNote,
      macros,
      mealSlot: slot,
    });
    if (!built.ok || !built.input) {
      setFormErrors(built.formErrors);
      setMacroErrors(built.macroErrors);
      return;
    }
    setFormErrors({});
    setMacroErrors({});
    setSaving(true);
    try {
      const sess = await authService.getSession();
      const uid = sess?.user.id ?? null;
      if (!uid) { setSaving(false); Alert.alert('Sign in required', 'Please sign in to log food.'); return; }
      await foodLogService.logFood(uid, built.input);
      router.back();
    } catch {
      setSaving(false);
      Alert.alert('Could not log meal', 'Please try again.');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => (mode === 'manual' ? setMode('choose') : router.back())}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Homemade meal</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {mode === 'choose' ? (
          <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
            <ThemedText style={s.lede}>
              {initialName
                ? `“${initialName}” isn’t in the food database. `
                : 'Cooked something that isn’t in the food database? '}
              Log it your way — nothing here is guessed for you.
            </ThemedText>

            {SAVED_MEALS_ENABLED && (
              <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={goBuildFromIngredients}>
                <View style={s.cardIcon}><Ionicons name="list-outline" size={18} color={palette.blue600} /></View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.cardTitle}>Build it from ingredients</ThemedText>
                  <ThemedText style={s.cardBody}>
                    Add each ingredient and portion. We add up the verified nutrition facts —
                    it’s exact, and it’s saved to My Meals so next time is one tap.
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => setMode('manual')}>
              <View style={s.cardIcon}><Ionicons name="create-outline" size={18} color={palette.blue600} /></View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.cardTitle}>Enter the numbers</ThemedText>
                <ThemedText style={s.cardBody}>
                  For a takeaway or packaged meal with a label, or a rough estimate. You type
                  the calories and macros; it’s logged as your own estimate.
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>

            <ThemedText style={s.footnote}>
              Your homemade meals never change the shared food database. They’re logged only to
              your own history.
            </ThemedText>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
            <ThemedText style={s.fieldLabel}>Meal name</ThemedText>
            <TextInput
              style={[s.input, formErrors.name && s.inputError]}
              placeholder="e.g. Mum’s beef stew"
              placeholderTextColor={palette.gray300}
              value={name}
              onChangeText={setName}
              maxLength={90}
            />
            {formErrors.name && <ThemedText style={s.errText}>{formErrors.name}</ThemedText>}

            <ThemedText style={s.fieldLabel}>About how much did you eat?</ThemedText>
            <View style={s.gramsRow}>
              <TextInput
                style={[s.gramsInput, formErrors.grams && s.inputError]}
                placeholder="grams"
                placeholderTextColor={palette.gray300}
                value={grams}
                onChangeText={setGrams}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <ThemedText style={s.gramsUnit}>g</ThemedText>
              <TextInput
                style={s.portionNoteInput}
                placeholder="e.g. 1 big bowl (optional)"
                placeholderTextColor={palette.gray300}
                value={portionNote}
                onChangeText={setPortionNote}
                maxLength={60}
              />
            </View>
            {formErrors.grams && <ThemedText style={s.errText}>{formErrors.grams}</ThemedText>}

            <ThemedText style={s.fieldLabel}>Nutrition for that amount</ThemedText>
            <ThemedText style={s.hint}>
              Fill in what you know. Anything left blank stays unknown — it isn’t counted as zero.
            </ThemedText>
            {MANUAL_MACRO_FIELDS.map(field => (
              <View key={field} style={s.macroRow}>
                <ThemedText style={s.macroLabel}>{MANUAL_MACRO_LABEL[field]}</ThemedText>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[s.macroInput, macroErrors[field] && s.inputError]}
                    placeholder="—"
                    placeholderTextColor={palette.gray300}
                    value={macros[field] ?? ''}
                    onChangeText={t => setMacros(m => ({ ...m, [field]: t }))}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  {macroErrors[field] && <ThemedText style={s.errText}>{macroErrors[field]}</ThemedText>}
                </View>
              </View>
            ))}

            <ThemedText style={s.fieldLabel}>Meal</ThemedText>
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

            <ThemedText style={s.disclosure}>{USER_PROVIDED_NUTRITION_DISCLOSURE}</ThemedText>

            <TouchableOpacity
              style={[s.saveBtn, saving && s.saveBtnDisabled]}
              onPress={logManual}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={s.saveBtnText}>Log meal</ThemedText>}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  pad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 60 },

  lede: { fontSize: 13.5, color: palette.gray450, lineHeight: 19, marginBottom: 18 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg,
    padding: 16, marginBottom: 12,
  },
  cardIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: palette.blue50,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  cardBody: { fontSize: 12.5, color: palette.gray450, lineHeight: 18, marginTop: 4 },
  footnote: { fontSize: 11.5, color: palette.gray450, lineHeight: 17, marginTop: 12 },

  fieldLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  hint: { fontSize: 12, color: palette.gray450, lineHeight: 17, marginTop: -2, marginBottom: 10 },
  input: {
    height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 14, fontSize: 15, fontWeight: '600', color: palette.ink900,
  },
  inputError: { borderColor: palette.danger500 },
  errText: { fontSize: 12, color: palette.danger500, marginTop: 5 },

  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gramsInput: {
    width: 84, height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: palette.ink900,
  },
  gramsUnit: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  portionNoteInput: {
    flex: 1, height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 13.5, color: palette.ink900,
  },

  macroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  macroLabel: { fontSize: 13.5, color: palette.ink700, width: 130, paddingTop: 13 },
  macroInput: {
    height: 44, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 15, fontWeight: '700', color: palette.ink900,
  },

  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  slotChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  slotChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  slotChipTextOn: { color: '#fff' },

  disclosure: { fontSize: 11.5, color: palette.gray450, lineHeight: 16, marginTop: 20, fontStyle: 'italic' },

  saveBtn: {
    marginTop: 18, height: 52, borderRadius: radii.xl, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

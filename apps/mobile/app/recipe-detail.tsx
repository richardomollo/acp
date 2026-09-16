// Lana Nutrition — Recipes V1. ONE canonical Recipe Detail implementation
// (§7/§18), used by Recipes browse, Recipes search, AND a suggested-meal's
// "View recipe" — never a second/duplicate detail screen.
//
// Portion → nutrition uses the EXACT SAME deterministic maths as normal food
// search (resolveGrams/computeLogSnapshot), and "Add to today" calls the
// EXACT SAME foodLogService.logFood({foodId, quantity, unit:'g', ...}) a
// normal food-search log uses — no independent calculation path (§9/§22).
import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/services/auth';
import { recipeService } from '@/services/recipe-service';
import { foodLogService } from '@/services/food-log-service';
import { resolveGrams, computeLogSnapshot, PortionError } from '@/lib/nutrition/food-nutrition';
import { MACRO_DISPLAY_ORDER, KEY_NUTRIENTS, SECONDARY_NUTRIENTS, NUTRIENT_LABEL, NUTRIENT_UNIT, formatNutrientAmount } from '@/lib/nutrition/nutrient-display';
import { NutrientRow } from '@/components/nutrition/nutrient-list';
import type { CanonicalFood, MealSlot } from '@/lib/nutrition/food-types';
import type { RecipeRecord, RecipeIngredient } from '@/lib/nutrition/recipe-model';

const QUICK_GRAMS = [100, 150, 200, 250];

// §7B — user-facing provenance wording. Deliberately NOT foodProvenanceTag/
// foodProvenanceDisclosure's generic strings — those stay generic for every
// other standard_recipe_verified food that may exist later; this is the
// specific, richer KFCT copy the spec asks for, kept local to this screen.
function provenanceCopy(food: CanonicalFood): { headline: string; body: string } | null {
  if (food.source !== 'FAO/Government of Kenya' || food.compositionMethod !== 'standard_recipe_verified') return null;
  return {
    headline: 'Verified source · Kenya Food Composition Tables',
    body: 'This nutrition information comes from the Kenya Food Composition Tables, published by the Government of Kenya with FAO support.',
  };
}

export default function RecipeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ foodId?: string; slot?: string }>();
  const foodId = params.foodId ? String(params.foodId) : null;
  const initialSlot = (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(params.slot as any)
    ? (params.slot as MealSlot) : null;

  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [food, setFood] = useState<CanonicalFood | null>(null);
  const [recipe, setRecipe] = useState<RecipeRecord | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [grams, setGrams] = useState('100');
  const [showAllNutrients, setShowAllNutrients] = useState(false);
  const [showPer100g, setShowPer100g] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const session = await authService.getSession();
      if (active) setUserId(session?.user.id ?? null);
      if (!foodId) { if (active) setState('error'); return; }
      setState('loading');
      try {
        const result = await recipeService.getRecipeByFoodId(foodId);
        if (!active) return;
        if (!result) { setState('unavailable'); return; }
        setFood(result.food); setRecipe(result.recipe); setIngredients(result.ingredients);
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => { active = false; };
  }, [foodId]));

  // §8/§9 — deterministic portion preview, the SAME pure maths food logging
  // uses. `null` preview = invalid amount; never a silently-wrong number.
  const preview = useMemo(() => {
    if (!food) return null;
    const n = Number(grams);
    try {
      const g = resolveGrams(food, n, 'g');
      return { grams: g, nutrients: computeLogSnapshot(food, g) };
    } catch (e) {
      return { error: e instanceof PortionError ? e.message : 'Enter a valid amount.' };
    }
  }, [food, grams]);

  const per100 = food?.nutrients ?? null;
  const shown = showPer100g ? per100 : (preview && 'nutrients' in preview ? preview.nutrients : null);

  const addToToday = async () => {
    if (!userId || !food || !preview || 'error' in preview || saving) return;
    setSaving(true);
    try {
      await foodLogService.logFood(userId, {
        foodId: food.id,
        displayName: food.name,
        quantity: Number(grams),
        unit: 'g',
        mealSlot: initialSlot,
        captureMethod: 'search',
      });
      setLogged(true);
    } catch {
      Alert.alert('Could not log this recipe', 'Please try again.'); // N1 §32 — no false success
    } finally {
      setSaving(false);
    }
  };

  const prov = food ? provenanceCopy(food) : null;

  // Same soft blue top wash as Today/Recipes/meal-detail — one nutrition
  // product, not a separate look, behind every state of this screen.
  const TopFade = () => (
    <LinearGradient colors={[palette.blue100, 'rgba(208,224,255,0)']} style={s.topFadeBg} pointerEvents="none" />
  );

  if (state === 'loading') {
    return (
      <View style={s.root}>
        <TopFade />
        <SafeAreaView edges={['top']} style={s.center}><ActivityIndicator color={palette.blue500} /></SafeAreaView>
      </View>
    );
  }
  if (state === 'unavailable' || state === 'error' || !food || !recipe) {
    return (
      <View style={s.root}>
        <TopFade />
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" accessibilityRole="button"><Ionicons name="chevron-back" size={24} color={palette.ink900} /></TouchableOpacity>
        </SafeAreaView>
        <View style={s.center}>
          <ThemedText style={s.unavailableText}>
            {state === 'error' ? "Couldn't load this recipe." : 'This recipe is not available right now.'}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <TopFade />
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={palette.ink900} />
        </TouchableOpacity>
      </SafeAreaView>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <ThemedText style={s.name}>{food.name}</ThemedText>
        {recipe.category && <ThemedText style={s.category}>{recipe.category}</ThemedText>}

        {/* §7B — provenance, product wording only; no source_type/composition_method/ids exposed */}
        {prov && (
          <View style={s.provCard}>
            <ThemedText style={s.provHeadline}>{prov.headline}</ThemedText>
            <ThemedText style={s.provBody}>{prov.body}</ThemedText>
          </View>
        )}

        {/* §8 — portion. Gram-based only; no invented serving unit. */}
        <ThemedText style={s.sectionLabel}>Amount</ThemedText>
        <View style={s.amountRow}>
          <TextInput
            style={s.amountInput}
            value={grams}
            onChangeText={setGrams}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel="Amount in grams"
          />
          <ThemedText style={s.amountUnit}>g</ThemedText>
        </View>
        <View style={s.quickRow}>
          {QUICK_GRAMS.map(g => (
            <TouchableOpacity key={g} style={[s.quickChip, grams === String(g) && s.quickChipOn]} onPress={() => setGrams(String(g))}>
              <ThemedText style={[s.quickChipText, grams === String(g) && s.quickChipTextOn]}>{g}g</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        {preview && 'error' in preview && <ThemedText style={s.errorText}>{preview.error}</ThemedText>}

        {/* §7C — nutrition for the selected amount, optional per-100g toggle */}
        <View style={s.nutritionHeaderRow}>
          <ThemedText style={s.sectionLabel}>
            Nutrition in {showPer100g ? '100 g' : `${grams || '0'} g`}
          </ThemedText>
          <TouchableOpacity onPress={() => setShowPer100g(v => !v)}>
            <ThemedText style={s.toggleLink}>{showPer100g ? 'Show for amount' : 'Show per 100 g'}</ThemedText>
          </TouchableOpacity>
        </View>
        {shown && (
          <>
            <View style={s.macroGrid}>
              {MACRO_DISPLAY_ORDER.map(k => (
                <View key={k} style={s.macroCell}>
                  <ThemedText style={s.macroValue}>
                    {shown[k] != null ? formatNutrientAmount(shown[k] as number, NUTRIENT_UNIT[k]) : '—'}
                  </ThemedText>
                  <ThemedText style={s.macroUnit}>{NUTRIENT_UNIT[k]}</ThemedText>
                  <ThemedText style={s.macroLabel}>{NUTRIENT_LABEL[k]}</ThemedText>
                </View>
              ))}
            </View>

            <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>Micronutrients</ThemedText>
            <View style={s.nutrientListCard}>
              {KEY_NUTRIENTS.map(k => <NutrientRow key={k} nutrientKey={k} value={shown[k]} />)}
            </View>
            {showAllNutrients && (
              <View style={[s.nutrientListCard, { marginTop: 8 }]}>
                {SECONDARY_NUTRIENTS.map(k => <NutrientRow key={k} nutrientKey={k} value={shown[k]} />)}
              </View>
            )}
            <TouchableOpacity onPress={() => setShowAllNutrients(v => !v)} style={s.viewAllBtn}>
              <ThemedText style={s.toggleLink}>{showAllNutrients ? 'Show fewer nutrients' : 'View all nutrients'}</ThemedText>
            </TouchableOpacity>
          </>
        )}

        {/* §7D — ingredients, grams authoritative; household measure display-only */}
        {ingredients.length > 0 && (
          <>
            <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>Ingredients</ThemedText>
            <View style={s.nutrientListCard}>
              {ingredients.map(ing => (
                <View key={ing.id} style={s.ingredientRow}>
                  {/* §D — a small source-extraction gap: ~21% of imported
                      rows have a blank ingredient_name (the household
                      measure text wasn't split from the name at extraction
                      time — see the KFCT V1 data quality report). Rather
                      than show a blank name next to a redundant measure,
                      fall back to the one text the source DID give us —
                      never fabricated, never a guessed split. */}
                  {ing.ingredientName.trim() ? (
                    <>
                      <ThemedText style={s.ingredientName} numberOfLines={2}>{ing.ingredientName}</ThemedText>
                      <ThemedText style={s.ingredientAmount}>
                        {ing.householdMeasure ? ing.householdMeasure : `${ing.grams} g`}
                      </ThemedText>
                    </>
                  ) : (
                    <ThemedText style={s.ingredientName} numberOfLines={2}>
                      {ing.householdMeasure || `${ing.grams} g`}
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
            {recipe.serves != null && (
              <ThemedText style={s.servesNote}>Makes {recipe.serves} {recipe.serves === 1 ? 'serving' : 'servings'} as prepared.</ThemedText>
            )}
          </>
        )}
        {/* §7E/§10 — preparation. Prep/cook time (when the source gives them)
            shown first, exactly as reported. Below that, the source's own
            ordered cooking METHOD (Lana Recipes V1 — KFCT method import) —
            source-authored KFCT/FAO text, never LLM-generated, never
            invented, never paraphrased (lib/nutrition/recipe-instructions.ts
            is the one deterministic parser that produced it). Multi-part
            recipes (e.g. a filling then a casing then frying) keep their
            source section headings and restart step numbering per section,
            matching how the book itself presents them. Only when the source
            text couldn't be reliably extracted (REVIEW_REQUIRED — see the
            KFCT recipe-methods import report) does this fall back to an
            honest "not available" note instead of guessing at steps. */}
        {(recipe.preparationTimeText || recipe.cookingTimeText) && (
          <>
            <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>Preparation</ThemedText>
            <View style={s.nutrientListCard}>
              {recipe.preparationTimeText && (
                <View style={s.ingredientRow}>
                  <ThemedText style={s.ingredientName}>Prep time</ThemedText>
                  <ThemedText style={s.ingredientAmount}>{recipe.preparationTimeText}</ThemedText>
                </View>
              )}
              {recipe.cookingTimeText && (
                <View style={s.ingredientRow}>
                  <ThemedText style={s.ingredientName}>Cook time</ThemedText>
                  <ThemedText style={s.ingredientAmount}>{recipe.cookingTimeText}</ThemedText>
                </View>
              )}
            </View>
          </>
        )}
        {recipe.instructions ? (
          <>
            <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>Method</ThemedText>
            {recipe.instructions.sections.map((section, si) => (
              <View key={si} style={si > 0 ? { marginTop: 16 } : undefined}>
                {section.heading && (
                  <ThemedText style={s.methodHeading}>{section.heading}</ThemedText>
                )}
                {section.steps.map(step => (
                  <View key={step.step} style={s.methodStepRow}>
                    <ThemedText style={s.methodStepNum}>{step.step}</ThemedText>
                    <ThemedText style={s.methodStepText}>{step.text}</ThemedText>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : (
          (recipe.preparationTimeText || recipe.cookingTimeText) && (
            <ThemedText style={s.servesNote}>
              Step-by-step instructions aren&apos;t available for this recipe yet.
            </ThemedText>
          )
        )}
      </ScrollView>

      <View style={s.footer}>
        <Button
          variant="primary"
          size="lg"
          block
          label={logged ? 'Added ✓' : 'Add to today'}
          loading={saving}
          disabled={!preview || 'error' in preview || logged}
          onPress={addToToday}
          accessibilityLabel="Add to today"
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'transparent' },
  unavailableText: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', paddingHorizontal: 32 },
  body: { paddingHorizontal: 20, paddingBottom: 24 },
  name: { fontSize: fontSize.xl, fontWeight: '700', color: palette.ink900 },
  category: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2, textTransform: 'capitalize' },
  provCard: { backgroundColor: palette.blue50 ?? '#eff6ff', borderRadius: radii.lg, padding: 14, marginTop: 14 },
  provHeadline: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900 },
  provBody: { fontSize: fontSize.xs, color: palette.gray450, marginTop: 4, lineHeight: 18 },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900, marginTop: 20, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountInput: {
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: fontSize.lg, fontWeight: '600', color: palette.ink900, minWidth: 90, textAlign: 'center',
  },
  amountUnit: { fontSize: fontSize.base, color: palette.gray450 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: palette.hairline },
  quickChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  quickChipText: { fontSize: fontSize.xs, color: palette.ink700, fontWeight: '600' },
  quickChipTextOn: { color: '#fff' },
  errorText: { fontSize: fontSize.xs, color: palette.danger600 ?? '#dc2626', marginTop: 8 },
  nutritionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLink: { fontSize: fontSize.xs, fontWeight: '600', color: palette.blue500 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  macroCell: { flexBasis: '22%', alignItems: 'center', backgroundColor: palette.surfaceMuted, borderRadius: radii.md, paddingVertical: 10 },
  macroValue: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  macroUnit: { fontSize: fontSize.xs, color: palette.gray450 },
  macroLabel: { fontSize: fontSize.xs, color: palette.gray450, marginTop: 2, textAlign: 'center' },
  nutrientListCard: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, overflow: 'hidden' },
  viewAllBtn: { alignSelf: 'center', marginTop: 10 },
  ingredientRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  ingredientName: { flex: 1, fontSize: fontSize.sm, color: palette.ink900, textTransform: 'capitalize', paddingRight: 8 },
  ingredientAmount: { fontSize: fontSize.sm, color: palette.gray450, fontWeight: '600' },
  servesNote: { fontSize: fontSize.xs, color: palette.gray450, marginTop: 8 },
  methodHeading: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900, marginBottom: 8 },
  methodStepRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  methodStepNum: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.blue500,
    width: 20, lineHeight: 20, textAlign: 'center',
    backgroundColor: palette.blue50, borderRadius: 10, overflow: 'hidden',
  },
  methodStepText: { flex: 1, fontSize: fontSize.sm, color: palette.ink900, lineHeight: 20 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: palette.hairline },
});

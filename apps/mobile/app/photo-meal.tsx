import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { foodLogService } from '@/services/food-log-service';
import { resolveGrams, computeLogSnapshot, PortionError } from '@/lib/nutrition/food-nutrition';
import { isNutritionCameraEnabled, isNutritionSavedMealsEnabled } from '@/lib/flags';
import { captureMealPhoto, pickMealPhotoFromLibrary, type PhotoCaptureResult } from '@/lib/nutrition/photo-capture';
import { analysePhoto, type PhotoAnalysisFailure } from '@/lib/nutrition/nutrition-photo-request';
import {
  candidateToItem, manualItem, setItemFood, removeItem, restoreItem,
  rankCanonicalMatches, isConfidentMatch, allItemsMatched,
  type PhotoConfirmationItem,
} from '@/lib/nutrition/nutrition-photo';
import { prepareBatchLog, summariseBatch, type BatchItemResult } from '@/lib/nutrition/nutrition-photo-batch';
import type { LogUnit, MealSlot } from '@/lib/nutrition/food-types';

// Nutrition N5 — camera-assisted logging. The photo only ACCELERATES creating
// the same N1 food evidence: vision names likely foods → the user confirms a
// canonical match for each → confirms a real portion → the deterministic N1
// engine calculates → foodLogService persists normal rows (capture_method =
// 'camera'). The photo is never stored and never becomes a nutrition fact.

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snack' },
];

type Phase = 'idle' | 'capturing' | 'analysing' | 'review' | 'portions' | 'logging' | 'done';

const CONF_PREFIX: Record<'high' | 'medium' | 'low', string> = {
  high: 'Looks like', medium: 'Might be', low: 'Possibly',
};

type CaptureFailReason = Extract<PhotoCaptureResult, { ok: false }>['reason'];

function captureFailCopy(reason: CaptureFailReason): string {
  switch (reason) {
    case 'permission_denied': return 'Camera or photo access is off. You can still add foods by search.';
    case 'unsupported': return 'That image type isn’t supported. Try a JPEG or PNG photo.';
    default: return 'That photo didn’t work. Try another, or add foods by search.';
  }
}

/**
 * N10 N5 device defect — the analysis failure copy used to collapse network /
 * config / service outages into "Couldn't read that photo", implying the
 * user's photo was bad. These are the three honest buckets from §14.
 */
function cameraFailCopy(reason: PhotoAnalysisFailure): string {
  switch (reason) {
    case 'unreadable':
      return 'Couldn’t identify foods in that photo. Try another photo, or add foods by search.';
    case 'invalid_image':
    case 'too_large':
      return 'We couldn’t process that photo. Try another photo, or add foods by search.';
    // network | unavailable | rate_limited | server_error | timeout | auth | disabled
    default:
      return 'Photo analysis isn’t available right now. You can still add foods by search.';
  }
}

export default function PhotoMealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string; source?: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [items, setItems] = useState<PhotoConfirmationItem[]>([]);
  const [slot, setSlot] = useState<MealSlot | null>(
    (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(params.slot as MealSlot) ? (params.slot as MealSlot) : null,
  );
  const [prepErrors, setPrepErrors] = useState<{ itemId: string; message: string }[]>([]);
  const [resultMap, setResultMap] = useState<Record<string, BatchItemResult>>({});
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const didAutoStart = useRef(false);

  useEffect(() => {
    if (!isNutritionCameraEnabled()) { router.replace('/log-food'); return; }
    authService.getSession().then(sess => {
      setUserId(sess?.user.id ?? null);
      setAccessToken(sess?.access_token ?? null);
    });
  }, [router]);

  const runAnalysis = useCallback(async (photo: { base64: string; mimeType: string }, token: string) => {
    setPhase('analysing');
    setNotice(null);
    const outcome = await analysePhoto(token, photo);
    if (!outcome.ok) {
      // N10 N5 device defect — three honest buckets (§14). Never blame the
      // user's photo when the failure was network / config / service.
      if (__DEV__) console.warn('[n5] analysis failed:', outcome.reason); // coarse only — no image/labels/token (§4)
      setNotice(cameraFailCopy(outcome.reason));
      setPhase('idle');
      return;
    }

    setUncertain(outcome.result.uncertain);
    // Deterministic canonical matching (no LLM): search + lexical rank, and
    // pre-select only a confident top match — the user still confirms every one.
    const built = await Promise.all(
      outcome.result.foods.map(async candidate => {
        const item = candidateToItem(candidate);
        try {
          const results = await foodLogService.searchFoods(candidate.label);
          const ranked = rankCanonicalMatches(candidate.label, results);
          if (isConfidentMatch(ranked[0])) {
            const food = await foodLogService.getFood(ranked[0].result.id);
            if (food) return setItemFood(item, food);
          }
        } catch { /* leave as needs_match — the user picks manually */ }
        return item;
      }),
    );
    setItems(built);
    setPhase('review');
  }, []);

  const startCapture = useCallback(async (source: 'camera' | 'library') => {
    if (!accessToken) { setNotice('Please sign in to use meal photos.'); return; }
    setPhase('capturing');
    setNotice(null);
    const shot = source === 'camera' ? await captureMealPhoto() : await pickMealPhotoFromLibrary();
    if (!shot.ok) {
      if (shot.reason === 'cancelled') { setPhase('idle'); return; }
      setNotice(captureFailCopy(shot.reason));
      setPhase('idle');
      return;
    }
    await runAnalysis({ base64: shot.base64, mimeType: shot.mimeType }, accessToken);
  }, [accessToken, runAnalysis]);

  // Optional deep-link: /photo-meal?source=camera launches straight into capture.
  useEffect(() => {
    if (didAutoStart.current || !accessToken) return;
    if (params.source === 'camera' || params.source === 'library') {
      didAutoStart.current = true;
      startCapture(params.source);
    }
  }, [accessToken, params.source, startCapture]);

  const patchItem = (id: string, patch: Partial<PhotoConfirmationItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const onPickFood = useCallback(async (foodId: string) => {
    const targetId = pickerItemId;
    setPickerItemId(null);
    if (!targetId) return;
    try {
      const food = await foodLogService.getFood(foodId);
      if (!food) return;
      setItems(prev => prev.map(i => (i.id === targetId ? setItemFood(i, food) : i)));
    } catch { /* ignore — the item stays unmatched */ }
  }, [pickerItemId]);

  const activeItems = items.filter(i => i.status !== 'removed');
  const canContinue = allItemsMatched(items);

  const goToPortions = () => {
    const { errors } = prepareBatchLog(items, slot);
    setPrepErrors(errors);
    setPhase('portions');
  };

  const runLog = async (retryOnly: boolean) => {
    if (!userId) return;
    const { prepared, errors } = prepareBatchLog(items, slot);
    setPrepErrors(errors);
    if (errors.length > 0 && !retryOnly) return; // fix the bad portions first
    const targets = retryOnly
      ? prepared.filter(p => resultMap[p.itemId] && !resultMap[p.itemId].ok)
      : prepared;
    if (targets.length === 0) return;

    setPhase('logging');
    const res = await foodLogService.logFoodBatch(
      userId,
      targets.map(p => ({ itemId: p.itemId, input: p.input })),
    );
    setResultMap(prev => {
      const next = { ...prev };
      for (const r of res) next[r.itemId] = r;
      return next;
    });
    setPhase('done');
  };

  const preparedForDone = prepareBatchLog(items, slot).prepared;
  const doneResults = preparedForDone
    .map(p => resultMap[p.itemId])
    .filter((r): r is BatchItemResult => !!r);
  const outcome = summariseBatch(doneResults);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => (phase === 'portions' ? setPhase('review') : router.back())}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>
            {phase === 'portions' ? 'How much of each?' : phase === 'done' ? 'Logged' : 'Photograph a meal'}
          </ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {phase === 'idle' && (
          <ScrollView contentContainerStyle={s.pad}>
            <ThemedText style={s.lede}>
              Take a photo of your plate and we’ll suggest the foods on it. You confirm every one — the
              photo isn’t saved and never sets the nutrition numbers itself.
            </ThemedText>
            {notice && <ThemedText style={s.noticeText}>{notice}</ThemedText>}
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => startCapture('camera')}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={18} color="#fff" />
              <ThemedText style={s.primaryBtnText}>Take a photo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => startCapture('library')}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={18} color={palette.ink900} />
              <ThemedText style={s.secondaryBtnText}>Choose from library</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => router.replace('/log-food')}>
              <ThemedText style={s.linkBtnText}>Search for a food instead</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        )}

        {(phase === 'capturing' || phase === 'analysing') && (
          <View style={s.centre}>
            <ActivityIndicator size="large" color={palette.blue500} />
            <ThemedText style={s.centreText}>
              {phase === 'analysing' ? 'Looking at your meal…' : 'Opening camera…'}
            </ThemedText>
          </View>
        )}

        {phase === 'review' && (
          <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
            {uncertain && (
              <View style={s.uncertainCard}>
                <ThemedText style={s.uncertainText}>
                  The photo was a little hard to read. Check each suggestion, change anything that’s off,
                  and add whatever’s missing.
                </ThemedText>
              </View>
            )}
            {!uncertain && (
              <ThemedText style={s.lede}>
                Here’s what we think is on the plate. Confirm or change each one, then set the amounts.
              </ThemedText>
            )}

            {activeItems.length === 0 && (
              <ThemedText style={s.noticeText}>
                No foods picked out. Add them with “Add a food” below.
              </ThemedText>
            )}

            {activeItems.map(item => (
              <View key={item.id} style={s.itemCard}>
                {item.visionLabel && (
                  <ThemedText style={s.visionLabel}>
                    {(item.visionConfidence ? CONF_PREFIX[item.visionConfidence] : 'Possibly') + ' '}
                    <ThemedText style={s.visionLabelStrong}>{item.visionLabel}</ThemedText>
                  </ThemedText>
                )}
                {item.status === 'matched' && item.food ? (
                  <>
                    <ThemedText style={s.matchName}>{item.food.name}</ThemedText>
                    <ThemedText style={s.matchMeta}>
                      {item.food.brand ? `${item.food.brand} · ` : ''}Source: {item.food.source}
                    </ThemedText>
                    <View style={s.itemActions}>
                      <TouchableOpacity onPress={() => setPickerItemId(item.id)}>
                        <ThemedText style={s.actionLink}>Change</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => patchItem(item.id, removeItem(item))}>
                        <ThemedText style={s.actionLinkMuted}>Remove</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <ThemedText style={s.needsMatch}>Not matched to a food yet.</ThemedText>
                    <View style={s.itemActions}>
                      <TouchableOpacity onPress={() => setPickerItemId(item.id)}>
                        <ThemedText style={s.actionLink}>Choose food</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => router.push({
                          pathname: '/homemade-meal',
                          params: {
                            ...(item.visionLabel ? { name: item.visionLabel } : {}),
                            ...(slot ? { slot } : {}),
                          },
                        })}
                      >
                        <ThemedText style={s.actionLink}>Log as homemade</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => patchItem(item.id, removeItem(item))}>
                        <ThemedText style={s.actionLinkMuted}>Remove</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ))}

            {items.some(i => i.status === 'removed') && (
              <View style={s.removedWrap}>
                <ThemedText style={s.sectionLabel}>Removed</ThemedText>
                {items.filter(i => i.status === 'removed').map(item => (
                  <View key={item.id} style={s.removedRow}>
                    <ThemedText style={s.removedName}>
                      {item.food?.name ?? item.visionLabel ?? 'Food'}
                    </ThemedText>
                    <TouchableOpacity onPress={() => patchItem(item.id, restoreItem(item))}>
                      <ThemedText style={s.actionLink}>Undo</ThemedText>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={s.addRow}
              onPress={() => {
                const it = manualItem();
                setItems(prev => [...prev, it]);
                setPickerItemId(it.id);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={palette.blue600} />
              <ThemedText style={s.addRowText}>Add a food</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.primaryBtn, !canContinue && s.btnDisabled]}
              onPress={goToPortions}
              disabled={!canContinue}
              activeOpacity={0.85}
            >
              <ThemedText style={s.primaryBtnText}>Set amounts</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => startCapture('camera')}>
              <ThemedText style={s.linkBtnText}>Retake photo</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        )}

        {phase === 'portions' && (
          <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
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

            {activeItems.filter(i => i.status === 'matched' && i.food).map(item => {
              const food = item.food!;
              const unitOptions: LogUnit[] = [
                'g',
                ...(food.densityGPerMl != null ? ['ml' as LogUnit] : []),
                ...(food.servings.length > 0 ? ['serving' as LogUnit] : []),
              ];
              let preview: { grams: number; kcal: number | null } | null = null;
              let err: string | null = null;
              try {
                const grams = resolveGrams(food, Number(item.quantity), item.unit, item.servingLabel);
                preview = { grams, kcal: computeLogSnapshot(food, grams).energyKcal };
              } catch (e) {
                err = e instanceof PortionError ? e.message : 'Enter a valid amount.';
              }
              return (
                <View key={item.id} style={s.portionCard}>
                  <ThemedText style={s.matchName}>{food.name}</ThemedText>
                  <View style={s.amountRow}>
                    <TextInput
                      style={s.amountInput}
                      value={item.quantity}
                      onChangeText={t => patchItem(item.id, { quantity: t })}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <View style={s.unitChips}>
                      {unitOptions.map(u => (
                        <TouchableOpacity
                          key={u}
                          style={[s.unitChip, item.unit === u && s.unitChipOn]}
                          onPress={() => patchItem(item.id, {
                            unit: u,
                            servingLabel: u === 'serving' ? (item.servingLabel ?? food.servings[0]?.label ?? null) : null,
                          })}
                        >
                          <ThemedText style={[s.unitChipText, item.unit === u && s.unitChipTextOn]}>{u}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {item.unit === 'serving' && food.servings.length > 0 && (
                    <View style={s.servingWrap}>
                      {food.servings.map(sv => (
                        <TouchableOpacity
                          key={sv.label}
                          style={[s.servingChip, item.servingLabel === sv.label && s.servingChipOn]}
                          onPress={() => patchItem(item.id, { servingLabel: sv.label })}
                        >
                          <ThemedText style={[s.servingChipText, item.servingLabel === sv.label && s.servingChipTextOn]}>
                            {sv.label}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <ThemedText style={err ? s.previewError : s.previewText}>
                    {err ?? `≈ ${Math.round(preview!.grams)} g · ${preview!.kcal != null ? `${Math.round(preview!.kcal)} kcal` : 'kcal unknown'}`}
                  </ThemedText>
                </View>
              );
            })}

            {prepErrors.length > 0 && (
              <ThemedText style={s.previewError}>
                Fix the amounts above before logging.
              </ThemedText>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, prepErrors.length > 0 && s.btnDisabled]}
              onPress={() => runLog(false)}
              disabled={prepErrors.length > 0}
              activeOpacity={0.85}
            >
              <ThemedText style={s.primaryBtnText}>
                Log {activeItems.filter(i => i.status === 'matched' && i.food).length} food{activeItems.filter(i => i.status === 'matched' && i.food).length === 1 ? '' : 's'}
              </ThemedText>
            </TouchableOpacity>
          </ScrollView>
        )}

        {phase === 'logging' && (
          <View style={s.centre}>
            <ActivityIndicator size="large" color={palette.blue500} />
            <ThemedText style={s.centreText}>Saving your foods…</ThemedText>
          </View>
        )}

        {phase === 'done' && (
          <ScrollView contentContainerStyle={s.pad}>
            <ThemedText style={s.lede}>
              {outcome.failedCount === 0
                ? `Logged ${outcome.loggedCount} food${outcome.loggedCount === 1 ? '' : 's'}.`
                : `Logged ${outcome.loggedCount} of ${outcome.results.length}. ${outcome.failedCount} didn’t save.`}
            </ThemedText>

            {preparedForDone.map(p => {
              const r = resultMap[p.itemId];
              const name = items.find(i => i.id === p.itemId)?.food?.name ?? 'Food';
              return (
                <View key={p.itemId} style={s.resultRow}>
                  <Ionicons
                    name={r?.ok ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={r?.ok ? palette.blue600 : palette.danger500}
                  />
                  <ThemedText style={s.resultName}>{name}</ThemedText>
                  <ThemedText style={s.resultMeta}>{r?.ok ? 'Saved' : 'Not saved'}</ThemedText>
                </View>
              );
            })}

            {outcome.failedCount > 0 && (
              <TouchableOpacity style={s.primaryBtn} onPress={() => runLog(true)} activeOpacity={0.85}>
                <ThemedText style={s.primaryBtnText}>Retry the {outcome.failedCount} that failed</ThemedText>
              </TouchableOpacity>
            )}

            {/* Nutrition N6 — turn a fully-logged photo into a reusable saved
                meal (§24). Explicit, never automatic; reuses the same prefill
                path as "Save these as a meal" on Today Nutrition. */}
            {isNutritionSavedMealsEnabled() && outcome.failedCount === 0 && outcome.loggedCount > 0 && (
              <TouchableOpacity
                style={s.secondaryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const prefill = preparedForDone
                    .filter(p => resultMap[p.itemId]?.ok && p.input.foodId)
                    .map(p => ({
                      foodId: p.input.foodId as string,
                      quantity: p.input.quantity,
                      unit: p.input.unit,
                      servingLabel: p.input.unit === 'serving' ? (p.input.servingLabel ?? null) : null,
                    }));
                  router.replace({ pathname: '/saved-meal-edit', params: { prefill: JSON.stringify(prefill) } });
                }}
              >
                <ThemedText style={s.secondaryBtnText}>Save this as a meal</ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={outcome.failedCount > 0 ? s.secondaryBtn : s.primaryBtn}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <ThemedText style={outcome.failedCount > 0 ? s.secondaryBtnText : s.primaryBtnText}>Done</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        )}

        {pickerItemId && (
          <FoodPicker
            initialQuery={items.find(i => i.id === pickerItemId)?.visionLabel ?? ''}
            onClose={() => setPickerItemId(null)}
            onPick={onPickFood}
          />
        )}
      </View>
    </>
  );
}

// Inline canonical-food search — the same deterministic search Log-food uses.
// No invented results; a search failure shows a retry, never a fake match.
function FoodPicker({
  initialQuery, onClose, onPick,
}: { initialQuery: string; onClose: () => void; onPick: (foodId: string) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ id: string; name: string; brand: string | null; isGeneric: boolean; energyKcalPer100g: number | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); setError(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        setResults(await foodLogService.searchFoods(q));
        setError(false);
      } catch {
        setResults([]);
        setError(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  return (
    <View style={s.picker}>
      <SafeAreaView edges={['top']} style={s.pickerHeader}>
        <TouchableOpacity style={s.backBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Choose a food</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>
      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={palette.gray300} />
        <TextInput
          style={s.searchInput}
          placeholder="Search a food"
          placeholderTextColor={palette.gray300}
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.listPad}>
        {searching && <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue500} />}
        {!searching && error && <ThemedText style={s.noticeText}>Couldn’t search right now. Adjust the text to retry.</ThemedText>}
        {!searching && !error && query.trim().length >= 2 && results.length === 0 && (
          <ThemedText style={s.emptyText}>No foods matched “{query.trim()}”.</ThemedText>
        )}
        {!searching && results.map(r => (
          <TouchableOpacity key={r.id} style={s.row} onPress={() => onPick(r.id)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.rowName}>{r.name}</ThemedText>
              <ThemedText style={s.rowMeta}>
                {r.brand ? `${r.brand} · ` : r.isGeneric ? 'Generic · ' : ''}
                {r.energyKcalPer100g != null ? `${Math.round(r.energyKcalPer100g)} kcal / 100 g` : 'nutrition varies'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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

  pad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },
  lede: { fontSize: 13.5, color: palette.gray450, lineHeight: 19, marginBottom: 18 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  centreText: { fontSize: 14, color: palette.gray450 },

  primaryBtn: {
    marginTop: 14, height: 52, borderRadius: radii.xl, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  secondaryBtn: {
    marginTop: 12, height: 52, borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  btnDisabled: { opacity: 0.45 },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkBtnText: { fontSize: 13.5, fontWeight: '700', color: palette.blue600 },

  noticeText: { fontSize: 13, color: palette.danger500, marginBottom: 12, lineHeight: 18 },

  uncertainCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 14, marginBottom: 16 },
  uncertainText: { fontSize: 13, color: palette.ink700, lineHeight: 18 },

  itemCard: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, padding: 14, marginBottom: 10 },
  visionLabel: { fontSize: 12, color: palette.gray450, marginBottom: 4 },
  visionLabelStrong: { fontSize: 12, fontWeight: '800', color: palette.ink700 },
  matchName: { fontSize: 15.5, fontWeight: '800', color: palette.ink900 },
  matchMeta: { fontSize: 11.5, color: palette.gray450, marginTop: 2 },
  needsMatch: { fontSize: 13, color: palette.gray450, marginTop: 2 },
  itemActions: { flexDirection: 'row', gap: 18, marginTop: 10 },
  actionLink: { fontSize: 13, fontWeight: '800', color: palette.blue600 },
  actionLinkMuted: { fontSize: 13, fontWeight: '700', color: palette.gray450 },

  removedWrap: { marginTop: 6, marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  removedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  removedName: { fontSize: 13.5, color: palette.gray450 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  addRowText: { fontSize: 14, fontWeight: '800', color: palette.blue600 },

  fieldLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  slotChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  slotChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  slotChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  slotChipTextOn: { color: '#fff' },

  portionCard: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, padding: 14, marginTop: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  amountInput: {
    width: 84, height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 17, fontWeight: '700', color: palette.ink900,
  },
  unitChips: { flexDirection: 'row', gap: 6 },
  unitChip: { paddingHorizontal: 14, height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
  unitChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  unitChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  unitChipTextOn: { color: '#fff' },
  servingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  servingChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  servingChipOn: { backgroundColor: palette.blue50, borderColor: palette.blue500 },
  servingChipText: { fontSize: 12.5, fontWeight: '600', color: palette.ink700 },
  servingChipTextOn: { color: palette.blue600 },
  previewText: { fontSize: 13.5, fontWeight: '700', color: palette.ink900, marginTop: 12 },
  previewError: { fontSize: 13, color: palette.danger500, marginTop: 12 },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  resultName: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.ink900 },
  resultMeta: { fontSize: 12, color: palette.gray450 },

  picker: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.white },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: palette.ink900 },
  listPad: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  rowName: { fontSize: 14.5, fontWeight: '700', color: palette.ink900 },
  rowMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  emptyText: { fontSize: 13.5, color: palette.gray450, textAlign: 'center', marginTop: 40 },
});

import { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { NumericGoalInput } from '@/components/onboarding/numeric-input';
import { ActivitySlider } from '@/components/onboarding/activity-slider';
import { useOnboarding } from '@/contexts/onboarding-context';
import { deriveActivityLevel, describeWorkHours, describeSportHours, describeLeisureHours } from '@/lib/onboarding';
import { validateWeeklyTimeBudget } from '@/lib/onboarding-validation';
import { supabase } from '@/lib/supabase';
import { palette, radii, fontSize } from '@/constants/theme';

export default function OnboardingStartingPointScreen() {
  const router = useRouter();
  const { answers, setActivityLevel, saveProgress } = useOnboarding();

  const [showBodyComp, setShowBodyComp] = useState(false);
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [hips, setHips] = useState('');
  const [saved, setSaved] = useState(false);

  const [sleepHours, setSleepHours] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [sportHours, setSportHours] = useState('');

  // Resume: pre-fill with whatever was already saved (e.g. the user filled
  // this in, then skipped out before Continue) instead of showing blanks.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from('health_profile')
        .select('sleep_hours_per_night, hours_working_per_week, hours_exercising_per_week')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.sleep_hours_per_night != null) setSleepHours(String(data.sleep_hours_per_night));
      if (data?.hours_working_per_week != null) setWorkHours(String(data.hours_working_per_week));
      if (data?.hours_exercising_per_week != null) setSportHours(String(data.hours_exercising_per_week));
    })();
  }, []);

  const sleepNum = sleepHours.trim() ? Number(sleepHours) : null;
  const workNum = workHours.trim() ? Number(workHours) : null;
  const sportNum = sportHours.trim() ? Number(sportHours) : null;

  // LH-03 — validate the whole 168-hour weekly budget. `remainingHours` is
  // NOT clamped: an over-committed week surfaces as a blocking error that
  // names the overage, never a silent "—" or 0 with Continue still enabled.
  const budget = validateWeeklyTimeBudget({
    sleepHoursPerNight: sleepNum,
    workHoursPerWeek: workNum,
    sportHoursPerWeek: sportNum,
  });
  const allEntered = sleepNum !== null && workNum !== null && sportNum !== null;
  const leisureHours = budget.remainingHours;

  const canContinue = allEntered && !!sleepNum && sleepNum > 0 && budget.ok;

  const handleAddMeasurements = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const hasAny = waist.trim() || chest.trim() || hips.trim();
    if (!hasAny) { setShowBodyComp(false); return; }

    try {
      await supabase.from('client_measurements').insert({
        user_id: userId,
        waist_cm: waist.trim() ? Number(waist) : null,
        chest_cm: chest.trim() ? Number(chest) : null,
        hips_cm: hips.trim() ? Number(hips) : null,
        weight_kg: answers.startingWeightKg,
      });
      setSaved(true);
    } catch {
      // Non-critical, optional data — fail silently and let them continue.
      setSaved(true);
    }
  };

  const handleContinue = async () => {
    // LH-03 / LH-18 — never persist an impossible weekly schedule, even if
    // the button somehow fires.
    if (!canContinue) return;
    setActivityLevel(deriveActivityLevel(sportNum ?? 0));

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      try {
        await supabase.from('health_profile').upsert({
          user_id: userId,
          sleep_hours_per_night: sleepNum,
          hours_working_per_week: workNum,
          hours_exercising_per_week: sportNum,
        });
      } catch {
        // Non-critical — don't block onboarding on a sync failure.
      }
    }

    saveProgress();
    router.push('/onboarding/barriers');
  };
  const handleExit = () => { saveProgress(); router.replace('/(tabs)'); };

  return (
    <View style={styles.root}>
      <OnboardingHeader step={3} onBack={() => router.back()} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.headline}>What does a typical week look like?</ThemedText>
        <ThemedText style={styles.sub}>Your plan should fit your life — not the other way around.</ThemedText>

        <ThemedText style={styles.fieldLabel}>Sleep</ThemedText>
        <NumericGoalInput
          label="Hours per night" unit="hrs" value={sleepHours} onChangeText={setSleepHours} placeholder="e.g. 7"
          error={sleepHours.trim() ? budget.fieldErrors.sleep : null}
        />

        <View style={{ height: 16 }} />
        <ThemedText style={styles.fieldLabel}>Work</ThemedText>
        <ActivitySlider
          value={workNum ?? 0}
          minimumValue={0}
          maximumValue={60}
          step={0.5}
          onValueChange={v => setWorkHours(String(v))}
          describe={describeWorkHours}
        />
        <View style={{ height: 12 }} />
        <NumericGoalInput
          label="Hours per week" unit="hrs" value={workHours} onChangeText={setWorkHours} placeholder="e.g. 40"
          error={workHours.trim() ? budget.fieldErrors.work : null}
        />

        <View style={{ height: 16 }} />
        <ThemedText style={styles.fieldLabel}>Sport / training</ThemedText>
        <ActivitySlider
          value={sportNum ?? 0}
          minimumValue={0}
          maximumValue={15}
          step={0.5}
          onValueChange={v => setSportHours(String(v))}
          describe={describeSportHours}
        />
        <View style={{ height: 12 }} />
        <NumericGoalInput
          label="Hours per week" unit="hrs" value={sportHours} onChangeText={setSportHours} placeholder="e.g. 3"
          error={sportHours.trim() ? budget.fieldErrors.sport : null}
        />

        <View style={{ height: 16 }} />
        <ThemedText style={styles.fieldLabel}>Leisure</ThemedText>
        <ActivitySlider
          value={Math.max(0, leisureHours ?? 0)}
          minimumValue={0}
          maximumValue={168}
          describe={describeLeisureHours}
          disabled
        />
        <View style={{ height: 12 }} />
        <NumericGoalInput
          label="Remaining hours per week"
          unit="hrs"
          value={leisureHours !== null ? String(leisureHours) : ''}
          onChangeText={() => {}}
          placeholder="—"
          editable={false}
        />
        {/* LH-03 — an over-committed week is a blocking error naming the
            overage, shown here instead of a silent "—" / 0. */}
        {!!budget.error && (
          <ThemedText style={styles.budgetError}>{budget.error}</ThemedText>
        )}

        <View style={{ height: 24 }} />

        {!showBodyComp ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowBodyComp(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={18} color={palette.ink900} />
            <ThemedText style={styles.addBtnText}>Add body composition (optional)</ThemedText>
          </TouchableOpacity>
        ) : saved ? (
          <View style={styles.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={palette.success700} />
            <ThemedText style={styles.savedText}>Measurements added</ThemedText>
          </View>
        ) : (
          <View style={styles.bodyCompCard}>
            <ThemedText style={styles.fieldLabel}>Optional measurements</ThemedText>
            <View style={styles.row}>
              <NumericGoalInput label="Waist" unit="cm" value={waist} onChangeText={setWaist} placeholder="—" />
              <NumericGoalInput label="Chest" unit="cm" value={chest} onChangeText={setChest} placeholder="—" />
              <NumericGoalInput label="Hips" unit="cm" value={hips} onChangeText={setHips} placeholder="—" />
            </View>
            <View style={styles.bodyCompActions}>
              <TouchableOpacity onPress={() => setShowBodyComp(false)}>
                <ThemedText style={styles.skipText}>Skip for now</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveMeasureBtn} onPress={handleAddMeasurements}>
                <ThemedText style={styles.saveMeasureBtnText}>Save</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <OnboardingFooter label="Continue" onPress={handleContinue} disabled={!canContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  sub: {
    fontSize: fontSize.base,
    color: palette.gray450,
    marginBottom: 24,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  addBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink900,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savedText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.success700,
  },

  bodyCompCard: {
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: palette.surfaceMuted,
    gap: 14,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink600,
    marginBottom: 8,
  },
  budgetError: {
    marginTop: 12,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.danger600,
    backgroundColor: palette.danger50,
    borderRadius: radii.md,
    padding: 12,
    lineHeight: 20,
  },
  row: { flexDirection: 'row', gap: 10 },
  bodyCompActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray450,
  },
  saveMeasureBtn: {
    backgroundColor: palette.ink900,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  saveMeasureBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.white,
  },
});

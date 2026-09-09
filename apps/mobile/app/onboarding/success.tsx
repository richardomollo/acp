import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectCard } from '@/components/onboarding/select-card';
import { NumericGoalInput } from '@/components/onboarding/numeric-input';
import { DateSelector, formatMonthYear } from '@/components/onboarding/date-selector';
import { useOnboarding } from '@/contexts/onboarding-context';
import {
  STRENGTH_EXPERIENCE_OPTIONS, HEALTH_FOCUS_OPTIONS,
} from '@/lib/onboarding';
import { validateCurrentWeight, validateGoalWeight } from '@/lib/onboarding-validation';
import { palette, radii, fontSize } from '@/constants/theme';

export default function OnboardingSuccessScreen() {
  const router = useRouter();
  const {
    answers, setWeightGoal, setGoalTargetDate,
    setStrengthExperience, setGoalDetails, saveProgress, userName,
  } = useOnboarding();
  const firstName = userName.split(' ')[0];

  const goal = answers.goal;
  const isWeightGoal = goal === 'lose_weight' || goal === 'build_muscle' || goal === 'maintain_weight';

  useEffect(() => {
    if (!goal) router.replace('/onboarding/goal');
  }, [goal, router]);

  // ── Weight local state (shared by lose_weight / build_muscle) ──
  const [currentWeight, setCurrentWeight] = useState(answers.startingWeightKg ? String(answers.startingWeightKg) : '');
  const [targetWeight, setTargetWeight] = useState(answers.goalWeightKg ? String(answers.goalWeightKg) : '');

  // LH-01 — plausible-range validation at the input boundary. A blank field
  // stays "required" (Continue disabled, no red error); a typed-but-invalid
  // value shows an inline reason and blocks Continue.
  const currentWeightNum = currentWeight.trim() ? Number(currentWeight) : null;
  const targetWeightNum = targetWeight.trim() ? Number(targetWeight) : null;
  const currentWeightV = validateCurrentWeight(currentWeightNum);
  const targetWeightV = validateGoalWeight(targetWeightNum);
  const currentWeightError = currentWeight.trim() && !currentWeightV.ok ? currentWeightV.error : null;
  const targetWeightError = targetWeight.trim() && !targetWeightV.ok ? targetWeightV.error : null;

  useEffect(() => {
    if (!isWeightGoal) return;
    // Only ever push a valid, in-range value into onboarding state — an
    // out-of-range entry leaves the last good value (or null) so it can't
    // ride through to the summary / persistence.
    setWeightGoal(currentWeightV.value as any, targetWeightV.value as any, answers.goalTargetDate as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeight, targetWeight]);

  const toggleHealthFocus = (key: string) => {
    const current = answers.goalDetails.health_focus ?? [];
    const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    setGoalDetails({ health_focus: next });
  };

  const canContinue = (() => {
    switch (goal) {
      case 'lose_weight':
      case 'build_muscle':
      case 'maintain_weight': {
        return currentWeightV.ok && targetWeightV.ok
          && !!answers.goalTargetDate && !!answers.strengthExperience;
      }
      case 'reduce_stress':
        return (answers.goalDetails.health_focus ?? []).length > 0;
      default:
        return false;
    }
  })();

  const handleContinue = () => {
    saveProgress();
    router.push('/onboarding/starting-point');
  };
  const handleExit = () => { saveProgress(); router.replace('/(tabs)'); };

  const weightSummary = (() => {
    if (!isWeightGoal) return null;
    // LH-18 — never render a goal line from out-of-range weights.
    if (!currentWeightV.ok || !targetWeightV.ok || !answers.goalTargetDate) return null;
    const cw = currentWeightV.value!;
    const gw = targetWeightV.value!;
    const suffix = goal === 'build_muscle' ? ' while building muscle' : '';
    if (gw > cw) return `Gain ${Math.round((gw - cw) * 10) / 10} kg by ${formatMonthYear(answers.goalTargetDate)}${suffix}`;
    if (gw < cw) return `Lose ${Math.round((cw - gw) * 10) / 10} kg by ${formatMonthYear(answers.goalTargetDate)}${suffix}`;
    return goal === 'build_muscle' ? `Maintain your current weight while building muscle` : `Maintain your current weight`;
  })();

  return (
    <View style={styles.root}>
      <OnboardingHeader step={2} onBack={() => router.back()} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.headline}>{firstName ? `Where are you starting from, ${firstName}?` : 'Where are you starting from?'}</ThemedText>
        <ThemedText style={styles.sub}>Help Lana understand your current level so your first plan starts in the right place.</ThemedText>

        {isWeightGoal && (
          <>
            <View style={styles.row}>
              <NumericGoalInput label="Current weight" unit="kg" value={currentWeight} onChangeText={setCurrentWeight} placeholder="e.g. 78" error={currentWeightError} />
              <NumericGoalInput label="Goal weight" unit="kg" value={targetWeight} onChangeText={setTargetWeight} placeholder={goal === 'lose_weight' ? 'e.g. 70' : 'e.g. 85'} error={targetWeightError} />
            </View>

            <View style={{ height: 16 }} />
            <DateSelector label="Target date" value={answers.goalTargetDate} onChange={setGoalTargetDate} />

            {weightSummary && (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryLabel}>Your goal</ThemedText>
                <ThemedText style={styles.summaryValue}>{weightSummary}</ThemedText>
              </View>
            )}
          </>
        )}

        {isWeightGoal && (
          <>
            <View style={{ height: 20 }} />
            <ThemedText style={styles.fieldLabel}>Current experience</ThemedText>
            <View style={styles.list}>
              {STRENGTH_EXPERIENCE_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  label={o.label}
                  desc={o.desc}
                  selected={answers.strengthExperience === o.key}
                  onPress={() => setStrengthExperience(o.key)}
                />
              ))}
            </View>
          </>
        )}

        {goal === 'reduce_stress' && (
          <>
            <ThemedText style={styles.fieldLabel}>What would you most like to improve?</ThemedText>
            <View style={styles.chipsWrap}>
              {HEALTH_FOCUS_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  icon={o.icon}
                  label={o.label}
                  selected={(answers.goalDetails.health_focus ?? []).includes(o.key)}
                  onPress={() => toggleHealthFocus(o.key)}
                />
              ))}
            </View>
          </>
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
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink600,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 12 },
  list: { gap: 10 },
  chipsWrap: { gap: 10 },

  summaryCard: {
    marginTop: 20,
    padding: 18,
    borderRadius: radii.xl,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.ink700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: palette.ink700,
  },
});

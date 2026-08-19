import { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectCard } from '@/components/onboarding/select-card';
import { NumericGoalInput } from '@/components/onboarding/numeric-input';
import { DateSelector, formatMonthYear } from '@/components/onboarding/date-selector';
import { useOnboarding } from '@/contexts/onboarding-context';
import {
  ACTIVITY_LEVEL_OPTIONS, STRENGTH_EXPERIENCE_OPTIONS, STRENGTH_TARGET_OPTIONS,
  HEALTH_FOCUS_OPTIONS, LIFESTYLE_FOCUS_OPTIONS,
} from '@/lib/onboarding';
import { palette, radii, fontSize } from '@/constants/theme';

function parseTime(totalSeconds: number | null | undefined) {
  if (!totalSeconds) return { min: '', sec: '' };
  return { min: String(Math.floor(totalSeconds / 60)), sec: String(totalSeconds % 60) };
}
function toSeconds(min: string, sec: string): number | undefined {
  const m = parseInt(min, 10) || 0;
  const s = parseInt(sec, 10) || 0;
  if (!min && !sec) return undefined;
  return m * 60 + s;
}

export default function OnboardingSuccessScreen() {
  const router = useRouter();
  const {
    answers, setWeightGoal, setGoalTargetDate, setActivityLevel,
    setStrengthExperience, setGoalDetails, saveProgress,
  } = useOnboarding();

  const goal = answers.goal;

  useEffect(() => {
    if (!goal) router.replace('/onboarding/goal');
  }, [goal, router]);

  // ── Weight loss local state ──
  const [currentWeight, setCurrentWeight] = useState(answers.startingWeightKg ? String(answers.startingWeightKg) : '');
  const [targetWeight, setTargetWeight] = useState(answers.goalWeightKg ? String(answers.goalWeightKg) : '');

  // ── Running local state ──
  const currentParsed = parseTime(answers.goalDetails.current_5k_seconds);
  const targetParsed = parseTime(answers.goalDetails.target_5k_seconds);
  const [curMin, setCurMin] = useState(currentParsed.min);
  const [curSec, setCurSec] = useState(currentParsed.sec);
  const [tgtMin, setTgtMin] = useState(targetParsed.min);
  const [tgtSec, setTgtSec] = useState(targetParsed.sec);
  const [noCurrent5k, setNoCurrent5k] = useState(!!answers.goalDetails.no_current_5k);

  useEffect(() => {
    if (goal !== 'improve_running') return;
    setGoalDetails({
      current_5k_seconds: noCurrent5k ? null : (toSeconds(curMin, curSec) ?? null),
      target_5k_seconds: toSeconds(tgtMin, tgtSec),
      no_current_5k: noCurrent5k,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMin, curSec, tgtMin, tgtSec, noCurrent5k]);

  useEffect(() => {
    if (goal !== 'lose_weight') return;
    const cw = currentWeight ? Number(currentWeight) : null;
    const gw = targetWeight ? Number(targetWeight) : null;
    setWeightGoal(cw as any, gw as any, answers.goalTargetDate as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeight, targetWeight]);

  const canContinue = (() => {
    switch (goal) {
      case 'lose_weight': {
        const cw = Number(currentWeight);
        const gw = Number(targetWeight);
        return !!currentWeight && !!targetWeight && cw > 0 && gw > 0 && gw < cw && !!answers.goalTargetDate;
      }
      case 'improve_running':
        return toSeconds(tgtMin, tgtSec) !== undefined && !!answers.goalTargetDate;
      case 'build_muscle':
        return !!answers.strengthExperience && !!answers.goalDetails.strength_target;
      case 'improve_health':
        return !!answers.activityLevel && !!answers.goalDetails.health_focus;
      case 'healthy_lifestyle':
        return !!answers.activityLevel && !!answers.goalDetails.lifestyle_focus;
      default:
        return false;
    }
  })();

  const handleContinue = () => {
    saveProgress();
    router.push('/onboarding/starting-point');
  };
  const handleExit = () => { saveProgress(); router.replace('/(tabs)'); };

  const weightLossSummary = (() => {
    const cw = Number(currentWeight);
    const gw = Number(targetWeight);
    if (!currentWeight || !targetWeight || !(cw > gw) || !answers.goalTargetDate) return null;
    const diff = Math.round((cw - gw) * 10) / 10;
    return `Lose ${diff} kg by ${formatMonthYear(answers.goalTargetDate)}`;
  })();

  return (
    <View style={styles.root}>
      <OnboardingHeader step={2} onBack={() => router.back()} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.headline}>What does success look like for you?</ThemedText>

        {goal === 'lose_weight' && (
          <>
            <View style={styles.row}>
              <NumericGoalInput label="Current weight" unit="kg" value={currentWeight} onChangeText={setCurrentWeight} placeholder="e.g. 78" />
              <NumericGoalInput label="Goal weight" unit="kg" value={targetWeight} onChangeText={setTargetWeight} placeholder="e.g. 70" />
            </View>
            <View style={{ height: 16 }} />
            <DateSelector label="Target date" value={answers.goalTargetDate} onChange={setGoalTargetDate} />

            {currentWeight && targetWeight && Number(targetWeight) >= Number(currentWeight) && (
              <ThemedText style={styles.errorText}>Goal weight should be lower than your current weight.</ThemedText>
            )}

            {weightLossSummary && (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryLabel}>Your goal</ThemedText>
                <ThemedText style={styles.summaryValue}>{weightLossSummary}</ThemedText>
              </View>
            )}
          </>
        )}

        {goal === 'improve_running' && (
          <>
            <ThemedText style={styles.fieldLabel}>Current 5K time</ThemedText>
            <View style={styles.row}>
              <NumericGoalInput label="Minutes" value={curMin} onChangeText={setCurMin} placeholder="28" editable={!noCurrent5k} />
              <NumericGoalInput label="Seconds" value={curSec} onChangeText={setCurSec} placeholder="30" editable={!noCurrent5k} />
            </View>
            <TouchableOpacity style={styles.checkRow} onPress={() => setNoCurrent5k(v => !v)} activeOpacity={0.8}>
              <View style={[styles.checkbox, noCurrent5k && styles.checkboxChecked]}>
                {noCurrent5k && <Ionicons name="checkmark" size={13} color={palette.white} />}
              </View>
              <ThemedText style={styles.checkLabel}>I don’t know my current 5K time</ThemedText>
            </TouchableOpacity>

            <View style={{ height: 20 }} />
            <ThemedText style={styles.fieldLabel}>Target 5K time</ThemedText>
            <View style={styles.row}>
              <NumericGoalInput label="Minutes" value={tgtMin} onChangeText={setTgtMin} placeholder="24" />
              <NumericGoalInput label="Seconds" value={tgtSec} onChangeText={setTgtSec} placeholder="00" />
            </View>

            <View style={{ height: 16 }} />
            <DateSelector label="Target date" value={answers.goalTargetDate} onChange={setGoalTargetDate} />
          </>
        )}

        {goal === 'build_muscle' && (
          <>
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

            <View style={{ height: 20 }} />
            <ThemedText style={styles.fieldLabel}>What’s your strength goal?</ThemedText>
            <View style={styles.list}>
              {STRENGTH_TARGET_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  label={o.label}
                  selected={answers.goalDetails.strength_target === o.key}
                  onPress={() => setGoalDetails({ strength_target: o.key })}
                />
              ))}
            </View>
          </>
        )}

        {goal === 'improve_health' && (
          <>
            <ThemedText style={styles.fieldLabel}>Current activity level</ThemedText>
            <View style={styles.list}>
              {ACTIVITY_LEVEL_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  label={o.label}
                  desc={o.desc}
                  selected={answers.activityLevel === o.key}
                  onPress={() => setActivityLevel(o.key)}
                />
              ))}
            </View>

            <View style={{ height: 20 }} />
            <ThemedText style={styles.fieldLabel}>What would you most like to improve?</ThemedText>
            <View style={styles.chipsWrap}>
              {HEALTH_FOCUS_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  icon={o.icon}
                  label={o.label}
                  selected={answers.goalDetails.health_focus === o.key}
                  onPress={() => setGoalDetails({ health_focus: o.key })}
                />
              ))}
            </View>
          </>
        )}

        {goal === 'healthy_lifestyle' && (
          <>
            <ThemedText style={styles.fieldLabel}>Current activity level</ThemedText>
            <View style={styles.list}>
              {ACTIVITY_LEVEL_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  label={o.label}
                  desc={o.desc}
                  selected={answers.activityLevel === o.key}
                  onPress={() => setActivityLevel(o.key)}
                />
              ))}
            </View>

            <View style={{ height: 20 }} />
            <ThemedText style={styles.fieldLabel}>What would you like to improve?</ThemedText>
            <View style={styles.chipsWrap}>
              {LIFESTYLE_FOCUS_OPTIONS.map(o => (
                <SelectCard
                  key={o.key}
                  icon={o.icon}
                  label={o.label}
                  selected={answers.goalDetails.lifestyle_focus === o.key}
                  onPress={() => setGoalDetails({ lifestyle_focus: o.key })}
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
    marginBottom: 20,
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

  errorText: {
    fontSize: fontSize.xs,
    color: palette.danger600,
    marginTop: 8,
  },

  summaryCard: {
    marginTop: 20,
    padding: 18,
    borderRadius: radii.xl,
    backgroundColor: palette.blue25,
    borderWidth: 1,
    borderColor: palette.blue100,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.blue600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: palette.ink700,
  },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: palette.blue500,
    borderColor: palette.blue500,
  },
  checkLabel: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    fontWeight: '500',
  },
});

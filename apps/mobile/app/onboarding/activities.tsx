import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectChip } from '@/components/onboarding/select-chip';
import { useOnboarding } from '@/contexts/onboarding-context';
import {
  ACTIVITY_OPTIONS, TRAINING_DAY_OPTIONS, MIN_TRAINING_DAYS, MAX_TRAINING_DAYS,
  describeTrainingFrequency,
} from '@/lib/onboarding';
import { palette, fontSize, radii } from '@/constants/theme';

export default function OnboardingActivitiesScreen() {
  const router = useRouter();
  const { answers, togglePreferredActivity, togglePreferredTrainingDay, saveProgress, userName } = useOnboarding();
  const firstName = userName.split(' ')[0];
  const dayCount = answers.preferredTrainingDays.length;

  const handleBuildPlan = () => {
    saveProgress();
    router.push('/onboarding/plan');
  };
  const handleExit = () => { saveProgress(); router.replace('/(tabs)'); };

  return (
    <View style={styles.root}>
      <OnboardingHeader step={5} onBack={() => router.back()} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.headline}>{firstName ? `How do you like to move, ${firstName}?` : 'How do you like to move?'}</ThemedText>
        <ThemedText style={styles.sub}>Choose the activities you enjoy. Lana will prioritise ways of moving you’re more likely to stick with.</ThemedText>

        <View style={styles.chips}>
          {ACTIVITY_OPTIONS.map(o => (
            <SelectChip
              key={o.key}
              icon={o.icon}
              label={o.label}
              selected={answers.preferredActivities.includes(o.key)}
              onPress={() => togglePreferredActivity(o.key)}
            />
          ))}
        </View>

        {/* Beta Feedback #002 — training schedule preference. Optional: a
            coach learning the user's routine, not a scheduling form. Skipped
            (or a single day) = no preference, and ACP plans as it does today. */}
        <ThemedText style={styles.dayHeading}>Which days do you prefer to train?</ThemedText>
        <ThemedText style={styles.daySub}>
          Optional — pick the weekdays you normally like to exercise, and Lana will build your week around them.
        </ThemedText>
        <View style={styles.dayRow}>
          {TRAINING_DAY_OPTIONS.map(d => {
            const selected = answers.preferredTrainingDays.includes(d.key);
            const atCap = !selected && dayCount >= MAX_TRAINING_DAYS;
            return (
              <TouchableOpacity
                key={d.key}
                onPress={() => togglePreferredTrainingDay(d.key)}
                activeOpacity={0.8}
                disabled={atCap}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={d.short}
                style={[styles.dayPill, selected && styles.dayPillOn, atCap && styles.dayPillDisabled]}
              >
                <ThemedText style={[styles.dayPillText, selected && styles.dayPillTextOn]}>{d.letter}</ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
        <ThemedText style={styles.dayCaption}>
          {dayCount === 0
            ? 'No preference yet'
            : dayCount < MIN_TRAINING_DAYS
              ? `Pick at least ${MIN_TRAINING_DAYS} days, or leave this for Lana to decide`
              : describeTrainingFrequency(dayCount)}
        </ThemedText>
      </ScrollView>

      <OnboardingFooter
        label="Build my plan"
        onPress={handleBuildPlan}
        disabled={answers.preferredActivities.length === 0}
      />
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dayHeading: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.2,
    marginTop: 30,
    marginBottom: 4,
  },
  daySub: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    marginBottom: 14,
    lineHeight: 19,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayPill: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.gray200,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillOn: {
    backgroundColor: palette.ink900,
    borderColor: palette.ink900,
  },
  dayPillDisabled: {
    opacity: 0.4,
  },
  dayPillText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  dayPillTextOn: {
    color: palette.white,
  },
  dayCaption: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
    marginTop: 10,
  },
});

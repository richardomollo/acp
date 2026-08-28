import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectChip } from '@/components/onboarding/select-chip';
import { useOnboarding } from '@/contexts/onboarding-context';
import { ACTIVITY_OPTIONS } from '@/lib/onboarding';
import { palette, fontSize } from '@/constants/theme';

export default function OnboardingActivitiesScreen() {
  const router = useRouter();
  const { answers, togglePreferredActivity, saveProgress, userName } = useOnboarding();
  const firstName = userName.split(' ')[0];

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
        <ThemedText style={styles.sub}>Choose the activities you enjoy. ACP Intelligence™ will prioritise ways of moving you’re more likely to stick with.</ThemedText>

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
});

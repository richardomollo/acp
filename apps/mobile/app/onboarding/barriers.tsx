import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectChip } from '@/components/onboarding/select-chip';
import { useOnboarding } from '@/contexts/onboarding-context';
import { BARRIER_OPTIONS, MAX_BARRIERS } from '@/lib/onboarding';
import { palette, fontSize } from '@/constants/theme';

export default function OnboardingBarriersScreen() {
  const router = useRouter();
  const { answers, toggleBarrier, saveProgress } = useOnboarding();

  const atMax = answers.barriers.length >= MAX_BARRIERS;

  const handleContinue = () => {
    saveProgress();
    router.push('/onboarding/activities');
  };
  const handleExit = () => { saveProgress(); router.replace('/(tabs)'); };

  return (
    <View style={styles.root}>
      <OnboardingHeader step={4} onBack={() => router.back()} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.headline}>What’s getting in your way?</ThemedText>
        <ThemedText style={styles.sub}>Choose up to {MAX_BARRIERS}.</ThemedText>

        <View style={styles.chips}>
          {BARRIER_OPTIONS.map(o => {
            const selected = answers.barriers.includes(o.key);
            return (
              <SelectChip
                key={o.key}
                icon={o.icon}
                label={o.label}
                selected={selected}
                disabled={atMax}
                onPress={() => toggleBarrier(o.key)}
              />
            );
          })}
        </View>
      </ScrollView>

      <OnboardingFooter label="Continue" onPress={handleContinue} disabled={answers.barriers.length === 0} />
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

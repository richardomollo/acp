import { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectCard } from '@/components/onboarding/select-card';
import { useOnboarding } from '@/contexts/onboarding-context';
import { GOAL_OPTIONS } from '@/lib/onboarding';
import { palette, fontSize } from '@/constants/theme';

export default function OnboardingGoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { answers, setGoal, setRedirectTo, saveProgress } = useOnboarding();

  useEffect(() => {
    if (params.redirect) setRedirectTo(params.redirect as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.redirect]);

  const handleContinue = () => {
    saveProgress();
    router.push('/onboarding/success');
  };

  const handleExit = () => {
    saveProgress();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <OnboardingHeader step={1} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.headline}>What do you want to achieve?</ThemedText>
        <ThemedText style={styles.sub}>Choose your primary goal.</ThemedText>

        <View style={styles.list}>
          {GOAL_OPTIONS.map(g => (
            <SelectCard
              key={g.key}
              icon={g.icon}
              label={g.label}
              desc={g.desc}
              selected={answers.goal === g.key}
              onPress={() => setGoal(g.key)}
            />
          ))}
        </View>
      </ScrollView>

      <OnboardingFooter label="Continue" onPress={handleContinue} disabled={!answers.goal} />
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
  list: { gap: 10 },
});

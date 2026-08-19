import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { useOnboarding } from '@/contexts/onboarding-context';
import { buildPlanSummary } from '@/lib/onboarding';
import { palette, radii, fontSize } from '@/constants/theme';

const APPROACH_ICON: Record<string, string> = {
  Strength: 'barbell-outline',
  Cardio: 'heart-outline',
  Movement: 'walk-outline',
  Nutrition: 'nutrition-outline',
  Community: 'people-outline',
  Consistency: 'repeat-outline',
};

export default function OnboardingPlanScreen() {
  const router = useRouter();
  const { answers, redirectTo, completeOnboarding } = useOnboarding();
  const [status, setStatus] = useState<'saving' | 'saved' | 'failed'>('saving');
  const [starting, setStarting] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const summary = buildPlanSummary(answers);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (): Promise<boolean> => {
    setStatus('saving');
    try {
      await completeOnboarding();
      setStatus('saved');
      return true;
    } catch {
      setStatus('failed');
      return false;
    }
  };

  const handleStart = async () => {
    if (status === 'failed') {
      setStarting(true);
      const ok = await save();
      setStarting(false);
      if (!ok) return;
    }
    router.replace(redirectTo as any);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={{ paddingTop: 24 }}>
          <Animated.View style={{ opacity: fade }}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={28} color={palette.white} />
            </View>
            <ThemedText style={styles.headline}>Your plan is ready.</ThemedText>
          </Animated.View>
        </SafeAreaView>

        <Animated.View style={[styles.card, { opacity: fade }]}>
          <ThemedText style={styles.cardEyebrow}>Your active plan</ThemedText>

          <View style={styles.row}>
            <ThemedText style={styles.rowLabel}>Goal</ThemedText>
            <ThemedText style={styles.rowValue}>{summary.goalLine}</ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <ThemedText style={styles.rowLabel}>Starting point</ThemedText>
            <ThemedText style={styles.rowValue}>{summary.startingPointLine}</ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <ThemedText style={styles.rowLabel}>Focus</ThemedText>
            <ThemedText style={styles.rowValue}>{summary.focusLine}</ThemedText>
          </View>

          <View style={styles.divider} />

          <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Recommended approach</ThemedText>
          <View style={styles.approachWrap}>
            {summary.approach.map(a => (
              <View key={a} style={styles.approachChip}>
                <Ionicons name={(APPROACH_ICON[a] ?? 'ellipse-outline') as any} size={14} color={palette.blue600} />
                <ThemedText style={styles.approachText}>{a}</ThemedText>
              </View>
            ))}
          </View>
        </Animated.View>

        <ThemedText style={styles.adaptNote}>Your plan will adapt as you progress.</ThemedText>

        {status === 'failed' && (
          <ThemedText style={styles.errorNote}>Couldn’t save your plan — check your connection. You can still continue.</ThemedText>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85} disabled={starting}>
          <ThemedText style={styles.startBtnText}>Start my journey</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.success700,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headline: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.5,
    marginBottom: 24,
  },

  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginBottom: 20,
  },
  cardEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray300,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  row: { gap: 4 },
  rowLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray450,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
  },
  divider: {
    height: 1,
    backgroundColor: palette.hairline,
    marginVertical: 14,
  },

  approachWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  approachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.blue25,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  approachText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.blue600,
  },

  adaptNote: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  errorNote: {
    fontSize: fontSize.xs,
    color: palette.danger600,
    textAlign: 'center',
    marginTop: 12,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  startBtn: {
    backgroundColor: palette.blue500,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  startBtnText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});

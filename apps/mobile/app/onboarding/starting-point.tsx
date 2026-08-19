import { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectCard } from '@/components/onboarding/select-card';
import { NumericGoalInput } from '@/components/onboarding/numeric-input';
import { useOnboarding } from '@/contexts/onboarding-context';
import { ACTIVITY_LEVEL_OPTIONS } from '@/lib/onboarding';
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

  const handleContinue = () => {
    saveProgress();
    router.push('/onboarding/barriers');
  };
  const handleExit = () => { saveProgress(); router.replace('/(tabs)'); };

  return (
    <View style={styles.root}>
      <OnboardingHeader step={3} onBack={() => router.back()} onExit={handleExit} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.headline}>Let’s understand your starting point.</ThemedText>
        <ThemedText style={styles.sub}>Your starting point helps us create a plan that’s right for you.</ThemedText>

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

        <View style={{ height: 24 }} />

        {!showBodyComp ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowBodyComp(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={18} color={palette.blue500} />
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

      <OnboardingFooter label="Continue" onPress={handleContinue} disabled={!answers.activityLevel} />
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

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  addBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.blue500,
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

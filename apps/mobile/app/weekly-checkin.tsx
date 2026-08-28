// ACP Intelligence™ Day 5 — the smallest useful weekly check-in. Asks only
// what ACP cannot already infer from ProgressSnapshot (difficulty, energy,
// pain, schedule change) — never workout counts, adherence, or weight, all
// of which are already known.
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { submitWeeklyCheckIn, evaluateAndApplyAdaptation, memberHeadlineFor } from '@/services/adaptation-service';
import type { CheckInDifficulty, CheckInEnergy } from '@/lib/adaptation-types';

const DIFFICULTY_OPTIONS: { key: CheckInDifficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' }, { key: 'about_right', label: 'About right' }, { key: 'too_difficult', label: 'Too difficult' },
];
const ENERGY_OPTIONS: { key: CheckInEnergy; label: string }[] = [
  { key: 'low', label: 'Low' }, { key: 'normal', label: 'Normal' }, { key: 'high', label: 'High' },
];

function OptionRow<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map(o => (
        <TouchableOpacity
          key={o.key}
          style={[s.option, value === o.key && s.optionActive]}
          onPress={() => onChange(o.key)}
          activeOpacity={0.8}
        >
          <ThemedText style={[s.optionText, value === o.key && s.optionTextActive]}>{o.label}</ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function YesNoRow({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity style={[s.option, value === true && s.optionActive]} onPress={() => onChange(true)} activeOpacity={0.8}>
        <ThemedText style={[s.optionText, value === true && s.optionTextActive]}>Yes</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity style={[s.option, value === false && s.optionActive]} onPress={() => onChange(false)} activeOpacity={0.8}>
        <ThemedText style={[s.optionText, value === false && s.optionTextActive]}>No</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

export default function WeeklyCheckInScreen() {
  const router = useRouter();
  const { programId, weekNumber } = useLocalSearchParams<{ programId: string; weekNumber: string }>();

  const [difficulty, setDifficulty] = useState<CheckInDifficulty | null>(null);
  const [energy, setEnergy] = useState<CheckInEnergy | null>(null);
  const [pain, setPain] = useState<boolean | null>(null);
  const [scheduleChanged, setScheduleChanged] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ headline: string; message: string } | null>(null);

  const canSubmit = difficulty != null && energy != null && pain != null && scheduleChanged != null;

  const submit = async () => {
    if (!canSubmit || !programId || !weekNumber) return;
    setSubmitting(true);
    const session = await authService.getSession();
    const userId = session?.user.id;
    if (!userId) { setSubmitting(false); return; }

    const week = Number(weekNumber);
    const saved = await submitWeeklyCheckIn(userId, programId, week, { difficulty: difficulty!, energy: energy!, painReported: pain!, scheduleChanged: scheduleChanged! });
    if ('error' in saved) { setSubmitting(false); return; }

    const outcome = await evaluateAndApplyAdaptation(userId, programId, week);
    setSubmitting(false);
    if ('error' in outcome) return;

    setResult({ headline: memberHeadlineFor(outcome.decisions[0].type, outcome.applied), message: outcome.memberMessage });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Weekly Check-In</ThemedText>
            <ThemedText style={s.headerSub}>ACP Intelligence™</ThemedText>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={s.content}>
          {result ? (
            <View style={s.resultCard}>
              <Ionicons name="sparkles" size={28} color={palette.blue500} style={{ marginBottom: 10 }} />
              <ThemedText style={s.resultHeadline}>{result.headline}</ThemedText>
              <ThemedText style={s.resultMessage}>{result.message}</ThemedText>
              <TouchableOpacity style={s.doneBtn} onPress={() => router.back()} activeOpacity={0.85}>
                <ThemedText style={s.doneBtnText}>Done</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.question}>
                <ThemedText style={s.questionText}>How did your workouts feel overall?</ThemedText>
                <OptionRow options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
              </View>
              <View style={s.question}>
                <ThemedText style={s.questionText}>How was your energy this week?</ThemedText>
                <OptionRow options={ENERGY_OPTIONS} value={energy} onChange={setEnergy} />
              </View>
              <View style={s.question}>
                <ThemedText style={s.questionText}>Any pain or discomfort during training?</ThemedText>
                <YesNoRow value={pain} onChange={setPain} />
              </View>
              <View style={s.question}>
                <ThemedText style={s.questionText}>Has your availability changed for next week?</ThemedText>
                <YesNoRow value={scheduleChanged} onChange={setScheduleChanged} />
              </View>

              <TouchableOpacity
                style={[s.submitBtn, (!canSubmit || submitting) && { opacity: 0.5 }]}
                onPress={submit}
                disabled={!canSubmit || submitting}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={s.submitBtnText}>Submit</ThemedText>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { padding: 20, gap: 24 },
  question: { gap: 10 },
  questionText: { fontSize: 15, fontWeight: '700', color: palette.ink900 },

  option: {
    flex: 1, paddingVertical: 12, borderRadius: radii.pill, alignItems: 'center',
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.hairline,
  },
  optionActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  optionText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  optionTextActive: { color: '#fff' },

  submitBtn: { backgroundColor: palette.blue500, borderRadius: radii.pill, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  resultCard: { alignItems: 'center', paddingTop: 40 },
  resultHeadline: { fontSize: 20, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginBottom: 10 },
  resultMessage: { fontSize: 14, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  doneBtn: { backgroundColor: palette.ink900, borderRadius: radii.pill, paddingHorizontal: 32, paddingVertical: 13 },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

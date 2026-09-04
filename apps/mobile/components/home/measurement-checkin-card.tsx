// Beta Feedback #020 — the Home "WEEKLY CHECK-IN" card. In-app due state is
// the source of truth (§2): this renders whenever the check-in is
// actionable, whether or not notifications are permitted (§20). Neutral,
// evidence-collection language only — never body-judgement (§25).

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';
import {
  MEASUREMENT_CHECKIN_COPY, isMeasurementCheckinActionable,
  type MeasurementCheckinStatus,
} from '@/lib/progress/measurement-checkin';

export function MeasurementCheckinCard({
  status,
  onPress,
}: {
  status: MeasurementCheckinStatus;
  /** optional hook so Home can refresh its own state after the entry flow */
  onPress?: () => void;
}) {
  const router = useRouter();
  if (!isMeasurementCheckinActionable(status)) return null;

  const title = status === 'overdue' ? MEASUREMENT_CHECKIN_COPY.overdueTitle : MEASUREMENT_CHECKIN_COPY.dueTitle;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.9}
      onPress={() => { onPress?.(); router.push('/log-progress' as any); }}
    >
      <Text style={s.eyebrow}>{MEASUREMENT_CHECKIN_COPY.eyebrow}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{MEASUREMENT_CHECKIN_COPY.body}</Text>
      <View style={s.cta}>
        <Text style={s.ctaText}>{MEASUREMENT_CHECKIN_COPY.cta}</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10, fontWeight: '800', color: palette.blue600,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  title: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900, marginTop: 3 },
  body: { fontSize: fontSize.sm, color: palette.gray450, lineHeight: 19, marginTop: 8 },
  cta: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, backgroundColor: palette.ink900, borderRadius: radii.lg,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  ctaText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});

// ACP Intelligence™ — Nutrition N7. Fitness × Nutrition context cards.
//
// Descriptive, non-causal, non-moralising (§32). Each card places recent
// ACTUAL training next to recent nutrition evidence and says only what both
// domains support. "Why am I seeing this?" is the deterministic evidence
// explanation (§21) — there is no LLM anywhere in N7.

import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import type { CrossDomainNutritionObservation, CrossDomainAction } from '@/lib/nutrition/nutrition-fitness-context';

const ACTION_LABEL: Record<CrossDomainAction, string> = {
  review_recent_nutrition: 'Review recent nutrition',
  review_training_week: 'Review your training week',
  log_food: 'Log today’s food',
};
const ACTION_ROUTE: Record<CrossDomainAction, string> = {
  review_recent_nutrition: '/nutrition-history',
  review_training_week: '/my-plan',
  log_food: '/log-food',
};

export function NutritionActivityContext({ observations }: { observations: CrossDomainNutritionObservation[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  if (observations.length === 0) return null;

  return (
    <View style={s.wrap}>
      <ThemedText style={s.sectionTitle}>Your activity &amp; nutrition</ThemedText>
      <ThemedText style={s.sectionSub}>How your recent nutrition sits alongside what you’ve actually been doing.</ThemedText>

      {observations.map(o => (
        <View key={o.id} style={s.card}>
          <ThemedText style={s.cardTitle}>{o.title}</ThemedText>
          <ThemedText style={s.cardBody}>{o.body}</ThemedText>

          <View style={s.cardActions}>
            <TouchableOpacity
              onPress={() => router.push(ACTION_ROUTE[o.action] as any)}
              activeOpacity={0.8}
              style={s.actionBtn}
            >
              <ThemedText style={s.actionText}>{ACTION_LABEL[o.action]}</ThemedText>
              <Ionicons name="chevron-forward" size={13} color={palette.blue600} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpenId(openId === o.id ? null : o.id)} activeOpacity={0.7}>
              <ThemedText style={s.whyLink}>{openId === o.id ? 'Hide' : 'Why am I seeing this?'}</ThemedText>
            </TouchableOpacity>
          </View>

          {openId === o.id && <ThemedText style={s.why}>{o.why}</ThemedText>}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  sectionSub: { fontSize: 12, color: palette.gray450, marginTop: 3, marginBottom: 10, lineHeight: 17 },
  card: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink900 },
  cardBody: { fontSize: 13, color: palette.ink700, lineHeight: 19, marginTop: 5 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actionText: { fontSize: 12.5, fontWeight: '800', color: palette.blue600 },
  whyLink: { fontSize: 12, fontWeight: '600', color: palette.gray450 },
  why: { fontSize: 12, color: palette.gray450, lineHeight: 17, marginTop: 10 },
});

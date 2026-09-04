// Lana — Nutrition N9. "What Lana is learning" — longitudinal
// outcome observations on the Fitness Journey screen.
//
// Every line is an OBSERVED, REPEATED association across recent weeks —
// "has tended to coincide with", never "caused" / "works for you" (§2/§50).
// "Why am I seeing this?" is the deterministic episode/week count that let
// the pattern clear its gate (§32). No LLM anywhere in N9.

import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import type { OutcomeObservation, OutcomeConfidence } from '@/lib/nutrition/nutrition-outcome-intelligence';

const CONFIDENCE_LABEL: Record<OutcomeConfidence, string> = {
  emerging: 'Emerging pattern',
  moderate: 'Repeated pattern',
  strong: 'Consistent pattern',
};

export function NutritionWhatLanaIsLearning({ observations }: { observations: OutcomeObservation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (observations.length === 0) return null;

  return (
    <View style={s.wrap}>
      <ThemedText style={s.sectionTitle}>What Lana is learning</ThemedText>
      <ThemedText style={s.sectionSub}>
        Patterns that have tended to coincide with your progress across recent weeks. These are observations, not conclusions about cause.
      </ThemedText>

      {observations.map(o => (
        <View key={o.id} style={s.card}>
          <View style={s.cardHead}>
            <ThemedText style={s.cardTitle}>{o.title}</ThemedText>
            <ThemedText style={s.badge}>{CONFIDENCE_LABEL[o.confidence]}</ThemedText>
          </View>
          <ThemedText style={s.cardBody}>{o.body}</ThemedText>

          <TouchableOpacity
            onPress={() => setOpenId(openId === o.id ? null : o.id)}
            activeOpacity={0.7}
            style={s.whyRow}
          >
            <ThemedText style={s.whyLink}>{openId === o.id ? 'Hide' : 'Why am I seeing this?'}</ThemedText>
          </TouchableOpacity>

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
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink900 },
  badge: { fontSize: 10.5, fontWeight: '700', color: palette.gray450, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardBody: { fontSize: 13, color: palette.ink700, lineHeight: 19, marginTop: 5 },
  whyRow: { marginTop: 12 },
  whyLink: { fontSize: 12, fontWeight: '600', color: palette.gray450 },
  why: { fontSize: 12, color: palette.gray450, lineHeight: 17, marginTop: 10 },
});

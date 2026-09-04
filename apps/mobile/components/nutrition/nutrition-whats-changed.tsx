// ACP Intelligence™ — Nutrition N8. "What's changed" — advice-effectiveness cards.
//
// Observational, never causal (§27). Each card states how a nutrient's
// SUBSEQUENT logged average moved relative to the FROZEN snapshot taken when
// an N4 coaching card was shown — "since this suggestion was shown…", never
// "the advice worked". "Why am I seeing this?" is the deterministic
// before/after evidence (§31). No LLM anywhere in N8.

import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import type { NutritionAdviceEffectiveness } from '@/lib/nutrition/nutrition-advice-effectiveness';

const NUTRIENT_TITLE: Record<string, string> = { proteinG: 'Protein', fibreG: 'Fibre' };

export function NutritionWhatsChanged({ observations }: { observations: NutritionAdviceEffectiveness[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (observations.length === 0) return null;

  return (
    <View style={s.wrap}>
      <ThemedText style={s.sectionTitle}>What&apos;s changed</ThemedText>
      <ThemedText style={s.sectionSub}>How your logs have moved since Lana showed a suggestion — an observation, not a verdict.</ThemedText>

      {observations.map(o => (
        <View key={o.exposureId} style={s.card}>
          <ThemedText style={s.cardTitle}>{NUTRIENT_TITLE[o.nutrient] ?? o.nutrient}</ThemedText>
          <ThemedText style={s.cardBody}>{o.summary}</ThemedText>

          <TouchableOpacity onPress={() => setOpenId(openId === o.exposureId ? null : o.exposureId)} activeOpacity={0.7} style={s.whyRow}>
            <ThemedText style={s.whyLink}>{openId === o.exposureId ? 'Hide' : 'Why am I seeing this?'}</ThemedText>
          </TouchableOpacity>

          {openId === o.exposureId && <ThemedText style={s.why}>{o.why}</ThemedText>}
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
  whyRow: { marginTop: 12 },
  whyLink: { fontSize: 12, fontWeight: '600', color: palette.gray450 },
  why: { fontSize: 12, color: palette.gray450, lineHeight: 17, marginTop: 10 },
});

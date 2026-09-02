// ACP Intelligence™ — Nutrition N4. Coaching cards.
//
// Practical, calm, non-judgemental (§31). Each card's body is either a
// validated model rephrase or the deterministic template — both are safe and
// grounded in the user's own logs. "Why am I seeing this?" is always the
// deterministic evidence explanation (§29), never model text.

import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import type { CoachingValidationResult } from '@/lib/nutrition/nutrition-coaching-safety';

export function NutritionCoachingSection({ result }: { result: CoachingValidationResult }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  if (result.cards.length === 0) return null;

  return (
    <View>
      <ThemedText style={s.sectionTitle}>For your next few days</ThemedText>
      {result.summary && <ThemedText style={s.summary}>{result.summary}</ThemedText>}

      {result.cards.map(card => (
        <View key={card.id} style={s.card}>
          <ThemedText style={s.cardTitle}>{card.title}</ThemedText>
          <ThemedText style={s.cardBody}>{card.body}</ThemedText>

          <View style={s.cardActions}>
            <TouchableOpacity
              onPress={() => router.push(card.action.route as any)}
              activeOpacity={0.8}
              style={s.actionBtn}
            >
              <ThemedText style={s.actionText}>{card.action.label}</ThemedText>
              <Ionicons name="chevron-forward" size={13} color={palette.blue600} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpenId(openId === card.id ? null : card.id)} activeOpacity={0.7}>
              <ThemedText style={s.whyLink}>{openId === card.id ? 'Hide' : 'Why am I seeing this?'}</ThemedText>
            </TouchableOpacity>
          </View>

          {openId === card.id && <ThemedText style={s.why}>{card.why}</ThemedText>}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  summary: { fontSize: 13, color: palette.ink600, marginBottom: 12, lineHeight: 19 },
  card: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'],
    padding: 16, marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: palette.ink900 },
  cardBody: { fontSize: 13.5, color: palette.ink700, lineHeight: 20, marginTop: 6 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText: { fontSize: 12.5, fontWeight: '700', color: palette.blue600 },
  whyLink: { fontSize: 11.5, fontWeight: '700', color: palette.gray450 },
  why: { fontSize: 12, color: palette.ink600, marginTop: 10, lineHeight: 17 },
});

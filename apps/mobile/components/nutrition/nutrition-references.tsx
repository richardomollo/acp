// ACP Intelligence™ — Nutrition N3. Reference-comparison UI.
//
// Neutral by design (§18): no red/green, no "good"/"bad"/"deficient". Every
// row is a factual comparison to a named, sourced reference — never a
// recommendation (§30). Rows the user's context can't support are either
// collapsed into one honest banner (age unknown / under 18 — the same
// reason for every nutrient) or shown with a short, specific reason.

import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import { NUTRIENT_LABEL, NUTRIENT_UNIT, formatNutrientAmount } from '@/lib/nutrition/nutrient-display';
import type { UserReferenceContext, NutritionReferenceComparison, ComparisonState } from '@/lib/nutrition/nutrition-reference-engine';

const STATE_LABEL: Record<ComparisonState, string> = {
  below_reference: 'Below reference',
  meets_or_exceeds_reference: 'At or above reference',
  below_range: 'Below range',
  within_range: 'Within range',
  above_range: 'Above range',
  insufficient_days: 'Not enough logged days yet',
  insufficient_data: 'Not enough nutrient data yet',
  insufficient_context: 'Reference unavailable',
  not_applicable: 'Reference not applicable',
  unsupported: 'Reference unavailable',
};

const READINESS_QUALIFIER: Record<string, string> = {
  limited: 'Early comparison — ',
  moderate: 'Emerging comparison — ',
  high: '',
};

function formatReferenceValue(ref: NutritionReferenceComparison['reference']): string {
  if (ref.status !== 'available') return '—';
  const r = ref.reference;
  if (r.referenceType === 'exact') return `${formatNutrientAmount(r.value as number, r.unit as any)} ${r.unit}`;
  return `${r.min}–${r.max} ${r.unit}/day`;
}

function explanation(c: NutritionReferenceComparison): string {
  if (c.reference.status !== 'available') return '';
  const r = c.reference.reference;
  const base = r.personalised
    ? 'Calculated from your current logged body weight and a published sport-nutrition intake range.'
    : `Reference value for adults${r.notes ? ` — ${r.notes}` : ''}.`;
  return `${base} Source: ${r.source.organisation}, ${r.source.year}.`;
}

function ReferenceRow({ c }: { c: NutritionReferenceComparison }) {
  const [expanded, setExpanded] = useState(false);
  const unavailable = c.state === 'insufficient_days' || c.state === 'insufficient_data'
    || c.state === 'insufficient_context' || c.state === 'unsupported';

  if (unavailable) {
    const reason = c.reference.status !== 'available' ? c.reference.reason
      : c.state === 'insufficient_days' ? 'Log a few more days to see this comparison.'
      : 'Not enough nutrient data was available across your logged foods.';
    return (
      <View style={s.row}>
        <ThemedText style={s.name}>{NUTRIENT_LABEL[c.nutrient]}</ThemedText>
        <ThemedText style={s.unavailableText}>{reason}</ThemedText>
      </View>
    );
  }

  const qualifier = READINESS_QUALIFIER[c.readiness] ?? '';
  return (
    <View style={s.row}>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.7}>
        <View style={s.rowHeader}>
          <ThemedText style={s.name}>{NUTRIENT_LABEL[c.nutrient]}</ThemedText>
          <ThemedText style={s.stateChip}>{STATE_LABEL[c.state]}</ThemedText>
        </View>
        <ThemedText style={s.actual}>
          Average logged: {c.actual.value != null ? formatNutrientAmount(c.actual.value, NUTRIENT_UNIT[c.nutrient as keyof typeof NUTRIENT_UNIT] ?? 'g') : '—'} {NUTRIENT_UNIT[c.nutrient as keyof typeof NUTRIENT_UNIT] ?? ''}/day
        </ThemedText>
        <ThemedText style={s.reference}>Reference: {formatReferenceValue(c.reference)}</ThemedText>
        <ThemedText style={s.basis}>
          {qualifier}based on {c.actual.loggedDays} logged {c.actual.loggedDays === 1 ? 'day' : 'days'}
          {c.actual.coverage != null && c.actual.coverage < 1 ? ' · partial nutrient data' : ''}
        </ThemedText>
        <ThemedText style={s.link}>{expanded ? 'Hide' : 'How is this calculated?'}</ThemedText>
      </TouchableOpacity>
      {expanded && <ThemedText style={s.explain}>{explanation(c)}</ThemedText>}
    </View>
  );
}

export function NutritionReferenceSection({
  context, comparisons,
}: {
  context: UserReferenceContext;
  comparisons: NutritionReferenceComparison[];
}) {
  // A single honest banner instead of 11 identical "not applicable" rows when
  // the whole section can't apply to this user for one age-related reason.
  if (context.age.status === 'insufficient_context') {
    return (
      <View style={s.banner}>
        <ThemedText style={s.bannerTitle}>Your nutrition references</ThemedText>
        <ThemedText style={s.bannerText}>Add your date of birth to see how your logged nutrition compares with published references.</ThemedText>
      </View>
    );
  }
  if (context.age.status === 'available' && context.age.value < 18) {
    return (
      <View style={s.banner}>
        <ThemedText style={s.bannerTitle}>Your nutrition references</ThemedText>
        <ThemedText style={s.bannerText}>These references are for adults (18+) and aren&apos;t applied to under-18 accounts.</ThemedText>
      </View>
    );
  }

  return (
    <View>
      <ThemedText style={s.sectionTitle}>Your nutrition references</ThemedText>
      {comparisons.map(c => <ReferenceRow key={c.nutrient} c={c} />)}
      <ThemedText style={s.about}>
        References are published population intake values (European Food Safety Authority) and, for
        protein, a sport-nutrition consensus range (International Society of Sports Nutrition) resolved
        against your logged body weight. They do not account for pregnancy, breastfeeding, or medical
        conditions, and are not medical advice.
      </ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  stateChip: {
    fontSize: 11, fontWeight: '700', color: palette.ink700,
    backgroundColor: palette.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
  },
  actual: { fontSize: 13, color: palette.ink700, marginTop: 4 },
  reference: { fontSize: 12.5, color: palette.gray450, marginTop: 2 },
  basis: { fontSize: 11.5, color: palette.gray300, marginTop: 4 },
  link: { fontSize: 11.5, fontWeight: '700', color: palette.blue600, marginTop: 6 },
  explain: { fontSize: 12.5, color: palette.ink600, marginTop: 8, lineHeight: 18 },
  unavailableText: { fontSize: 12.5, color: palette.gray450, marginTop: 3 },
  about: { fontSize: 11, color: palette.gray300, marginTop: 14, lineHeight: 16 },
  banner: { backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'], padding: 16, marginTop: 4 },
  bannerTitle: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  bannerText: { fontSize: 13, color: palette.ink700, lineHeight: 19 },
});

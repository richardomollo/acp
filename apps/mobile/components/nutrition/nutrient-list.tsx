// ACP Intelligence™ — Nutrition N2. Presentational nutrient/completeness bits.
// Pure display: takes already-aggregated numbers + completeness and renders
// them. No data fetching, no maths beyond rounding for display.

import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette } from '@/constants/theme';
import type { NutrientKey } from '@/lib/nutrition/food-types';
import {
  NUTRIENT_LABEL, NUTRIENT_UNIT, formatNutrientAmount,
} from '@/lib/nutrition/nutrient-display';
import type { CompletenessLevel, NutrientCompleteness } from '@/lib/nutrition/nutrition-history';

const LEVEL_TEXT: Record<CompletenessLevel, string> = {
  complete: 'Complete',
  partial: 'Partial data',
  limited: 'Limited data',
  none: 'No data',
};
const LEVEL_COLOR: Record<CompletenessLevel, string> = {
  complete: palette.gray300,
  partial: palette.warning700,
  limited: palette.warning700,
  none: palette.gray200,
};

export function CompletenessLabel({ level }: { level: CompletenessLevel }) {
  return <ThemedText style={[s.completeness, { color: LEVEL_COLOR[level] }]}>{LEVEL_TEXT[level]}</ThemedText>;
}

/** One nutrient: label · amount+unit · completeness. `value` null = unknown. */
export function NutrientRow({
  nutrientKey, value, completeness,
}: {
  nutrientKey: NutrientKey;
  value: number | null | undefined;
  completeness?: NutrientCompleteness;
}) {
  const unit = NUTRIENT_UNIT[nutrientKey];
  const known = value != null;
  return (
    <View style={s.row}>
      <ThemedText style={s.name}>{NUTRIENT_LABEL[nutrientKey]}</ThemedText>
      <View style={s.right}>
        <ThemedText style={[s.value, !known && s.valueUnknown]}>
          {known ? `${formatNutrientAmount(value as number, unit)} ${unit}` : 'Not available'}
        </ThemedText>
        {completeness && completeness.totalEntryCount > 0 && completeness.level !== 'complete' && (
          <ThemedText style={s.coverage}>
            Data for {completeness.knownEntryCount} of {completeness.totalEntryCount} logged foods
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/**
 * A list of nutrient rows for the given keys. Rows whose completeness level is
 * 'none' are hidden unless `showEmpty` — keeps the screen quiet (§7).
 */
export function NutrientList({
  keys, micros, completeness, showEmpty = false,
}: {
  keys: readonly NutrientKey[];
  micros: Partial<Record<NutrientKey, number | null>>;
  completeness: Record<NutrientKey, NutrientCompleteness>;
  showEmpty?: boolean;
}) {
  const shown = keys.filter(k => showEmpty || (completeness[k]?.level ?? 'none') !== 'none');
  if (shown.length === 0) {
    return <ThemedText style={s.emptyNote}>No nutrient data for the foods logged.</ThemedText>;
  }
  return (
    <View>
      {shown.map(k => (
        <NutrientRow key={k} nutrientKey={k} value={micros[k]} completeness={completeness[k]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline, gap: 12,
  },
  name: { fontSize: 14, color: palette.ink700, flexShrink: 1 },
  right: { alignItems: 'flex-end' },
  value: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  valueUnknown: { fontWeight: '400', color: palette.gray300 },
  coverage: { fontSize: 11, color: palette.gray450, marginTop: 2 },
  completeness: { fontSize: 11, fontWeight: '700' },
  emptyNote: { fontSize: 13, color: palette.gray300, paddingVertical: 12 },
});

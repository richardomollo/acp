// ACP Intelligence™ — Nutrition N2. "What ACP has observed" + a tiny recent
// energy strip. Deterministic display of the pattern evidence — no coaching,
// no recommendations, no judgement (§29).

import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import type { NutritionPatternEvidence } from '@/lib/nutrition/nutrition-patterns';
import type { DayNutrition } from '@/lib/nutrition/nutrition-history';

const TIER_LABEL: Record<NutritionPatternEvidence['tier'], string> = {
  daily_observation: 'Today only',
  early_observation: 'Early observation',
  emerging_pattern: 'Emerging pattern',
  recent_pattern: 'Recent pattern',
};

/**
 * Renders only when the evidence threshold is met (tier !== daily_observation).
 * Returns null otherwise so the caller doesn't need to branch.
 */
export function ObservedPanel({ patterns }: { patterns: NutritionPatternEvidence }) {
  if (patterns.tier === 'daily_observation' || patterns.observations.length === 0) return null;
  return (
    <View style={s.panel}>
      <ThemedText style={s.eyebrow}>What Lana has noticed</ThemedText>
      <ThemedText style={s.basis}>
        {TIER_LABEL[patterns.tier]} · based on {patterns.loggedDayCount} logged {patterns.loggedDayCount === 1 ? 'day' : 'days'}
      </ThemedText>
      <View style={{ marginTop: 10, gap: 8 }}>
        {patterns.observations.map((line, i) => (
          <View key={i} style={s.obsRow}>
            <View style={s.dot} />
            <ThemedText style={s.obsText}>{line}</ThemedText>
          </View>
        ))}
      </View>
      <ThemedText style={s.footNote}>Observations only — based on what you logged.</ThemedText>
    </View>
  );
}

/** A small bar per day (newest → oldest), height ∝ logged energy. No-log days show a hairline. */
export function DayEnergyStrip({ days }: { days: DayNutrition[] }) {
  const max = Math.max(1, ...days.map(d => d.energyKcal));
  return (
    <View style={s.strip}>
      {[...days].reverse().map(d => {
        const h = d.hasLogs ? Math.max(4, Math.round((d.energyKcal / max) * 44)) : 2;
        return (
          <View key={d.localDate} style={s.stripCol}>
            <View style={[s.bar, { height: h, backgroundColor: d.hasLogs ? palette.ink700 : palette.border }]} />
            <ThemedText style={s.stripDay}>{d.localDate.slice(8)}</ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'], padding: 18, marginTop: 8 },
  eyebrow: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  basis: { fontSize: 12, color: palette.gray450, marginTop: 6 },
  obsRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.ink700, marginTop: 7 },
  obsText: { flex: 1, fontSize: 13.5, color: palette.ink700, lineHeight: 19 },
  footNote: { fontSize: 11, color: palette.gray300, marginTop: 12 },

  strip: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 64, marginTop: 4 },
  stripCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', borderRadius: 3 },
  stripDay: { fontSize: 10, color: palette.gray300 },
});

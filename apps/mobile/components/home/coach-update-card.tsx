// LANA — Phase 4.5: transient "From your coach" Home card.
//
// Shown ONLY when the latest completed professional session is `completed_today`
// (ContinuityModel.showHomeCard). Never permanent, never replaces Lana's
// primary activity card. Tap → /coach-update?sessionId=…

import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';
import { localISODate } from '@/lib/fulfilment';
import { setTaskDone } from '@/services/professional-continuity-service';
import {
  professionalDisplayName,
  attributionLabel,
  isTaskDoneForPeriod,
  type ContinuityModel,
  type ContinuityTaskRow,
} from '@/lib/professional-continuity';

export function CoachUpdateCard({ model }: { model: ContinuityModel }) {
  const router = useRouter();
  const session = model.latestSession;
  if (!model.showHomeCard || !session) return null;

  const coach = professionalDisplayName(session.professionalName);
  const stepCount = model.latestSessionTasks.length;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/coach-update', params: { sessionId: session.sessionId } } as never)}
    >
      <ThemedText style={s.eyebrow}>From your coach</ThemedText>
      <ThemedText style={s.headline}>
        {coach} added notes from today&apos;s session
      </ThemedText>
      {session.focus ? <ThemedText style={s.focus}>{session.focus}</ThemedText> : null}
      <View style={s.footerRow}>
        <ThemedText style={s.meta}>
          {stepCount > 0 ? `${stepCount} next step${stepCount === 1 ? '' : 's'}` : 'View update'}
        </ThemedText>
        <View style={s.link}>
          <ThemedText style={s.linkText}>View update</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={palette.blue500} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * §8 — professional actions due today as a SECONDARY, visibly-attributed input
 * near Today's Focus. Never "Lana recommends". Capped per the pure rule; a
 * "View all" affordance appears when there's overflow. Not a Lana plan
 * activity, never flips a rest day.
 */
export function HomeCoachActions({ model, onChanged }: { model: ContinuityModel; onChanged?: () => void }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({});
  const { shown, overflow } = model.today;
  if (shown.length === 0) return null;

  // Group the shown actions by professional so attribution is explicit.
  const groups = new Map<string, typeof shown>();
  for (const a of shown) {
    const name = professionalDisplayName(a.task.professionalName);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(a);
  }

  const toggle = async (task: ContinuityTaskRow) => {
    setSavingId(task.id);
    const already = localDone[task.id] ?? isTaskDoneForPeriod(task, localISODate(new Date()));
    setLocalDone((p) => ({ ...p, [task.id]: !already }));
    const { error } = await setTaskDone(task, !already);
    if (error) setLocalDone((p) => ({ ...p, [task.id]: already }));
    setSavingId(null);
    onChanged?.();
  };

  return (
    <View style={s.actionsWrap}>
      {[...groups.entries()].map(([name, actions]) => (
        <View key={name} style={{ marginBottom: 4 }}>
          <ThemedText style={s.actionsGroupLabel}>{attributionLabel(name)}</ThemedText>
          {actions.map(({ task, overdue }) => {
            const done = localDone[task.id] ?? isTaskDoneForPeriod(task, localISODate(new Date()));
            return (
              <TouchableOpacity
                key={task.id}
                style={s.actionRow}
                onPress={() => toggle(task)}
                disabled={savingId === task.id}
                activeOpacity={0.75}
              >
                {savingId === task.id ? (
                  <ActivityIndicator size="small" color={palette.blue500} />
                ) : (
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={done ? palette.blue500 : palette.gray300}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <ThemedText style={[s.actionTitle, done && s.actionTitleDone]}>{task.title}</ThemedText>
                  <ThemedText style={[s.actionMeta, overdue && { color: palette.warning500 ?? palette.gray300 }]}>
                    {overdue ? 'Overdue' : 'Due today'}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {overflow > 0 ? (
        <TouchableOpacity onPress={() => router.push('/trainer-tasks' as never)} style={s.viewAll}>
          <ThemedText style={s.viewAllText}>View all ({overflow} more)</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={palette.blue500} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  actionsWrap: { marginHorizontal: 20, marginBottom: 16 },
  actionsGroupLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 14, marginBottom: 8,
  },
  actionTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  actionTitleDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  actionMeta: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6 },
  viewAllText: { fontSize: 13, fontWeight: '700', color: palette.blue500 },

  card: {
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 16, marginHorizontal: 20, marginBottom: 16,
    backgroundColor: palette.white,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  headline: { fontSize: 15, fontWeight: '800', color: palette.ink900, letterSpacing: -0.2 },
  focus: { fontSize: fontSize.sm, color: palette.ink700, marginTop: 4 },
  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12,
  },
  meta: { fontSize: 12, color: palette.gray300, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 13, fontWeight: '700', color: palette.blue500 },
});

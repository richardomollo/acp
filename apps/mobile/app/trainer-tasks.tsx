// Phase 4.5 — "From your coach": recent professional session updates + your
// agreed actions, grouped by professional. (Route kept as /trainer-tasks.)

import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { localISODate } from '@/lib/fulfilment';
import { loadContinuityModel, setTaskDone } from '@/services/professional-continuity-service';
import {
  isTaskDoneForPeriod, professionalDisplayName, attributionLabel,
  type ContinuityModel, type ContinuityTaskRow, type ContinuitySessionRow,
} from '@/lib/professional-continuity';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  if (iso.slice(0, 10) === localISODate(new Date())) return 'Today';
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CoachUpdatesScreen() {
  const router = useRouter();
  const [model, setModel] = useState<ContinuityModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setModel(await loadContinuityModel());
    setOverrides({});
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (task: ContinuityTaskRow) => {
    setSavingId(task.id);
    const done = overrides[task.id] ?? isTaskDoneForPeriod(task, localISODate(new Date()));
    setOverrides((p) => ({ ...p, [task.id]: !done }));
    const { error } = await setTaskDone(task, !done);
    if (error) setOverrides((p) => ({ ...p, [task.id]: done }));
    setSavingId(null);
  };

  const isDone = (t: ContinuityTaskRow) => overrides[t.id] ?? isTaskDoneForPeriod(t, localISODate(new Date()));

  // Open professional actions, grouped by professional (model.groups already
  // excludes done-for-period). Recently-done ones drop off, same as the
  // original screen's behaviour.
  const groups: [string, ContinuityTaskRow[]][] = model
    ? model.groups.map((g) => [g.professionalName, g.tasks])
    : [];

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>From your coach</ThemedText>
        </View>
      </SafeAreaView>

      {loading || !model ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : !model.hasAny ? (
        <View style={s.empty}>
          <Ionicons name="chatbox-ellipses-outline" size={40} color={palette.gray300} />
          <ThemedText style={s.emptyText}>Nothing here yet</ThemedText>
          <ThemedText style={s.emptySub}>Notes and next steps from your sessions will show up here.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {model.sessions.length > 0 && (
            <View style={{ marginBottom: 28 }}>
              <ThemedText style={s.sectionTitle}>Recent updates</ThemedText>
              {model.sessions.slice(0, 5).map((session) => (
                <SessionRow key={session.sessionId} session={session} model={model} onPress={() =>
                  router.push({ pathname: '/coach-update', params: { sessionId: session.sessionId } } as never)
                } />
              ))}
            </View>
          )}

          {groups.length > 0 && (
            <View>
              <ThemedText style={s.sectionTitle}>Your actions</ThemedText>
              {groups.map(([name, tasks]) => (
                <View key={name} style={{ marginBottom: 20 }}>
                  <ThemedText style={s.groupLabel}>{attributionLabel(name)}</ThemedText>
                  <View style={s.taskList}>
                    {[...tasks]
                      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)))
                      .map((task) => {
                        const done = isDone(task);
                        return (
                          <TouchableOpacity
                            key={task.id}
                            style={s.taskRow}
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
                              <ThemedText style={[s.taskTitle, done && s.taskTitleDone]}>{task.title}</ThemedText>
                              {task.dueDate ? (
                                <ThemedText style={s.taskDue}>Due {fmtDate(task.dueDate)}</ThemedText>
                              ) : task.recurrence !== 'once' ? (
                                <ThemedText style={s.taskDue}>Repeats {task.recurrence}</ThemedText>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

function SessionRow({ session, model, onPress }: { session: ContinuitySessionRow; model: ContinuityModel; onPress: () => void }) {
  const coach = professionalDisplayName(session.professionalName);
  const steps = model.latestSession?.sessionId === session.sessionId
    ? model.latestSessionTasks.length
    : model.groups.flatMap((g) => g.tasks).filter((t) => t.sessionRecordId === session.sessionId).length;
  return (
    <TouchableOpacity style={s.sessionRow} onPress={onPress} activeOpacity={0.8}>
      <View style={{ flex: 1 }}>
        <ThemedText style={s.sessionCoach}>{coach}</ThemedText>
        <ThemedText style={s.sessionMeta}>
          {session.serviceType || 'Session'}
          {session.focus ? ` · ${session.focus}` : ''}
        </ThemedText>
        <ThemedText style={s.sessionMetaDim}>
          {fmtDate(session.completedAt)}{steps > 0 ? ` · ${steps} next step${steps === 1 ? '' : 's'}` : ''}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },
  groupLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 14, marginBottom: 10,
  },
  sessionCoach: { fontSize: 14, fontWeight: '800', color: palette.ink900 },
  sessionMeta: { fontSize: 13, color: palette.ink700, marginTop: 2 },
  sessionMetaDim: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  taskList: {},
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 14, marginBottom: 10,
  },
  taskTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  taskTitleDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  taskDue: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: palette.ink900, textAlign: 'center' },
  emptySub: { fontSize: 13, color: palette.gray300, textAlign: 'center' },
});

import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { localISODate } from '@/lib/fulfilment';
import { loadContinuityModel, setTaskDone } from '@/services/professional-continuity-service';
import {
  professionalDisplayName, flavourNoun, isTaskDoneForPeriod,
  type ContinuitySessionRow, type ContinuityTaskRow,
} from '@/lib/professional-continuity';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const today = localISODate(new Date());
  if (iso.slice(0, 10) === today) return 'Today';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CoachUpdateScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ContinuitySessionRow | null>(null);
  const [tasks, setTasks] = useState<ContinuityTaskRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const model = await loadContinuityModel();
    const s = sessionId
      ? model.sessions.find((x) => x.sessionId === sessionId) ?? null
      : model.latestSession;
    setSession(s);
    setTasks(s ? tasksForSession(model, s.sessionId) : []);
    setLoading(false);
  }, [sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (task: ContinuityTaskRow) => {
    setSavingId(task.id);
    const done = isTaskDoneForPeriod(task, localISODate(new Date()));
    // optimistic
    setTasks((prev) => prev.map((t) => t.id === task.id
      ? { ...t, status: done ? 'pending' : 'done', lastCompletedDate: done ? null : localISODate(new Date()) }
      : t));
    const { error } = await setTaskDone(task, !done);
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
    setSavingId(null);
  };

  const coach = professionalDisplayName(session?.professionalName);

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

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : !session ? (
        <View style={s.empty}>
          <Ionicons name="document-text-outline" size={40} color={palette.gray300} />
          <ThemedText style={s.emptyText}>This update isn&apos;t available</ThemedText>
          <ThemedText style={s.emptySub}>It may have been removed, or you don&apos;t have access.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ThemedText style={s.coachName}>{coach}</ThemedText>
          <ThemedText style={s.serviceLine}>
            {session.serviceType || `${flavourNoun(session.professionalFlavour)[0].toUpperCase()}${flavourNoun(session.professionalFlavour).slice(1)} session`}
            {'  ·  '}{fmtDate(session.completedAt)}
          </ThemedText>

          {session.focus ? (
            <ThemedText style={s.focus}>{session.focus}</ThemedText>
          ) : null}

          {session.clientSummary ? (
            <View style={s.noteBlock}>
              <ThemedText style={s.sectionLabel}>{coach}&apos;s note</ThemedText>
              <ThemedText style={s.noteText}>{session.clientSummary}</ThemedText>
            </View>
          ) : null}

          {tasks.length > 0 ? (
            <View style={s.block}>
              <ThemedText style={s.sectionLabel}>Your next steps</ThemedText>
              <View style={s.taskList}>
                {tasks.map((task) => {
                  const done = isTaskDoneForPeriod(task, localISODate(new Date()));
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
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {session.followUpAt ? (
            <View style={s.block}>
              <ThemedText style={s.sectionLabel}>Follow-up</ThemedText>
              <ThemedText style={s.followUp}>{fmtDate(session.followUpAt)}</ThemedText>
            </View>
          ) : null}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

// tasks belong to a session; the model already links them.
function tasksForSession(
  model: Awaited<ReturnType<typeof loadContinuityModel>>,
  sid: string,
): ContinuityTaskRow[] {
  if (model.latestSession?.sessionId === sid) return model.latestSessionTasks;
  // older session — pull its tasks out of the grouped set
  return model.groups.flatMap((g) => g.tasks).filter((t) => t.sessionRecordId === sid);
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
  coachName: { fontSize: 22, fontWeight: '800', color: palette.ink900, letterSpacing: -0.4 },
  serviceLine: { fontSize: fontSize.sm, color: palette.gray300, marginTop: 4 },
  focus: { fontSize: 17, fontWeight: '700', color: palette.ink900, marginTop: 18 },

  noteBlock: { marginTop: 20 },
  block: { marginTop: 24 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  noteText: { fontSize: 15, lineHeight: 22, color: palette.ink900 },

  taskList: {},
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 14, marginBottom: 10,
  },
  taskTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  taskTitleDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  taskDue: { fontSize: 12, color: palette.gray300, marginTop: 2 },

  followUp: { fontSize: 15, fontWeight: '700', color: palette.ink900 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: palette.ink900, textAlign: 'center' },
  emptySub: { fontSize: 13, color: palette.gray300, textAlign: 'center' },
});

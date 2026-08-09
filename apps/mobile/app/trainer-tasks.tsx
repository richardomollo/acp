import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { type Recurrence } from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'done';
  recurrence: Recurrence;
  weekdays: number[];
  last_completed_date: string | null;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Date-only sibling of computeNextOccurrence — tasks have no time-of-day,
// only a day granularity.
function currentTaskPeriod(task: TaskRow, today: Date = new Date()): string {
  const todayStr = today.toISOString().slice(0, 10);
  if (task.recurrence === 'daily') return todayStr;
  if (task.recurrence === 'weekly') {
    const dow = today.getDay();
    if (task.weekdays.includes(dow)) return todayStr;
    for (let back = 1; back <= 7; back++) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      if (task.weekdays.includes(d.getDay())) return d.toISOString().slice(0, 10);
    }
  }
  return task.due_date ?? todayStr;
}

function isTaskDoneNow(task: TaskRow): boolean {
  return task.recurrence === 'once' ? task.status === 'done' : task.last_completed_date === currentTaskPeriod(task);
}

export default function TrainerTasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }

    const { data } = await supabase
      .from('client_tasks')
      .select('id, title, due_date, status, recurrence, weekdays, last_completed_date')
      .eq('client_user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setTasks((data as TaskRow[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleTask = async (task: TaskRow) => {
    setSavingTaskId(task.id);
    const doneNow = isTaskDoneNow(task);

    if (task.recurrence === 'once') {
      const nextStatus = doneNow ? 'pending' : 'done';
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
      const { error } = await supabase.from('client_tasks').update({ status: nextStatus }).eq('id', task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    } else {
      const nextDate = doneNow ? null : currentTaskPeriod(task);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: nextDate } : t));
      const { error } = await supabase.from('client_tasks').update({ last_completed_date: nextDate }).eq('id', task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: task.last_completed_date } : t));
    }
    setSavingTaskId(null);
  };

  const pending = tasks.filter(t => !isTaskDoneNow(t));
  const done = tasks.filter(t => isTaskDoneNow(t));

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Tasks</ThemedText>
          <ThemedText style={s.headerSub}>From your trainer</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : tasks.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="checkbox-outline" size={40} color={palette.gray300} />
          <ThemedText style={s.emptyText}>No tasks yet</ThemedText>
          <ThemedText style={s.emptySub}>Anything your trainer assigns you will show up here.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {[{ label: 'To do', rows: pending }, { label: 'Done', rows: done }].map(group => (
            group.rows.length === 0 ? null : (
              <View key={group.label}>
                <ThemedText style={s.sectionTitle}>{group.label}</ThemedText>
                <View style={s.taskList}>
                  {group.rows.map(task => {
                    const doneNow = isTaskDoneNow(task);
                    const repeatLabel = task.recurrence === 'daily'
                      ? 'Repeats daily'
                      : task.recurrence === 'weekly'
                        ? `Repeats ${[...task.weekdays].sort().map(d => WEEKDAY_NAMES[d]).join(', ')}`
                        : null;
                    return (
                      <TouchableOpacity
                        key={task.id}
                        style={s.taskRow}
                        onPress={() => toggleTask(task)}
                        disabled={savingTaskId === task.id}
                        activeOpacity={0.75}
                      >
                        {savingTaskId === task.id ? (
                          <ActivityIndicator size="small" color={palette.blue500} />
                        ) : (
                          <Ionicons
                            name={doneNow ? 'checkmark-circle' : 'ellipse-outline'}
                            size={20} color={doneNow ? palette.blue500 : palette.gray300}
                          />
                        )}
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[s.taskTitle, doneNow && s.taskTitleDone]}>
                            {task.title}
                          </ThemedText>
                          {repeatLabel ? (
                            <ThemedText style={s.taskDue}>{repeatLabel}</ThemedText>
                          ) : task.due_date && (
                            <ThemedText style={s.taskDue}>
                              Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </ThemedText>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )
          ))}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
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
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  taskList: { marginBottom: 24 },
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

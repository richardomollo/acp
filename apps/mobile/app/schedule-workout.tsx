import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import {
  ensureNotificationPermission, scheduleWorkoutNotifications, cancelWorkoutNotifications,
  type Recurrence,
} from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Constants ──────────────────────────────────────────────────────────────────

const WEEKDAY_CHIPS = [
  { key: 0, label: 'S' }, { key: 1, label: 'M' }, { key: 2, label: 'T' },
  { key: 3, label: 'W' }, { key: 4, label: 'T' }, { key: 5, label: 'F' },
  { key: 6, label: 'S' },
] as const;

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const RECURRENCE_OPTIONS: { key: Recurrence; label: string; icon: string }[] = [
  { key: 'once',   label: 'Once',   icon: 'calendar-outline' },
  { key: 'daily',  label: 'Daily',  icon: 'repeat-outline'    },
  { key: 'weekly', label: 'Weekly', icon: 'sync-outline'      },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  start_date: string;
  time_of_day: string;
  recurrence: Recurrence;
  weekdays: number[];
  notification_ids: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function describeSchedule(row: ScheduleRow): string {
  const time = row.time_of_day.slice(0, 5);
  if (row.recurrence === 'once') {
    const d = new Date(`${row.start_date}T00:00:00`);
    return `Once · ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`;
  }
  if (row.recurrence === 'daily') return `Every day at ${time}`;
  const days = [...row.weekdays].sort().map(d => WEEKDAY_NAMES[d]).join(', ');
  return `Every ${days} at ${time}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

// Wrapper forces a full remount per workoutId so form state (date, time,
// recurrence, weekday selection) from a previous workout's schedule screen
// can never leak into another workout's screen if the navigator reuses the
// instance.
export default function ScheduleWorkoutScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  return <ScheduleWorkoutForm key={workoutId} />;
}

function ScheduleWorkoutForm() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();

  const [workoutTitle, setWorkoutTitle] = useState('');
  const [loading, setLoading]           = useState(true);
  const [userId, setUserId]             = useState<string | null>(null);
  const [schedules, setSchedules]       = useState<ScheduleRow[]>([]);

  const [date, setDate]                 = useState(new Date());
  const [time, setTime]                 = useState(() => {
    const d = new Date(); d.setHours(18, 0, 0, 0); return d;
  });
  const [recurrence, setRecurrence]     = useState<Recurrence>('once');
  const [weekdays, setWeekdays]         = useState<number[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async () => {
    if (!workoutId) return;
    setLoading(true);
    const session = await authService.getSession();
    setUserId(session?.user.id ?? null);

    const { data: workout } = await supabase.from('workouts').select('title').eq('id', workoutId).single();
    setWorkoutTitle(workout?.title ?? 'Workout');

    if (session?.user.id) {
      const { data } = await supabase
        .from('workout_schedules')
        .select('id, start_date, time_of_day, recurrence, weekdays, notification_ids')
        .eq('workout_id', workoutId)
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('start_date');
      setSchedules((data as ScheduleRow[]) ?? []);
    }
    setLoading(false);
  }, [workoutId]);

  useEffect(() => { load(); }, [load]);

  const toggleWeekday = (day: number) =>
    setWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());

  const onChangeDate = (_e: any, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) setDate(selected);
  };

  const onChangeTime = (_e: any, selected?: Date) => {
    setShowTimePicker(false);
    if (selected) setTime(selected);
  };

  const canSave = recurrence !== 'weekly' || weekdays.length > 0;

  const handleSchedule = async () => {
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in to schedule workouts.');
      return;
    }
    if (!canSave) {
      Alert.alert('Pick a day', 'Choose at least one weekday for a weekly schedule.');
      return;
    }
    if (recurrence === 'once') {
      const combined = new Date(date);
      combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
      if (combined.getTime() <= Date.now()) {
        Alert.alert('Pick a future time', 'The scheduled date and time must be in the future.');
        return;
      }
    }

    setSaving(true);
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications disabled',
          'Enable notifications in Settings to get reminders. The schedule will still be saved.',
        );
      }

      const notificationIds = granted
        ? await scheduleWorkoutNotifications({ workoutTitle, startDate: date, timeOfDay: time, recurrence, weekdays })
        : [];

      const hh = String(time.getHours()).padStart(2, '0');
      const mm = String(time.getMinutes()).padStart(2, '0');

      const { error } = await supabase.from('workout_schedules').insert({
        user_id:          userId,
        workout_id:       workoutId,
        start_date:       date.toISOString().slice(0, 10),
        time_of_day:      `${hh}:${mm}:00`,
        recurrence,
        weekdays:         recurrence === 'weekly' ? weekdays : [],
        notification_ids: notificationIds,
      });

      if (error) {
        Alert.alert('Error', error.message ?? 'Failed to schedule workout.');
        return;
      }

      Alert.alert('Scheduled', `${workoutTitle} has been added to your schedule.`);
      setRecurrence('once');
      setWeekdays([]);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSchedule = (row: ScheduleRow) => {
    Alert.alert('Cancel schedule?', 'This reminder will be removed.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Schedule', style: 'destructive',
        onPress: async () => {
          await cancelWorkoutNotifications(row.notification_ids ?? []);
          await supabase.from('workout_schedules').delete().eq('id', row.id);
          setSchedules(prev => prev.filter(s => s.id !== row.id));
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        {/* ── Header ── */}
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Schedule Workout</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <ThemedText style={s.workoutTitle} numberOfLines={2}>{workoutTitle}</ThemedText>

            {/* ── Date & Time ── */}
            <ThemedText style={s.sectionLabel}>Date & Time</ThemedText>
            <View style={s.row}>
              <TouchableOpacity style={s.fieldBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.75}>
                <Ionicons name="calendar-outline" size={16} color={palette.blue500} />
                <ThemedText style={s.fieldText}>{formatDate(date)}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={s.fieldBtn} onPress={() => setShowTimePicker(true)} activeOpacity={0.75}>
                <Ionicons name="time-outline" size={16} color={palette.blue500} />
                <ThemedText style={s.fieldText}>{formatTime(time)}</ThemedText>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={onChangeDate}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={time}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onChangeTime}
              />
            )}

            {/* ── Recurrence ── */}
            <ThemedText style={s.sectionLabel}>Repeat</ThemedText>
            <View style={s.row}>
              {RECURRENCE_OPTIONS.map(opt => {
                const active = recurrence === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.recurPill, active && s.recurPillActive]}
                    onPress={() => setRecurrence(opt.key)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={opt.icon as any} size={15} color={active ? '#fff' : palette.gray450} />
                    <ThemedText style={[s.recurText, active && s.recurTextActive]}>{opt.label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {recurrence === 'weekly' && (
              <View style={s.weekdayRow}>
                {WEEKDAY_CHIPS.map(wd => {
                  const active = weekdays.includes(wd.key);
                  return (
                    <TouchableOpacity
                      key={wd.key}
                      style={[s.weekdayChip, active && s.weekdayChipActive]}
                      onPress={() => toggleWeekday(wd.key)}
                      activeOpacity={0.75}
                    >
                      <ThemedText style={[s.weekdayText, active && s.weekdayTextActive]}>{wd.label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Schedule button ── */}
            <TouchableOpacity
              style={[s.scheduleBtn, saving && s.scheduleBtnDisabled]}
              onPress={handleSchedule}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="notifications-outline" size={18} color="#fff" />
                  <ThemedText style={s.scheduleBtnText}>Schedule Reminder</ThemedText>
                </>
              )}
            </TouchableOpacity>

            {/* ── Existing schedules for this workout ── */}
            {schedules.length > 0 && (
              <>
                <ThemedText style={s.sectionLabel}>Upcoming</ThemedText>
                {schedules.map(row => (
                  <View key={row.id} style={s.scheduleRow}>
                    <View style={s.scheduleIcon}>
                      <Ionicons name="alarm-outline" size={16} color={palette.blue500} />
                    </View>
                    <ThemedText style={s.scheduleText}>{describeSchedule(row)}</ThemedText>
                    <TouchableOpacity onPress={() => handleCancelSchedule(row)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={palette.gray300} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },

  content: { paddingHorizontal: 20, paddingTop: 20 },
  workoutTitle: { fontSize: 20, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3, marginBottom: 20 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4,
  },

  row: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  fieldBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  fieldText: { fontSize: 14, fontWeight: '700', color: palette.ink900 },

  recurPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
  },
  recurPillActive: { backgroundColor: palette.blue500, borderColor: palette.blue500 },
  recurText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  recurTextActive: { color: '#fff' },

  weekdayRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: -6 },
  weekdayChip: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
  },
  weekdayChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  weekdayText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  weekdayTextActive: { color: '#fff' },

  scheduleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.blue500, borderRadius: radii.xl,
    paddingVertical: 15, marginTop: 8, marginBottom: 28,
  },
  scheduleBtnDisabled: { opacity: 0.6 },
  scheduleBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  scheduleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  scheduleIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  scheduleText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: palette.ink700 },
});

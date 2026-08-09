import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CheckinRow {
  id: string;
  mood: number;
  checkin_date: string;
}

const MOODS = [
  { value: 1, emoji: '😞', label: 'Struggling' },
  { value: 2, emoji: '🙁', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
] as const;

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MoodCheckinScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMood, setSavingMood] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }
    setUserId(session.user.id);

    const { data } = await supabase
      .from('daily_checkins')
      .select('id, mood, checkin_date')
      .eq('user_id', session.user.id)
      .order('checkin_date', { ascending: false })
      .limit(60);
    setCheckins((data as CheckinRow[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const todayMood = checkins.find(c => c.checkin_date === todayDateStr())?.mood ?? null;

  const handleMoodTap = async (mood: number) => {
    if (!userId || savingMood) return;
    setSavingMood(true);
    const today = todayDateStr();
    const prevCheckins = checkins;
    setCheckins(prev => {
      const withoutToday = prev.filter(c => c.checkin_date !== today);
      return [{ id: 'pending', mood, checkin_date: today }, ...withoutToday];
    });

    const { error } = await supabase.from('daily_checkins').upsert(
      { user_id: userId, mood, checkin_date: today },
      { onConflict: 'user_id,checkin_date' },
    );
    if (error) {
      setCheckins(prevCheckins);
      Alert.alert('Error', 'Failed to save your check-in. Please try again.');
    }
    setSavingMood(false);
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>How are you feeling?</ThemedText>
          <ThemedText style={s.headerSub}>Daily mood check-in</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.moodCard}>
            <View style={s.moodRow}>
              {MOODS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.moodBtn, todayMood === m.value && s.moodBtnActive]}
                  onPress={() => handleMoodTap(m.value)}
                  disabled={savingMood}
                  activeOpacity={0.75}
                >
                  <ThemedText style={s.moodEmoji}>{m.emoji}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <ThemedText style={s.moodHint}>
              {todayMood ? `Today: ${MOODS.find(m => m.value === todayMood)?.label}` : 'Tap to log today’s mood'}
            </ThemedText>
          </View>

          <ThemedText style={s.sectionTitle}>History</ThemedText>

          {checkins.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="happy-outline" size={40} color={palette.gray300} />
              <ThemedText style={s.emptyText}>No check-ins yet</ThemedText>
            </View>
          ) : (
            checkins.map(c => {
              const mood = MOODS.find(m => m.value === c.mood);
              return (
                <View key={c.id} style={s.entryRow}>
                  <ThemedText style={s.entryEmoji}>{mood?.emoji}</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.entryLabel}>{mood?.label}</ThemedText>
                    <ThemedText style={s.entryDate}>{formatDate(c.checkin_date)}</ThemedText>
                  </View>
                </View>
              );
            })
          )}

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

  moodCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    padding: 18, alignItems: 'center', marginBottom: 28,
  },
  moodRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  moodBtn: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border,
  },
  moodBtnActive: { backgroundColor: palette.blue25, borderColor: palette.blue500 },
  moodEmoji: { fontSize: 24 },
  moodHint: { fontSize: 13, fontWeight: '600', color: palette.gray450 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 14, marginBottom: 10,
  },
  entryEmoji: { fontSize: 28 },
  entryLabel: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  entryDate: { fontSize: 12, color: palette.gray300, marginTop: 1 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: palette.gray300 },
});

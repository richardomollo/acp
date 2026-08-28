import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SessionRow {
  id: string;
  name: string;
  category: string | null;
  date: string;
  time: string;
  drop_in_price: number | null;
  image_url: string | null;
  gym_id: string;
  gyms: { name: string } | { name: string }[] | null;
}

interface SessionGroup extends SessionRow {
  occurrenceCount: number;
  recurrenceLabel: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 24 * 60 * 60 * 1000;

const formatTime = (t: string) => {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return t; }
};

const formatDate = (d: string) => {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return d; }
};

const gymName = (g: SessionRow['gyms']) => Array.isArray(g) ? g[0]?.name : g?.name;

// Sessions have no linking column between recurring occurrences, so group
// client-side by name + time + category + venue — same convention used for
// recurring experiences/classes elsewhere in the app — and label the series
// as "Daily" (consecutive calendar days), "Every {Weekday}" (same weekday
// each week), or a plain occurrence count for anything more irregular.
function groupRecurringSessions(rows: SessionRow[]): SessionGroup[] {
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const key = `${row.name}||${row.time}||${row.category ?? ''}||${row.gym_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return [...groups.values()].map(occurrences => {
    const sorted = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));
    const rep = sorted[0];

    let recurrenceLabel = formatDate(rep.date);
    if (sorted.length > 1) {
      const isDaily = sorted.every((row, i) => {
        if (i === 0) return true;
        const prev = new Date(sorted[i - 1].date + 'T00:00:00').getTime();
        const cur = new Date(row.date + 'T00:00:00').getTime();
        return cur - prev === DAY_MS;
      });
      if (isDaily) {
        recurrenceLabel = 'Daily';
      } else {
        const days = new Set(sorted.map(row => new Date(row.date + 'T00:00:00').getDay()));
        recurrenceLabel = days.size === 1 ? `Every ${WEEKDAYS[[...days][0]]}` : `${sorted.length} dates`;
      }
    }

    return { ...rep, occurrenceCount: sorted.length, recurrenceLabel };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export default function ProgressHubScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().slice(0, 10);

    // Assessment sessions are sparse and inconsistently named ("assessment"
    // vs "assesment"), so match on the shared "asses" substring rather than
    // a category (sessions has no dedicated assessment category yet) — and
    // don't cap the date window, since the next one might be more than two
    // weeks out. Fetch a wide batch of raw occurrences so a recurring series
    // (e.g. a daily 8am assessment) has enough rows to actually group.
    const { data } = await supabase
      .from('sessions')
      .select('id, name, category, date, time, drop_in_price, image_url, gym_id, gyms(name)')
      .gte('date', todayStr)
      .or('name.ilike.%asses%,category.ilike.%asses%')
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(60);

    setSessions(groupRecurringSessions((data as any) || []));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Track Progress</ThemedText>
          <ThemedText style={s.headerSub}>Log your own measurements or book an assessment</ThemedText>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.logCta} onPress={() => router.push('/log-progress' as any)} activeOpacity={0.85}>
          <View style={s.logCtaIcon}>
            <Ionicons name="add-circle-outline" size={26} color={palette.white} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.logCtaTitle}>Log Progress</ThemedText>
            <ThemedText style={s.logCtaSub}>Record your weight and body measurements yourself</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <ThemedText style={s.sectionTitle}>Full Body Assessments</ThemedText>
        <ThemedText style={s.sectionSub}>Prefer a professional check? Book an assessment session near you.</ThemedText>

        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 40 }} />
        ) : sessions.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={palette.gray200} />
            <ThemedText style={s.emptyText}>No assessment sessions scheduled right now</ThemedText>
          </View>
        ) : (
          <View style={s.listCard}>
            {sessions.map((sess, i) => (
              <TouchableOpacity
                key={sess.id}
                style={s.sessionRow}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/session-details', params: { sessionId: sess.id } } as any)}
              >
                {i > 0 && <View style={s.rowDividerTop} />}
                <View style={s.sessionThumb}>
                  {sess.image_url ? (
                    <Image source={{ uri: sess.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFillObject, s.sessionThumbFallback]}>
                      <Ionicons name="body-outline" size={20} color="rgba(255,255,255,0.9)" />
                    </View>
                  )}
                </View>
                <View style={s.sessionInfo}>
                  <View style={s.sessionBadges}>
                    <ThemedText style={s.sessionCategory}>{sess.category || 'Class'}</ThemedText>
                    {sess.occurrenceCount > 1 && (
                      <View style={s.recurringChip}>
                        <ThemedText style={s.recurringChipText}>{sess.occurrenceCount} dates</ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText style={s.sessionName} numberOfLines={1}>{sess.name}</ThemedText>
                  <ThemedText style={s.sessionMeta} numberOfLines={1}>
                    {gymName(sess.gyms) ? `${gymName(sess.gyms)} · ` : ''}{sess.recurrenceLabel} · {formatTime(sess.time)}
                  </ThemedText>
                </View>
                <ThemedText style={s.sessionPrice}>
                  {sess.drop_in_price ? `KES ${Number(sess.drop_in_price).toLocaleString()}` : 'Free'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.surfaceApp },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { padding: 16 },

  logCta: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.blue500, borderRadius: radii.lg,
    padding: 16, marginBottom: 24,
  },
  logCtaIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  logCtaTitle: { fontSize: fontSize.base, fontWeight: '800', color: palette.white },
  logCtaSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 4 },
  sectionSub: { fontSize: fontSize.xs, color: palette.gray300, marginBottom: 14, lineHeight: 16 },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { fontSize: fontSize.sm, color: palette.gray300 },

  listCard: { borderRadius: radii.lg, backgroundColor: palette.white, overflow: 'hidden' },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowDividerTop: {
    position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: palette.hairline,
  },
  sessionThumb: { width: 52, height: 52, borderRadius: radii.md, overflow: 'hidden', backgroundColor: palette.blue50 },
  sessionThumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue500 },
  sessionInfo: { flex: 1, minWidth: 0 },
  sessionBadges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sessionCategory: { fontSize: fontSize.xs, color: palette.gray300, textTransform: 'capitalize' },
  recurringChip: {
    paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: radii.pill,
    backgroundColor: palette.blue25,
  },
  recurringChipText: { fontSize: 10, fontWeight: '700', color: palette.blue500 },
  sessionName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  sessionMeta: { fontSize: fontSize.xs, color: palette.gray450, marginTop: 2 },
  sessionPrice: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900, flexShrink: 0 },
});

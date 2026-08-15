import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePickerModal from '@/components/DatePickerModal';

const PRIMARY = '#000000';

type FilterType = 'upcoming' | 'today' | 'past';

interface Session {
  id: string;
  gym_id: string;
  name: string;
  date: string;
  time: string;
  duration_minutes: number;
  max_capacity: number;
  drop_in_price: number | null;
  is_active: boolean;
  category: string;
  instructor: string;
  gym_name: string;
  bookings_count: number;
  recurring?: boolean;
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });

const categoryColor: Record<string, string> = {
  strength: '#7c3aed', cardio: '#dc2626', yoga: '#0891b2',
  pilates: '#059669', dance: '#db2777', martial_arts: '#d97706', default: '#6b7280',
};

export default function SessionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('upcoming');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [gymIds, setGymIds] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useFocusEffect(useCallback(() => { loadSessions(); }, []));

  const loadSessions = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners').select('id').eq('user_id', user.id).single();
      if (!partner) return;

      const { data: partnerGyms } = await supabase
        .from('partner_gyms').select('gym_id').eq('partner_id', partner.id);
      const ids = (partnerGyms || []).map((pg: any) => pg.gym_id);
      setGymIds(ids);

      await fetchSessions(ids, filter);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSessions = async (ids: string[], f: FilterType, datePick: Date | null = null) => {
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('sessions')
      .select('id, gym_id, name, date, time, duration_minutes, max_capacity, drop_in_price, is_active, category, instructor, recurring, gyms(name)')
      .in('gym_id', ids);

    if (datePick) {
      query = query.eq('date', datePick.toISOString().split('T')[0]);
    } else if (f === 'today') {
      query = query.eq('date', today);
    } else if (f === 'upcoming') {
      query = query.gte('date', today);
    } else {
      query = query.lt('date', today);
    }

    query = query.order('date', { ascending: f !== 'past' }).order('time', { ascending: true }).limit(50);

    const { data, error } = await query;
    if (error) { Alert.alert('Error', 'Failed to load sessions'); return; }

    const withCounts = await Promise.all(
      (data || []).map(async (s: any) => {
        const { count } = await supabase
          .from('bookings').select('*', { count: 'exact', head: true })
          .eq('session_id', s.id).eq('status', 'confirmed');
        return {
          id: s.id, gym_id: s.gym_id, name: s.name, date: s.date, time: s.time,
          duration_minutes: s.duration_minutes || 60,
          max_capacity: s.max_capacity, drop_in_price: s.drop_in_price ?? null,
          is_active: s.is_active, category: s.category || 'default',
          instructor: s.instructor || '', gym_name: s.gyms?.name || '',
          bookings_count: count || 0, recurring: !!s.recurring,
        };
      })
    );
    setSessions(withCounts);
  };

  const switchFilter = (f: FilterType) => {
    setFilter(f);
    setDateFilter(null);
    if (gymIds.length > 0) fetchSessions(gymIds, f, null);
  };

  const applyDateFilter = (date: Date) => {
    setDateFilter(date);
    setShowDatePicker(false);
    if (gymIds.length > 0) fetchSessions(gymIds, filter, date);
  };

  const clearDateFilter = () => {
    setDateFilter(null);
    if (gymIds.length > 0) fetchSessions(gymIds, filter, null);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('sessions').update({ is_active: !current }).eq('id', id);
    if (error) { Alert.alert('Error', 'Could not update session'); return; }
    setSessions(prev => prev.map(s => s.id === id ? { ...s, is_active: !current } : s));
  };

  const deleteSession = (id: string) => {
    Alert.alert('Delete session', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('sessions').delete().eq('id', id);
          if (error) { Alert.alert('Error', 'Could not delete session'); return; }
          setSessions(prev => prev.filter(s => s.id !== id));
        },
      },
    ]);
  };

  // Recurring occurrences share no linking column — grouped the same way the
  // admin/web partner dashboards do, by gym_id + name + time + category.
  const seriesCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.recurring) continue;
      const key = `${s.gym_id}||${s.name}||${s.time}||${s.category}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);
  const seriesCountFor = (s: Session) =>
    s.recurring ? (seriesCounts.get(`${s.gym_id}||${s.name}||${s.time}||${s.category}`) ?? 1) : 1;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerInner}>
          <ThemedText style={styles.title}>Sessions</ThemedText>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/partner/create-session-select-venue' as any)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>New</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {(['upcoming', 'today', 'past'] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, !dateFilter && filter === f && styles.filterTabActive]}
              onPress={() => switchFilter(f)}
            >
              <ThemedText style={[styles.filterTabText, !dateFilter && filter === f && styles.filterTabTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.filterTab, styles.calendarBtn, dateFilter && styles.filterTabActive]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={15} color={dateFilter ? '#fff' : '#6b7280'} />
          </TouchableOpacity>
        </View>

        {/* Active date chip */}
        {dateFilter && (
          <View style={styles.dateChipRow}>
            <View style={styles.dateChip}>
              <Ionicons name="calendar" size={13} color={PRIMARY} />
              <ThemedText style={styles.dateChipText}>
                {dateFilter.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </ThemedText>
              <TouchableOpacity onPress={clearDateFilter} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={PRIMARY} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSessions(true); }} tintColor={PRIMARY} />}
      >
        {sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <ThemedText style={styles.emptyTitle}>No sessions found</ThemedText>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/partner/create-session-select-venue' as any)}
            >
              <ThemedText style={styles.emptyBtnText}>Create your first session</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          sessions.map((s) => {
            const pct = s.max_capacity > 0 ? s.bookings_count / s.max_capacity : 0;
            const fillColor = pct >= 0.8 ? '#dc2626' : pct >= 0.5 ? '#d97706' : '#16a34a';
            const catColor = categoryColor[s.category] ?? categoryColor.default;
            return (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardTop}>
                  {/* Category dot + name */}
                  <View style={styles.cardMeta}>
                    <View style={[styles.catDot, { backgroundColor: catColor }]} />
                    <ThemedText style={styles.cardCategory}>
                      {s.category.replace(/_/g, ' ')}
                    </ThemedText>
                    {seriesCountFor(s) > 1 ? (
                      <View style={styles.recurringBadge}>
                        <Ionicons name="repeat" size={10} color="#5b21b6" />
                        <ThemedText style={styles.recurringBadgeText}>×{seriesCountFor(s)}</ThemedText>
                      </View>
                    ) : null}
                    <View style={[styles.activeBadge, { backgroundColor: s.is_active ? '#dcfce7' : '#f3f4f6' }]}>
                      <ThemedText style={[styles.activeBadgeText, { color: s.is_active ? '#16a34a' : '#9ca3af' }]}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </ThemedText>
                    </View>
                  </View>
                  {/* Actions */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => toggleActive(s.id, s.is_active)}
                    >
                      <Ionicons
                        name={s.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                        size={20} color={s.is_active ? '#d97706' : '#16a34a'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => router.push(`/partner/session-details/${s.id}` as any)}
                    >
                      <Ionicons name="create-outline" size={20} color={PRIMARY} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => deleteSession(s.id)}>
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>

                <ThemedText style={styles.cardName}>{s.name}</ThemedText>

                <View style={styles.cardInfo}>
                  <View style={styles.infoChip}>
                    <Ionicons name="calendar-outline" size={12} color="#6b7280" />
                    <ThemedText style={styles.infoText}>{fmtDate(s.date)}</ThemedText>
                  </View>
                  <View style={styles.infoChip}>
                    <Ionicons name="time-outline" size={12} color="#6b7280" />
                    <ThemedText style={styles.infoText}>{fmtTime(s.time)} · {s.duration_minutes}min</ThemedText>
                  </View>
                  {s.instructor ? (
                    <View style={styles.infoChip}>
                      <Ionicons name="person-outline" size={12} color="#6b7280" />
                      <ThemedText style={styles.infoText}>{s.instructor}</ThemedText>
                    </View>
                  ) : null}
                  {s.drop_in_price ? (
                    <View style={styles.infoChip}>
                      <Ionicons name="cash-outline" size={12} color="#6b7280" />
                      <ThemedText style={styles.infoText}>KES {s.drop_in_price.toLocaleString()}</ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Capacity bar */}
                <View style={styles.capacityRow}>
                  <View style={styles.capacityBar}>
                    <View style={[styles.capacityFill, { width: `${Math.min(pct * 100, 100)}%` as any, backgroundColor: fillColor }]} />
                  </View>
                  <ThemedText style={[styles.capacityText, { color: fillColor }]}>
                    {s.bookings_count}/{s.max_capacity}
                  </ThemedText>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        value={dateFilter ?? new Date()}
        onConfirm={applyDateFilter}
        onCancel={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f7' },

  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6' },
  filterTabActive: { backgroundColor: PRIMARY },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  filterTabTextActive: { color: '#fff' },

  list: { flex: 1 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9ca3af' },
  emptyBtn: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  cardCategory: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  activeBadgeText: { fontSize: 11, fontWeight: '700' },
  recurringBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  recurringBadgeText: { fontSize: 10, fontWeight: '700', color: '#5b21b6' },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 4 },

  cardName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },

  cardInfo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f9fafb', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  infoText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },

  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacityBar: { flex: 1, height: 4, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' },
  capacityFill: { height: '100%', borderRadius: 2 },
  capacityText: { fontSize: 11, fontWeight: '700', minWidth: 32, textAlign: 'right' },

  calendarBtn: { paddingHorizontal: 10 },
  dateChipRow: { paddingHorizontal: 16, paddingBottom: 10 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  dateChipText: { fontSize: 12, fontWeight: '600', color: PRIMARY },
});

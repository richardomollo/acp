import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000000';

type PTProfile = {
  id: string;
  full_name: string;
  professional_name: string | null;
};

type Booking = {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  users: { name: string | null; email: string | null } | null;
  pt_offerings: { title: string; duration_minutes: number } | null;
};

type Stats = { thisMonth: number; earnings: number; pending: number };

type ExpBooking = {
  id: string;
  status: string;
  created_at: string;
  guest_name: string | null;
  email: string | null;
  experiences: { name: string; date: string } | null;
  users: { name: string | null } | null;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const fmtDate = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' });
};

const fmtTime = (t: string) => {
  const [h, m] = t.split(':');
  const d = new Date(); d.setHours(+h, +m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function PTHomeScreen() {
  const router = useRouter();
  const [pt, setPt] = useState<PTProfile | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [stats, setStats] = useState<Stats>({ thisMonth: 0, earnings: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasVenueRole, setHasVenueRole] = useState(false);
  const [recentExpBookings, setRecentExpBookings] = useState<ExpBooking[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: ptData }, { data: gym }] = await Promise.all([
        supabase.from('personal_trainers')
          .select('id, full_name, professional_name')
          .eq('user_id', user.id).single(),
        supabase.from('gyms').select('id').ilike('contact_email', user.email ?? '').maybeSingle(),
      ]);

      if (!ptData) return;
      setPt(ptData as any);
      setHasVenueRole(!!gym);

      if (gym) {
        const { data: partnerData } = await supabase
          .from('partners').select('id').eq('user_id', user.id).maybeSingle();
        if (partnerData) {
          const { data: pg } = await supabase
            .from('partner_gyms').select('gym_id').eq('partner_id', partnerData.id);
          const gymIds = (pg || []).map((r: any) => r.gym_id);
          if (gymIds.length > 0) {
            const { data: expData } = await supabase
              .from('experience_bookings')
              .select('id, status, created_at, guest_name, email, experiences!experience_id(name, date)')
              .in('gym_id', gymIds)
              .in('status', ['deposit_paid', 'confirmed', 'checked_in'])
              .order('created_at', { ascending: false })
              .limit(5);
            setRecentExpBookings((expData as any[]) || []);
          }
        }
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: bookings } = await supabase
        .from('pt_bookings')
        .select('id, scheduled_date, scheduled_time, status, users(name, email), pt_offerings(title, duration_minutes)')
        .eq('pt_id', ptData.id)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true })
        .limit(5);
      setUpcoming((bookings as any) || []);

      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { data: monthBookings } = await supabase
        .from('pt_bookings')
        .select('status, amount_kes')
        .eq('pt_id', ptData.id)
        .gte('created_at', monthStart.toISOString());

      const mb = (monthBookings || []) as any[];
      setStats({
        thisMonth: mb.length,
        earnings: mb.filter(b => b.status === 'completed').reduce((s: number, b: any) => s + (b.amount_kes || 0), 0),
        pending: mb.filter(b => b.status === 'pending').length,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(true); };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  }

  const displayName = pt?.professional_name || pt?.full_name || 'Trainer';

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <View style={styles.heroInner}>
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.heroGreeting}>{greeting()},</ThemedText>
                  <ThemedText style={styles.heroName}>{displayName}</ThemedText>
                </View>
                <View style={styles.activeBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#4ade80" />
                  <ThemedText style={styles.activeBadgeText}>Active</ThemedText>
                </View>
              </View>

              {/* Quick actions */}
              <View style={styles.quickActions}>
                {[
                  { icon: 'add-circle-outline', label: 'New Offering', route: '/(pt-tabs)/offerings' },
                  { icon: 'calendar-outline', label: 'Bookings', route: '/(pt-tabs)/bookings' },
                  { icon: 'people-outline', label: 'Clients', route: '/(pt-tabs)/clients' },
                  { icon: 'person-outline', label: 'Profile', route: '/(pt-tabs)/profile' },
                  { icon: 'share-outline', label: 'Share Link', route: null },
                ].map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={styles.quickAction}
                    onPress={() => a.route && router.push(a.route as any)}
                  >
                    <View style={styles.quickActionIcon}>
                      <Ionicons name={a.icon as any} size={20} color="#fff" />
                    </View>
                    <ThemedText style={styles.quickActionLabel}>{a.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Role switcher */}
              {hasVenueRole && (
                <TouchableOpacity
                  style={styles.roleSwitcher}
                  onPress={() => router.replace('/(tabs)' as any)}
                >
                  <Ionicons name="swap-horizontal-outline" size={14} color="rgba(255,255,255,0.8)" />
                  <ThemedText style={styles.roleSwitcherText}>Switch to Venue Dashboard</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardDark]}>
            <Ionicons name="calendar-outline" size={18} color="rgba(255,255,255,0.7)" />
            <ThemedText style={[styles.statValue, styles.statValueDark]}>{stats.thisMonth}</ThemedText>
            <ThemedText style={[styles.statLabel, styles.statLabelDark]}>This month</ThemedText>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash-outline" size={18} color="#9ca3af" />
            <ThemedText style={styles.statValue}>
              {stats.earnings > 0 ? `KES ${stats.earnings.toLocaleString()}` : '—'}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Earnings</ThemedText>
          </View>
          <View style={[styles.statCard, stats.pending > 0 && styles.statCardAccent]}>
            <Ionicons name="time-outline" size={18} color={stats.pending > 0 ? '#d97706' : '#9ca3af'} />
            <ThemedText style={[styles.statValue, stats.pending > 0 && styles.statValueAccent]}>
              {stats.pending}
            </ThemedText>
            <ThemedText style={[styles.statLabel, stats.pending > 0 && styles.statLabelAccent]}>Pending</ThemedText>
          </View>
        </View>

        {/* Upcoming sessions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Upcoming Sessions</ThemedText>
            <TouchableOpacity onPress={() => router.push('/(pt-tabs)/bookings')}>
              <ThemedText style={styles.sectionLink}>See all</ThemedText>
            </TouchableOpacity>
          </View>

          {upcoming.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
              <ThemedText style={styles.emptyText}>No upcoming sessions</ThemedText>
              <ThemedText style={styles.emptySubText}>Create an offering to start accepting bookings</ThemedText>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(pt-tabs)/offerings')}>
                <ThemedText style={styles.emptyBtnText}>Create Offering</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            upcoming.map(b => (
              <View key={b.id} style={styles.bookingCard}>
                <View style={[styles.dateChip, b.status === 'pending' && styles.dateChipPending]}>
                  <ThemedText style={styles.dateChipText}>{fmtDate(b.scheduled_date)}</ThemedText>
                  <ThemedText style={styles.timeChipText}>{fmtTime(b.scheduled_time)}</ThemedText>
                </View>
                <View style={styles.bookingInfo}>
                  <ThemedText style={styles.bookingTitle}>
                    {(b.pt_offerings as any)?.title ?? 'Session'}
                  </ThemedText>
                  <ThemedText style={styles.bookingClient}>
                    {(b.users as any)?.name ?? (b.users as any)?.email ?? 'Client'}
                  </ThemedText>
                </View>
                <View style={[styles.statusDot, b.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending]} />
              </View>
            ))
          )}
        </View>

        {/* Recent Experience Bookings (only if PT also manages a venue) */}
        {recentExpBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Recent Experience Bookings</ThemedText>
            </View>
            {recentExpBookings.map(b => {
              const exp = Array.isArray(b.experiences) ? (b.experiences as any)[0] : b.experiences;
              const memberName = b.guest_name || b.email?.split('@')[0] || 'Guest';
              const expName = exp?.name || 'Experience';
              const expDate = exp?.date || b.created_at.slice(0, 10);
              const isPaid = b.status === 'deposit_paid' || b.status === 'confirmed';
              const statusColor = b.status === 'checked_in' ? '#16a34a' : isPaid ? '#16a34a' : '#d97706';
              const statusLabel = b.status === 'checked_in' ? 'Present' : isPaid ? 'Paid' : 'Pending';
              const initials = memberName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
              return (
                <View key={b.id} style={styles.expBookingRow}>
                  <View style={styles.expAvatar}>
                    <ThemedText style={styles.expAvatarText}>{initials}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.expMember}>{memberName}</ThemedText>
                    <ThemedText style={styles.expSession}>{expName} · {fmtDate(expDate)}</ThemedText>
                  </View>
                  <View style={[styles.expStatusBadge, { backgroundColor: statusColor + '18' }]}>
                    <ThemedText style={[styles.expStatusText, { color: statusColor }]}>{statusLabel}</ThemedText>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f7' },

  // Hero
  hero: { backgroundColor: PRIMARY },
  heroInner: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  heroGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  activeBadgeText: { fontSize: 12, fontWeight: '600', color: '#4ade80' },

  // Quick actions
  quickActions: { flexDirection: 'row', justifyContent: 'space-between' },
  quickAction: { alignItems: 'center', flex: 1 },
  quickActionIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  quickActionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

  // Role switcher
  roleSwitcher: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  roleSwitcherText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },

  // Stats
  statsGrid: { flexDirection: 'row', padding: 16, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statCardDark: { backgroundColor: PRIMARY },
  statCardAccent: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827', paddingTop: 6 },
  statValueDark: { color: '#fff' },
  statValueAccent: { color: '#d97706' },
  statLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  statLabelDark: { color: 'rgba(255,255,255,0.65)' },
  statLabelAccent: { color: '#d97706' },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionLink: { fontSize: 13, color: PRIMARY, fontWeight: '600' },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySubText: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  emptyBtn: {
    marginTop: 10, backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Booking cards
  bookingCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dateChip: {
    backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, alignItems: 'center', minWidth: 72,
  },
  dateChipPending: { backgroundColor: '#fffbeb' },
  dateChipText: { fontSize: 11, fontWeight: '700', color: PRIMARY },
  timeChipText: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 2 },
  bookingInfo: { flex: 1 },
  bookingTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  bookingClient: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusConfirmed: { backgroundColor: '#22c55e' },
  statusPending: { backgroundColor: '#f59e0b' },

  // Experience booking rows
  expBookingRow: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  expAvatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PRIMARY + '18',
  },
  expAvatarText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  expMember: { fontSize: 13, fontWeight: '700', color: '#111827' },
  expSession: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  expStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  expStatusText: { fontSize: 11, fontWeight: '700' },
});

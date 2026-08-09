import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000000';
const today = () => new Date().toISOString().split('T')[0];

interface Session {
  id: string;
  name: string;
  date: string;
  time: string;
  max_capacity: number;
  bookings_count: number;
  gym_name: string;
}

interface Booking {
  id: string;
  member_name: string;
  session_name: string;
  booking_date: string;
  checked_in: boolean;
  no_show: boolean;
  booking_status?: string;
}

interface Stats {
  totalVenues: number;
  upcomingSessions: number;
  todayBookings: number;
  thisWeekBookings: number;
  availableBalance: number;
}

const fmtKes = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDate = (d: string) => {
  const date = new Date(d);
  const todayDate = new Date();
  const tomorrow = new Date(todayDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === todayDate.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' });
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partnerName, setPartnerName] = useState('Partner');
  const [venueName, setVenueName] = useState('');
  const [venueIsLive, setVenueIsLive] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalVenues: 0, upcomingSessions: 0, todayBookings: 0,
    thisWeekBookings: 0, availableBalance: 0,
  });
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [hasPTRole, setHasPTRole] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(auth)/partner-login'); return; }

      const { data: partner } = await supabase
        .from('partners').select('id, business_name, email')
        .eq('user_id', user.id).single();
      if (!partner) { router.replace('/(auth)/partner-login'); return; }

      setPartnerName(partner.business_name || partner.email?.split('@')[0] || 'Partner');

      const { data: ptProfile } = await supabase
        .from('personal_trainers').select('id').eq('user_id', user.id).maybeSingle();
      setHasPTRole(!!ptProfile);

      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id, gyms(id, name, rate_floor, is_active)')
        .eq('partner_id', partner.id);

      const gymIds = (partnerGyms || []).map((pg: any) => pg.gym_id);
      const firstGym = (partnerGyms?.[0]?.gyms as any);
      setVenueName(firstGym?.name || '');
      setVenueIsLive(firstGym?.is_active ?? true);

      const t = today();
      const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      // Today's sessions with booking counts
      const { data: todaySessionsData } = await supabase
        .from('sessions')
        .select('id, name, date, time, max_capacity, gyms(name)')
        .in('gym_id', gymIds).eq('date', t).eq('is_active', true)
        .order('time', { ascending: true });

      const todayWithCounts = await Promise.all(
        (todaySessionsData || []).map(async (s: any) => {
          const { count } = await supabase
            .from('bookings').select('*', { count: 'exact', head: true })
            .eq('session_id', s.id).eq('status', 'confirmed');
          return { id: s.id, name: s.name, date: s.date, time: s.time,
            max_capacity: s.max_capacity, bookings_count: count || 0, gym_name: s.gyms?.name || '' };
        })
      );
      setTodaySessions(todayWithCounts);

      // Upcoming sessions (next 7 days, excluding today)
      const { data: upcomingData } = await supabase
        .from('sessions')
        .select('id, name, date, time, max_capacity, gyms(name)')
        .in('gym_id', gymIds).gt('date', t).lte('date', weekFromNow)
        .eq('is_active', true).order('date').order('time').limit(5);

      const upcomingWithCounts = await Promise.all(
        (upcomingData || []).map(async (s: any) => {
          const { count } = await supabase
            .from('bookings').select('*', { count: 'exact', head: true })
            .eq('session_id', s.id).eq('status', 'confirmed');
          return { id: s.id, name: s.name, date: s.date, time: s.time,
            max_capacity: s.max_capacity, bookings_count: count || 0, gym_name: s.gyms?.name || '' };
        })
      );
      setUpcomingSessions(upcomingWithCounts);

      // Stats + balance queries in parallel
      const [
        { count: todayCount },
        { count: weekCount },
        { count: upcomingCount },
        { data: checkedInSessions },
        { data: earnedExp },
        { data: withdrawalData },
      ] = await Promise.all([
        supabase.from('bookings').select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
          .in('sessions.gym_id', gymIds).eq('booking_date', t),
        supabase.from('bookings').select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
          .in('sessions.gym_id', gymIds).gte('booking_date', t).lte('booking_date', weekFromNow),
        supabase.from('sessions').select('*', { count: 'exact', head: true })
          .in('gym_id', gymIds).gte('date', t).lte('date', weekFromNow).eq('is_active', true),
        supabase.from('bookings')
          .select('sessions(drop_in_price, gyms(rate_floor_percentage))')
          .in('gym_id', gymIds).eq('checked_in', true),
        supabase.from('experience_bookings')
          .select('deposit_amount, gyms!gym_id(rate_floor_percentage)')
          .in('gym_id', gymIds).in('status', ['deposit_paid', 'confirmed', 'checked_in']),
        supabase.from('partner_withdrawals')
          .select('amount').in('gym_id', gymIds).in('status', ['completed', 'processing']),
      ]);

      const sessionEarned = (checkedInSessions || []).reduce((sum: number, b: any) => {
        const price = b.sessions?.drop_in_price || 0;
        const commission = (b.sessions?.gyms as any)?.rate_floor_percentage ?? 15;
        return sum + Math.round(price * (1 - commission / 100));
      }, 0);
      const expEarned = (earnedExp || []).reduce((sum: number, b: any) => {
        const gymData = Array.isArray(b.gyms) ? b.gyms[0] : b.gyms;
        const commission = gymData?.rate_floor_percentage ?? 15;
        return sum + Math.round(Number(b.deposit_amount || 0) * (1 - commission / 100));
      }, 0);
      const totalWithdrawn = (withdrawalData || []).reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0);

      setStats({
        totalVenues: gymIds.length,
        upcomingSessions: upcomingCount || 0,
        todayBookings: todayCount || 0,
        thisWeekBookings: weekCount || 0,
        availableBalance: Math.max(0, sessionEarned + expEarned - totalWithdrawn),
      });

      // Recent bookings (sessions + experiences merged)
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, booking_date, status, checked_in, no_show, sessions(name, gym_id), users(name)')
        .in('gym_id', gymIds)
        .order('booking_date', { ascending: false })
        .limit(8);

      const sessionBookings: Booking[] = (bookingsData || []).map((b: any) => ({
        id: b.id,
        member_name: b.users?.name || 'Member',
        session_name: b.sessions?.name || 'Session',
        booking_date: b.booking_date,
        checked_in: b.checked_in || false,
        no_show: b.no_show || false,
      }));

      let expBookings: Booking[] = [];
      if (gymIds.length > 0) {
        const { data: expData } = await supabase
          .from('experience_bookings')
          .select('id, status, created_at, guest_name, email, experiences!experience_id(name, date)')
          .in('gym_id', gymIds)
          .in('status', ['deposit_paid', 'confirmed', 'checked_in'])
          .order('created_at', { ascending: false })
          .limit(8);
        expBookings = (expData || []).map((b: any) => {
          const exp = Array.isArray(b.experiences) ? b.experiences[0] : b.experiences;
          return {
            id: b.id,
            member_name: b.guest_name || b.email?.split('@')[0] || 'Guest',
            session_name: exp?.name || 'Experience',
            booking_date: exp?.date || b.created_at.slice(0, 10),
            checked_in: b.status === 'checked_in',
            no_show: false,
            booking_status: b.status,
          };
        });
      }

      setRecentBookings(
        [...sessionBookings, ...expBookings]
          .sort((a, b_) => b_.booking_date.localeCompare(a.booking_date))
          .slice(0, 8)
      );
    } catch (e: any) {
      Alert.alert('Error', 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); load(true); };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  const fillPct = (booked: number, max: number) => max > 0 ? booked / max : 0;
  const fillColor = (pct: number) => pct >= 0.8 ? '#dc2626' : pct >= 0.5 ? '#d97706' : '#16a34a';

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {/* ── Hero Card ── */}
        <View style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <View style={styles.heroInner}>
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.heroGreeting}>{greeting()},</ThemedText>
                  <ThemedText style={styles.heroName}>{partnerName}</ThemedText>
                  {venueName ? (
                    <View style={styles.venueRow}>
                      <View style={[styles.statusDot, { backgroundColor: venueIsLive ? '#4ade80' : '#fbbf24' }]} />
                      <ThemedText style={styles.venueName}>{venueName}</ThemedText>
                      <ThemedText style={styles.venueStatus}>{venueIsLive ? '· Live' : '· Pending'}</ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.heroBalanceCard}>
                  <ThemedText style={styles.heroBalanceLabel}>Available</ThemedText>
                  <ThemedText style={styles.heroBalance}>{fmtKes(stats.availableBalance)}</ThemedText>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/revenue')}>
                    <ThemedText style={styles.heroWithdraw}>Withdraw →</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick actions */}
              <View style={styles.quickActions}>
                {[
                  { icon: 'qr-code-outline', label: 'Check in', route: '/(tabs)/checkin' },
                  { icon: 'add-circle-outline', label: 'Add session', route: '/partner/create-session-select-venue' },
                  { icon: 'cash-outline', label: 'Withdraw', route: '/(tabs)/revenue' },
                  { icon: 'bar-chart-outline', label: 'Revenue', route: '/(tabs)/revenue' },
                ].map((a) => (
                  <TouchableOpacity key={a.label} style={styles.quickAction} onPress={() => router.push(a.route as any)}>
                    <View style={styles.quickActionIcon}>
                      <Ionicons name={a.icon as any} size={20} color="#fff" />
                    </View>
                    <ThemedText style={styles.quickActionLabel}>{a.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Role switcher */}
              {hasPTRole && (
                <TouchableOpacity
                  style={styles.roleSwitcher}
                  onPress={() => router.replace('/(pt-tabs)' as any)}
                >
                  <Ionicons name="swap-horizontal-outline" size={14} color="rgba(255,255,255,0.8)" />
                  <ThemedText style={styles.roleSwitcherText}>Switch to PT Dashboard</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </View>

        {/* ── Stats Grid ── */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Venues', value: stats.totalVenues, icon: 'business-outline', dark: true },
            { label: 'This week', value: stats.upcomingSessions, icon: 'calendar-outline', dark: false },
            { label: 'Today', value: stats.todayBookings, icon: 'people-outline', dark: false },
            { label: 'Week bookings', value: stats.thisWeekBookings, icon: 'stats-chart-outline', dark: false },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, s.dark && styles.statCardDark]}>
              <Ionicons name={s.icon as any} size={18} color={s.dark ? 'rgba(255,255,255,0.7)' : '#9ca3af'} />
              <ThemedText style={[styles.statValue, s.dark && styles.statValueDark]}>{s.value}</ThemedText>
              <ThemedText style={[styles.statLabel, s.dark && styles.statLabelDark]}>{s.label}</ThemedText>
            </View>
          ))}
        </View>

        {/* ── Today's Sessions ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Today's Sessions</ThemedText>
            <TouchableOpacity onPress={() => router.push('/(tabs)/sessions')}>
              <ThemedText style={styles.sectionLink}>See all</ThemedText>
            </TouchableOpacity>
          </View>

          {todaySessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
              <ThemedText style={styles.emptyText}>No sessions scheduled today</ThemedText>
              <TouchableOpacity onPress={() => router.push('/partner/create-session-select-venue')}>
                <ThemedText style={styles.emptyLink}>Add a session</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            todaySessions.map((s) => {
              const pct = fillPct(s.bookings_count, s.max_capacity);
              const color = fillColor(pct);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.sessionCard}
                  onPress={() => router.push(`/partner/session-details/${s.id}` as any)}
                >
                  <View style={[styles.sessionStrip, { backgroundColor: color }]} />
                  <View style={styles.sessionBody}>
                    <ThemedText style={styles.sessionName}>{s.name}</ThemedText>
                    <ThemedText style={styles.sessionMeta}>{fmtTime(s.time)} · {s.gym_name}</ThemedText>
                    <View style={styles.capacityRow}>
                      <View style={styles.capacityBar}>
                        <View style={[styles.capacityFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
                      </View>
                      <ThemedText style={[styles.capacityText, { color }]}>
                        {s.bookings_count}/{s.max_capacity}
                      </ThemedText>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.checkInBtn}
                    onPress={() => router.push('/(tabs)/checkin')}
                  >
                    <ThemedText style={styles.checkInBtnText}>Check in</ThemedText>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Upcoming ── */}
        {upcomingSessions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Coming up</ThemedText>
              <TouchableOpacity onPress={() => router.push('/(tabs)/sessions')}>
                <ThemedText style={styles.sectionLink}>See all</ThemedText>
              </TouchableOpacity>
            </View>
            {upcomingSessions.map((s) => {
              const pct = fillPct(s.bookings_count, s.max_capacity);
              const color = fillColor(pct);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.upcomingCard}
                  onPress={() => router.push(`/partner/session-details/${s.id}` as any)}
                >
                  <View style={styles.upcomingLeft}>
                    <ThemedText style={styles.upcomingDate}>{fmtDate(s.date)}</ThemedText>
                    <ThemedText style={styles.upcomingName}>{s.name}</ThemedText>
                    <ThemedText style={styles.upcomingMeta}>{fmtTime(s.time)} · {s.gym_name}</ThemedText>
                  </View>
                  <View style={styles.upcomingRight}>
                    <ThemedText style={[styles.upcomingCount, { color }]}>
                      {s.bookings_count}/{s.max_capacity}
                    </ThemedText>
                    <ThemedText style={styles.upcomingCountLabel}>booked</ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Recent Bookings ── */}
        {recentBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Recent bookings</ThemedText>
              <TouchableOpacity onPress={() => router.push('/partner/bookings' as any)}>
                <ThemedText style={styles.sectionLink}>See all</ThemedText>
              </TouchableOpacity>
            </View>
            {recentBookings.map((b) => {
              const initials = b.member_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const isPaid = b.booking_status === 'deposit_paid' || b.booking_status === 'confirmed';
              const statusColor = b.no_show ? '#dc2626' : (b.checked_in || isPaid) ? '#16a34a' : '#d97706';
              const statusLabel = b.no_show ? 'No show' : b.checked_in ? 'Present' : isPaid ? 'Paid' : 'Pending';
              return (
                <View key={b.id} style={styles.bookingRow}>
                  <View style={[styles.avatar, { backgroundColor: PRIMARY + '18' }]}>
                    <ThemedText style={styles.avatarText}>{initials}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.bookingMember}>{b.member_name}</ThemedText>
                    <ThemedText style={styles.bookingSession}>{b.session_name}</ThemedText>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                    <ThemedText style={[styles.statusText, { color: statusColor }]}>{statusLabel}</ThemedText>
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
  venueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  venueName: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  venueStatus: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  heroBalanceCard: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, alignItems: 'flex-end',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  heroBalanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  heroBalance: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  heroWithdraw: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4, fontWeight: '600' },

  // Quick actions
  quickActions: { flexDirection: 'row', justifyContent: 'space-between' },
  quickAction: { alignItems: 'center', flex: 1 },
  quickActionIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  quickActionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff',
    borderRadius: 16, padding: 16, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statCardDark: { backgroundColor: PRIMARY },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827', paddingTop: 7 },
  statValueDark: { color: '#fff' },
  statLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  statLabelDark: { color: 'rgba(255,255,255,0.65)' },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionLink: { fontSize: 13, color: PRIMARY, fontWeight: '600' },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  emptyLink: { fontSize: 14, color: PRIMARY, fontWeight: '700', marginTop: 4 },

  // Today's sessions
  sessionCard: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  sessionStrip: { width: 4, alignSelf: 'stretch' },
  sessionBody: { flex: 1, padding: 14 },
  sessionName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  sessionMeta: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacityBar: { flex: 1, height: 4, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' },
  capacityFill: { height: '100%', borderRadius: 2 },
  capacityText: { fontSize: 11, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  checkInBtn: {
    backgroundColor: PRIMARY, paddingHorizontal: 12, paddingVertical: 8,
    margin: 14, borderRadius: 10,
  },
  checkInBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Upcoming
  upcomingCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  upcomingLeft: { flex: 1 },
  upcomingDate: { fontSize: 11, fontWeight: '600', color: PRIMARY, marginBottom: 2 },
  upcomingName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  upcomingMeta: { fontSize: 12, color: '#6b7280' },
  upcomingRight: { alignItems: 'flex-end' },
  upcomingCount: { fontSize: 16, fontWeight: '800' },
  upcomingCountLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '500' },

  // Bookings
  bookingRow: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  bookingMember: { fontSize: 13, fontWeight: '700', color: '#111827' },
  bookingSession: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  roleSwitcher: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  roleSwitcherText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
});

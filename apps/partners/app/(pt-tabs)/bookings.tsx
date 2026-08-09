import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Text
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

type Booking = {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  payment_method: string | null;
  amount_kes: number | null;
  notes: string | null;
  location_type: string | null;
  users: { name: string | null; email: string | null } | null;
  pt_offerings: { title: string; duration_minutes: number; type: string; is_programme?: boolean } | null;
};

type ProgrammeEnrollment = {
  id: string;
  intro_booking_id: string;
  status: string;
  trainer_intro_confirmed: boolean;
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  pending:   { bg: '#fffbeb', text: '#d97706', label: 'Pending',   dot: '#f59e0b' },
  confirmed: { bg: '#f0fdf4', text: '#16a34a', label: 'Confirmed', dot: '#22c55e' },
  completed: { bg: '#eff6ff', text: '#1d4ed8', label: 'Completed', dot: '#60a5fa' },
  cancelled: { bg: '#fef2f2', text: '#dc2626', label: 'Cancelled', dot: '#d1d5db' },
  no_show:   { bg: '#f9fafb', text: '#6b7280', label: 'No Show',   dot: '#d1d5db' },
};

const DAYS  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function todayStr() { return new Date().toISOString().split('T')[0]; }

export default function PTBookingsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [programmeEnrollments, setProgrammeEnrollments] = useState<ProgrammeEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const today = todayStr();
  const [viewYear,  setViewYear]  = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) { setLoading(false); return; }

    const queryWith = (cols: string) =>
      supabase.from('pt_bookings').select(cols).eq('pt_id', pt.id)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

    const fullCols  = 'id, scheduled_date, scheduled_time, status, payment_method, amount_kes, notes, location_type, users(name, email), pt_offerings(title, duration_minutes, type, is_programme)';
    const basicCols = 'id, scheduled_date, scheduled_time, status, payment_method, amount_kes, notes, location_type, users(name, email), pt_offerings(title, duration_minutes, type)';

    const res = await queryWith(fullCols);
    const bookingsData = res.error ? (await queryWith(basicCols)).data : res.data;

    const { data: enrollmentsData } = await supabase
      .from('pt_programme_enrollments')
      .select('id, intro_booking_id, status, trainer_intro_confirmed')
      .eq('pt_id', pt.id);

    const allBookings = (bookingsData as any) ?? [];
    setBookings(allBookings);
    setProgrammeEnrollments((enrollmentsData as any) ?? []);

    // Auto-jump to the nearest booking date
    const upcoming = allBookings
      .filter((b: any) => b.scheduled_date >= todayStr())
      .sort((a: any, z: any) => a.scheduled_date.localeCompare(z.scheduled_date));
    if (upcoming.length > 0) {
      const firstDate = upcoming[0].scheduled_date;
      setSelectedDate(firstDate);
      const d = new Date(firstDate + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Calendar helpers ─────────────────────────────────────────────────────────

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const offset      = (firstDow + 6) % 7; // Mon=0 … Sun=6

  const byDate: Record<string, Booking[]> = {};
  for (const b of bookings) {
    (byDate[b.scheduled_date] ??= []).push(b);
  }

  function ds(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const dayBookings = byDate[selectedDate] ?? [];

  const upcomingBookings = bookings
    .filter(b => b.scheduled_date >= today && b.status !== 'cancelled' && b.status !== 'no_show')
    .sort((a, z) => a.scheduled_date.localeCompare(z.scheduled_date) || a.scheduled_time.localeCompare(z.scheduled_time));

  // ── Actions ──────────────────────────────────────────────────────────────────

  const updateStatus = async (bookingId: string, status: string) => {
    setActionLoading(bookingId);
    const { error } = await supabase.from('pt_bookings').update({ status }).eq('id', bookingId);
    if (!error) setBookings(p => p.map(b => b.id === bookingId ? { ...b, status: status as any } : b));
    setActionLoading(null);
  };

  const confirmBooking = (b: Booking) => {
    Alert.alert('Confirm Session', `Confirm session with ${b.users?.name ?? 'client'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(b.id, 'confirmed') },
    ]);
  };

  const markComplete = (b: Booking) => {
    Alert.alert('Mark Complete', 'Mark this session as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => updateStatus(b.id, 'completed') },
    ]);
  };

  const markNoShow = (b: Booking) => {
    Alert.alert('No Show', 'Mark client as no-show?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'No Show', style: 'destructive', onPress: () => updateStatus(b.id, 'no_show') },
    ]);
  };

  const markIntroComplete = async (enrollmentId: string, bookingId: string) => {
    setActionLoading(bookingId);
    await fetch('https://activecitypass.com/api/pt-programme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: enrollmentId, trainer_intro_confirmed: true, status: 'intro_complete' }),
    }).catch(() => null);
    setProgrammeEnrollments(p => p.map(e =>
      e.id === enrollmentId ? { ...e, trainer_intro_confirmed: true, status: 'intro_complete' } : e
    ));
    setActionLoading(null);
  };

  const fmtTime = (t: string) => {
    const [h, m] = t.split(':');
    const d = new Date(); d.setHours(+h, +m);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const fmtSelectedDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── Calendar ── */}
          <View style={styles.calCard}>
            {/* Month nav */}
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-back" size={18} color="#374151" />
              </TouchableOpacity>
              <ThemedText style={styles.calTitle}>{MONTHS[viewMonth]} {viewYear}</ThemedText>
              <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-forward" size={18} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Day headers */}
            <View style={styles.calDayHeaders}>
              {DAYS.map(d => (
                <View key={d} style={styles.calDayHeaderCell}>
                  <Text style={styles.calDayHeaderText}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Day grid */}
            <View style={styles.calGrid}>
              {/* Empty offset cells */}
              {Array.from({ length: offset }).map((_, i) => (
                <View key={`e${i}`} style={styles.calCell} />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const date     = ds(day);
                const dayBks   = byDate[date] ?? [];
                const isToday  = date === today;
                const isSel    = date === selectedDate;
                const hasBks   = dayBks.length > 0;
                const dotStatus = dayBks.find(b => b.status === 'confirmed')?.status
                  ?? dayBks.find(b => b.status === 'pending')?.status
                  ?? dayBks[0]?.status;

                return (
                  <TouchableOpacity
                    key={date}
                    style={[
                      styles.calCell,
                      isSel && styles.calCellSelected,
                      !isSel && isToday && styles.calCellToday,
                    ]}
                    onPress={() => setSelectedDate(date)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.calDayNum,
                      isSel && styles.calDayNumSelected,
                      !isSel && isToday && styles.calDayNumToday,
                    ]}>
                      {day}
                    </Text>
                    {hasBks && (
                      <View style={[
                        styles.dot,
                        { backgroundColor: isSel ? 'rgba(255,255,255,0.8)' : (STATUS_STYLE[dotStatus!]?.dot ?? '#9ca3af') },
                      ]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              {[
                { label: 'Confirmed', dot: '#22c55e' },
                { label: 'Pending',   dot: '#f59e0b' },
                { label: 'Completed', dot: '#60a5fa' },
              ].map(({ label, dot }) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: dot }]} />
                  <Text style={styles.legendText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Day panel ── */}
          <View style={styles.dayPanel}>
            <View style={styles.dayPanelHeader}>
              <ThemedText style={styles.dayPanelTitle}>{fmtSelectedDate(selectedDate)}</ThemedText>
              {selectedDate === today && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>Today</Text>
                </View>
              )}
            </View>

            {dayBookings.length === 0 ? (
              <View style={styles.emptyDay}>
                <Ionicons name="calendar-outline" size={36} color="#d1d5db" />
                <ThemedText style={styles.emptyDayText}>No sessions on this day</ThemedText>
              </View>
            ) : (
              <View style={styles.cardList}>
                {dayBookings.map(b => {
                  const statusCfg = STATUS_STYLE[b.status];
                  const offer = b.pt_offerings as any;
                  const user  = b.users as any;
                  const isLoading = actionLoading === b.id;
                  const progEnrollment = offer?.is_programme
                    ? programmeEnrollments.find(e => e.intro_booking_id === b.id) ?? null
                    : null;

                  return (
                    <View key={b.id} style={styles.card}>
                      {/* Top row */}
                      <View style={styles.cardTop}>
                        <View style={styles.avatarCircle}>
                          <ThemedText style={styles.avatarText}>
                            {(user?.name ?? user?.email ?? 'C')[0].toUpperCase()}
                          </ThemedText>
                        </View>
                        <View style={styles.cardInfo}>
                          <ThemedText style={styles.clientName}>
                            {user?.name ?? user?.email ?? 'Unknown client'}
                          </ThemedText>
                          <ThemedText style={styles.offeringName}>{offer?.title ?? 'Session'}</ThemedText>
                          <View style={styles.metaRow}>
                            <Ionicons name="time-outline" size={12} color="#9ca3af" />
                            <ThemedText style={styles.metaText}>{fmtTime(b.scheduled_time)}</ThemedText>
                            {offer?.duration_minutes && (
                              <ThemedText style={styles.metaText}>· {offer.duration_minutes}min</ThemedText>
                            )}
                          </View>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                          <ThemedText style={[styles.statusText, { color: statusCfg.text }]}>
                            {statusCfg.label}
                          </ThemedText>
                        </View>
                      </View>

                      {/* Payment info */}
                      {(b.payment_method === 'free' || b.amount_kes) && (
                        <View style={styles.paymentRow}>
                          <Ionicons name="cash-outline" size={13} color="#6b7280" />
                          <ThemedText style={styles.paymentText}>
                            {b.payment_method === 'free'
                              ? 'Free intro'
                              : `KES ${b.amount_kes?.toLocaleString()}`}
                          </ThemedText>
                          {b.location_type && (
                            <ThemedText style={styles.paymentText}>· {b.location_type}</ThemedText>
                          )}
                        </View>
                      )}

                      {/* Actions */}
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#000" style={{ marginTop: 12 }} />
                      ) : (
                        <View style={styles.actions}>
                          {b.status === 'pending' && (
                            <>
                              <TouchableOpacity style={styles.actionConfirm} onPress={() => confirmBooking(b)}>
                                <ThemedText style={styles.actionConfirmText}>Confirm</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.actionSecondary} onPress={() => updateStatus(b.id, 'cancelled')}>
                                <ThemedText style={styles.actionSecondaryText}>Decline</ThemedText>
                              </TouchableOpacity>
                            </>
                          )}
                          {b.status === 'confirmed' && (
                            <>
                              <TouchableOpacity style={styles.actionConfirm} onPress={() => markComplete(b)}>
                                <ThemedText style={styles.actionConfirmText}>Mark Complete</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.actionSecondary} onPress={() => markNoShow(b)}>
                                <ThemedText style={styles.actionSecondaryText}>No Show</ThemedText>
                              </TouchableOpacity>
                              {progEnrollment && !progEnrollment.trainer_intro_confirmed && (
                                <TouchableOpacity
                                  style={styles.actionIntro}
                                  onPress={() => markIntroComplete(progEnrollment.id, b.id)}
                                >
                                  <ThemedText style={styles.actionIntroText}>Mark intro complete</ThemedText>
                                </TouchableOpacity>
                              )}
                              {progEnrollment?.trainer_intro_confirmed && (
                                <View style={styles.introDoneBadge}>
                                  <Ionicons name="checkmark-circle" size={13} color="#4f46e5" />
                                  <ThemedText style={styles.introDoneText}>Intro confirmed</ThemedText>
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── All upcoming ── */}
          {upcomingBookings.length > 0 && (
            <View style={styles.dayPanel}>
              <View style={[styles.dayPanelHeader, { marginTop: 24 }]}>
                <ThemedText style={styles.dayPanelTitle}>All upcoming sessions</ThemedText>
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>{upcomingBookings.length}</Text>
                </View>
              </View>
              <View style={styles.cardList}>
                {upcomingBookings.map(b => {
                  const statusCfg = STATUS_STYLE[b.status];
                  const offer = b.pt_offerings as any;
                  const user  = b.users as any;
                  const isLoading = actionLoading === b.id;
                  const progEnrollment = offer?.is_programme
                    ? programmeEnrollments.find(e => e.intro_booking_id === b.id) ?? null
                    : null;

                  return (
                    <View key={b.id} style={styles.card}>
                      <View style={styles.cardTop}>
                        <View style={styles.avatarCircle}>
                          <ThemedText style={styles.avatarText}>
                            {(user?.name ?? user?.email ?? 'C')[0].toUpperCase()}
                          </ThemedText>
                        </View>
                        <View style={styles.cardInfo}>
                          <ThemedText style={styles.clientName}>
                            {user?.name ?? user?.email ?? 'Unknown client'}
                          </ThemedText>
                          <ThemedText style={styles.offeringName}>{offer?.title ?? 'Session'}</ThemedText>
                          <View style={styles.metaRow}>
                            <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                            <ThemedText style={styles.metaText}>
                              {new Date(b.scheduled_date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </ThemedText>
                            <ThemedText style={styles.metaText}>· {fmtTime(b.scheduled_time)}</ThemedText>
                            {offer?.duration_minutes && (
                              <ThemedText style={styles.metaText}>· {offer.duration_minutes}min</ThemedText>
                            )}
                          </View>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                          <ThemedText style={[styles.statusText, { color: statusCfg.text }]}>
                            {statusCfg.label}
                          </ThemedText>
                        </View>
                      </View>

                      {(b.payment_method === 'free' || b.amount_kes) && (
                        <View style={styles.paymentRow}>
                          <Ionicons name="cash-outline" size={13} color="#6b7280" />
                          <ThemedText style={styles.paymentText}>
                            {b.payment_method === 'free'
                              ? 'Free intro'
                              : `KES ${b.amount_kes?.toLocaleString()}`}
                          </ThemedText>
                        </View>
                      )}

                      {isLoading ? (
                        <ActivityIndicator size="small" color="#000" style={{ marginTop: 12 }} />
                      ) : (
                        <View style={styles.actions}>
                          {b.status === 'pending' && (
                            <>
                              <TouchableOpacity style={styles.actionConfirm} onPress={() => confirmBooking(b)}>
                                <ThemedText style={styles.actionConfirmText}>Confirm</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.actionSecondary} onPress={() => updateStatus(b.id, 'cancelled')}>
                                <ThemedText style={styles.actionSecondaryText}>Decline</ThemedText>
                              </TouchableOpacity>
                            </>
                          )}
                          {b.status === 'confirmed' && (
                            <>
                              <TouchableOpacity style={styles.actionConfirm} onPress={() => markComplete(b)}>
                                <ThemedText style={styles.actionConfirmText}>Mark Complete</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.actionSecondary} onPress={() => markNoShow(b)}>
                                <ThemedText style={styles.actionSecondaryText}>No Show</ThemedText>
                              </TouchableOpacity>
                              {progEnrollment && !progEnrollment.trainer_intro_confirmed && (
                                <TouchableOpacity
                                  style={styles.actionIntro}
                                  onPress={() => markIntroComplete(progEnrollment.id, b.id)}
                                >
                                  <ThemedText style={styles.actionIntroText}>Mark intro complete</ThemedText>
                                </TouchableOpacity>
                              )}
                              {progEnrollment?.trainer_intro_confirmed && (
                                <View style={styles.introDoneBadge}>
                                  <Ionicons name="checkmark-circle" size={13} color="#4f46e5" />
                                  <ThemedText style={styles.introDoneText}>Intro confirmed</ThemedText>
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {bookings.length === 0 && (
            <View style={styles.emptyDay}>
              <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
              <ThemedText style={styles.emptyDayText}>No bookings yet</ThemedText>
              <ThemedText style={styles.emptyDayHint}>Sessions booked by clients will appear here</ThemedText>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const CELL_SIZE = 42;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll:    { paddingBottom: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#000' },
  refreshBtn:  { padding: 6 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Calendar card
  calCard: {
    backgroundColor: '#fff', margin: 16, borderRadius: 20,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
    padding: 16,
  },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  calNavBtn:  { width: 34, height: 34, borderRadius: 12, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' },
  calTitle:   { fontSize: 15, fontWeight: '700', color: '#111827' },

  calDayHeaders: { flexDirection: 'row', marginBottom: 4 },
  calDayHeaderCell: { flex: 1, alignItems: 'center', paddingBottom: 6 },
  calDayHeaderText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },

  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center',
    justifyContent: 'center', borderRadius: 10, position: 'relative',
  },
  calCellSelected: { backgroundColor: '#000000' },
  calCellToday:    { backgroundColor: 'rgba(5,0,64,0.07)' },
  calDayNum:       { fontSize: 13, fontWeight: '500', color: '#374151' },
  calDayNumSelected: { color: '#fff', fontWeight: '700' },
  calDayNumToday:    { color: '#000000', fontWeight: '700' },
  dot: {
    position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3,
  },

  legend: { flexDirection: 'row', gap: 14, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#6b7280' },

  // Day panel
  dayPanel: { paddingHorizontal: 16 },
  dayPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayPanelTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  todayBadge: {
    backgroundColor: 'rgba(5,0,64,0.08)', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 20,
  },
  todayBadgeText: { fontSize: 12, fontWeight: '700', color: '#000000' },

  emptyDay: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyDayText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
  emptyDayHint: { fontSize: 13, color: '#d1d5db' },

  cardList: { gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f5ff',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: 16, fontWeight: '700', color: '#1d3cb0' },
  cardInfo:     { flex: 1 },
  clientName:   { fontSize: 15, fontWeight: '700', color: '#000' },
  offeringName: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText:     { fontSize: 12, color: '#9ca3af' },
  statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText:   { fontSize: 11, fontWeight: '700' },

  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  paymentText: { fontSize: 12, color: '#6b7280' },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionConfirm: {
    flex: 1, backgroundColor: '#000', paddingVertical: 10,
    borderRadius: 20, alignItems: 'center',
  },
  actionConfirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionSecondary: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', paddingVertical: 10,
    borderRadius: 20, alignItems: 'center',
  },
  actionSecondaryText: { color: '#555', fontSize: 13, fontWeight: '600' },
  actionIntro: {
    flex: 1, backgroundColor: '#4f46e5', paddingVertical: 10,
    borderRadius: 20, alignItems: 'center',
  },
  actionIntroText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  introDoneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 16, flex: 1, justifyContent: 'center',
  },
  introDoneText: { fontSize: 12, fontWeight: '600', color: '#4f46e5' },
});

import {
  StyleSheet, View, ScrollView, Modal, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000000';

type BookingStatus = 'earned' | 'pending' | 'no_show';
type WithdrawalStatus = 'processing' | 'completed' | 'failed';

interface Booking {
  id: string;
  member_name: string;
  session_name: string;
  booking_date: string;
  amount_kes: number;
  status: BookingStatus;
}

interface Withdrawal {
  id: string;
  amount: number;
  phone: string | null;
  status: WithdrawalStatus;
  receipt_number: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface Stats {
  totalEarned: number;
  thisMonth: number;
  pending: number;
  noShows: number;
  totalWithdrawn: number;
  available: number;
}

const fmtKes = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function RevenueScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({ totalEarned: 0, thisMonth: 0, pending: 0, noShows: 0, totalWithdrawn: 0, available: 0 });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [gymId, setGymId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [destType, setDestType] = useState<'MPESA_NUMBER' | 'MPESA_PAYBILL' | 'BANK'>('MPESA_NUMBER');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [withdrawBusinessNum, setWithdrawBusinessNum] = useState('');
  const [withdrawAccountNum, setWithdrawAccountNum] = useState('');
  const [withdrawBankName, setWithdrawBankName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(auth)/partner-login'); return; }

      const { data: partner } = await supabase
        .from('partners').select('id').eq('user_id', user.id).single();
      if (!partner) return;

      const { data: pgs } = await supabase
        .from('partner_gyms').select('gym_id').eq('partner_id', partner.id);
      const ids = (pgs || []).map((pg: any) => pg.gym_id);
      const currentGymId = ids[0] ?? null;
      setGymId(currentGymId);

      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id, booking_date, checked_in, no_show, status, users(name), sessions(name, drop_in_price, gym_id, gyms(rate_floor_percentage))')
        .order('booking_date', { ascending: false })
        .limit(50);

      const partnerBookings = (bookingData || []).filter(
        (b: any) => ids.includes(b.sessions?.gym_id)
      );

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      let totalEarned = 0;
      let thisMonth = 0;
      let pending = 0;
      let noShows = 0;

      const mapped: Booking[] = partnerBookings.map((b: any) => {
        const price = b.sessions?.drop_in_price || 0;
        const commissionPct = (b.sessions?.gyms as any)?.rate_floor_percentage ?? 15;
        const payout = Math.round(price * (1 - commissionPct / 100));
        const bDate = new Date(b.booking_date);
        const isNoShow = b.no_show || (!b.checked_in && bDate < new Date() && b.status === 'confirmed');
        const isPresent = b.checked_in;

        let bookingStatus: BookingStatus;
        if (isNoShow) {
          bookingStatus = 'no_show';
          noShows += payout;
        } else if (isPresent) {
          bookingStatus = 'earned';
          totalEarned += payout;
          if (bDate >= monthStart) thisMonth += payout;
        } else {
          bookingStatus = 'pending';
          pending += payout;
        }

        return {
          id: b.id,
          member_name: b.users?.name || 'Member',
          session_name: b.sessions?.name || 'Session',
          booking_date: b.booking_date,
          amount_kes: payout,
          status: bookingStatus,
        };
      });

      // Load experience bookings for this partner's gyms
      const { data: expData } = await supabase
        .from('experience_bookings')
        .select('id, status, deposit_amount, created_at, guest_name, email, experiences!experience_id(name, date), gyms!gym_id(rate_floor_percentage)')
        .in('gym_id', ids)
        .in('status', ['deposit_paid', 'confirmed', 'checked_in'])
        .order('created_at', { ascending: false })
        .limit(50);

      const mappedExp: Booking[] = (expData || []).map((b: any) => {
        const exp = Array.isArray(b.experiences) ? b.experiences[0] : b.experiences;
        const gymData = Array.isArray(b.gyms) ? b.gyms[0] : b.gyms;
        const commission = gymData?.rate_floor_percentage ?? 15;
        const payout = Math.round(Number(b.deposit_amount || 0) * (1 - commission / 100));
        const expDate = exp?.date ? new Date(exp.date + 'T00:00:00') : new Date(b.created_at);

        // Deposit is already collected — count as earned regardless of event date
        const bookingStatus: BookingStatus = 'earned';
        totalEarned += payout;
        if (expDate >= monthStart) thisMonth += payout;

        const memberName = b.guest_name || (b.email?.split('@')[0] ?? 'Guest');
        return {
          id: b.id,
          member_name: memberName,
          session_name: exp?.name || 'Experience',
          booking_date: exp?.date || b.created_at.slice(0, 10),
          amount_kes: payout,
          status: bookingStatus,
        };
      });

      const allBookings = [...mapped, ...mappedExp].sort(
        (a, b_) => new Date(b_.booking_date).getTime() - new Date(a.booking_date).getTime()
      );

      // Load withdrawal history
      let totalWithdrawn = 0;
      let withdrawalRows: Withdrawal[] = [];
      if (currentGymId) {
        const { data: wData } = await supabase
          .from('partner_withdrawals')
          .select('id, amount, phone, status, receipt_number, failure_reason, created_at')
          .eq('gym_id', currentGymId)
          .order('created_at', { ascending: false })
          .limit(20);

        withdrawalRows = (wData || []) as Withdrawal[];
        totalWithdrawn = withdrawalRows
          .filter(w => w.status === 'completed' || w.status === 'processing')
          .reduce((s, w) => s + Number(w.amount), 0);
      }

      setBookings(allBookings);
      setWithdrawals(withdrawalRows);
      setStats({ totalEarned, thisMonth, pending, noShows, totalWithdrawn, available: Math.max(0, totalEarned - totalWithdrawn) });
    } catch {
      Alert.alert('Error', 'Failed to load revenue data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openWithdrawModal = () => {
    setWithdrawAmount(String(Math.floor(stats.available)));
    setDestType('MPESA_NUMBER');
    setWithdrawPhone('');
    setWithdrawBusinessNum('');
    setWithdrawAccountNum('');
    setWithdrawBankName('');
    setShowModal(true);
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (amount > stats.available) { Alert.alert('Error', `Amount exceeds available balance of ${fmtKes(stats.available)}`); return; }
    if (!gymId) { Alert.alert('Error', 'Venue not found'); return; }

    let phoneClean: string | undefined;
    if (destType === 'MPESA_NUMBER') {
      phoneClean = withdrawPhone.replace(/\s/g, '').replace(/^0/, '254').replace(/^\+/, '');
      if (!/^2547\d{8}$/.test(phoneClean)) { Alert.alert('Error', 'Enter a valid Safaricom number (07XX XXX XXX)'); return; }
    } else if (destType === 'MPESA_PAYBILL') {
      if (!withdrawBusinessNum.trim()) { Alert.alert('Error', 'Enter the Paybill business number'); return; }
      if (!withdrawAccountNum.trim()) { Alert.alert('Error', 'Enter the account number'); return; }
    } else {
      if (!withdrawBankName.trim()) { Alert.alert('Error', 'Enter the bank name'); return; }
      if (!withdrawAccountNum.trim()) { Alert.alert('Error', 'Enter the account number'); return; }
    }

    try {
      setSubmitting(true);
      const res = await supabase.functions.invoke('process-withdrawal', {
        body: {
          type: 'venue',
          gymId,
          amount,
          destinationType: destType,
          phone: phoneClean ?? null,
          businessNumber: withdrawBusinessNum || null,
          accountNumber: withdrawAccountNum || null,
          bankName: withdrawBankName || null,
        },
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.error) {
        // supabase-js puts body in error.context for non-2xx; try to extract real message
        let msg = res.error.message;
        try {
          const body = await (res.error as any).context?.json?.();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }

      setShowModal(false);
      const destLabel = destType === 'MPESA_NUMBER'
        ? 'M-Pesa number'
        : destType === 'MPESA_PAYBILL'
        ? 'Paybill account'
        : 'bank account';
      Alert.alert('Withdrawal Requested', `Your request has been received. We'll process the transfer to your ${destLabel} within 24 hours.`);
      load(true);
    } catch (err: any) {
      Alert.alert('Withdrawal Failed', err.message ?? 'Failed to process withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  }

  const statusInfo: Record<BookingStatus, { label: string; color: string }> = {
    earned: { label: 'Earned', color: '#16a34a' },
    pending: { label: 'Pending', color: '#d97706' },
    no_show: { label: 'No show', color: '#dc2626' },
  };

  const withdrawalStatusInfo: Record<WithdrawalStatus, { label: string; color: string; icon: string }> = {
    processing: { label: 'Processing', color: '#d97706', icon: 'time-outline' },
    completed:  { label: 'Paid out',   color: '#16a34a', icon: 'checkmark-circle-outline' },
    failed:     { label: 'Failed',     color: '#dc2626', icon: 'close-circle-outline' },
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerInner}>
          <ThemedText style={styles.title}>Revenue</ThemedText>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={PRIMARY} />}
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <ThemedText style={styles.balanceLabel}>Available to withdraw</ThemedText>
          <ThemedText style={styles.balanceAmount}>{fmtKes(stats.available)}</ThemedText>
          <ThemedText style={styles.balanceNote}>After Lana commission · {fmtKes(stats.totalWithdrawn)} already withdrawn</ThemedText>
          <TouchableOpacity
            style={[styles.withdrawBtn, stats.available <= 0 && styles.withdrawBtnDisabled]}
            onPress={openWithdrawModal}
            disabled={stats.available <= 0}
            activeOpacity={0.8}
          >
            <Ionicons name="cash-outline" size={16} color={stats.available > 0 ? PRIMARY : '#9ca3af'} />
            <ThemedText style={[styles.withdrawBtnText, stats.available <= 0 && styles.withdrawBtnTextDisabled]}>
              Withdraw Money
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Lifetime revenue', value: fmtKes(stats.totalEarned), sub: 'all time' },
            { label: 'This month',       value: fmtKes(stats.thisMonth),   sub: 'confirmed check-ins' },
            { label: 'Upcoming',         value: fmtKes(stats.pending),     sub: 'not yet attended' },
            { label: 'Total withdrawn',  value: fmtKes(stats.totalWithdrawn), sub: 'paid out' },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <ThemedText style={styles.statLabel}>{s.label}</ThemedText>
              <ThemedText style={styles.statValue}>{s.value}</ThemedText>
              <ThemedText style={styles.statSub}>{s.sub}</ThemedText>
            </View>
          ))}
        </View>

        {/* Withdrawal history */}
        {withdrawals.length > 0 && (
          <>
            <ThemedText style={styles.sectionTitle}>Withdrawal history</ThemedText>
            {withdrawals.map((w) => {
              const ws = withdrawalStatusInfo[w.status];
              return (
                <View key={w.id} style={styles.withdrawalRow}>
                  <View style={[styles.withdrawalIcon, { backgroundColor: ws.color + '18' }]}>
                    <Ionicons name={ws.icon as any} size={20} color={ws.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.withdrawalPhone}>{w.phone ?? 'M-Pesa'}</ThemedText>
                    <ThemedText style={styles.withdrawalDate}>{fmtDate(w.created_at)}</ThemedText>
                    {w.receipt_number && (
                      <ThemedText style={styles.withdrawalReceipt}>Ref: {w.receipt_number}</ThemedText>
                    )}
                    {w.failure_reason && w.status === 'failed' && (
                      <ThemedText style={styles.withdrawalError}>{w.failure_reason}</ThemedText>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <ThemedText style={styles.withdrawalAmount}>-{fmtKes(w.amount)}</ThemedText>
                    <View style={[styles.badge, { backgroundColor: ws.color + '18' }]}>
                      <ThemedText style={[styles.badgeText, { color: ws.color }]}>{ws.label}</ThemedText>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Booking history */}
        <ThemedText style={styles.sectionTitle}>Booking history</ThemedText>
        {bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={36} color="#d1d5db" />
            <ThemedText style={styles.emptyText}>No bookings yet</ThemedText>
          </View>
        ) : (
          bookings.map((b) => {
            const s = statusInfo[b.status];
            const initials = b.member_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            return (
              <View key={b.id} style={[styles.bookingRow, b.status === 'no_show' && styles.bookingRowDim]}>
                <View style={[styles.avatar, { backgroundColor: PRIMARY + '15' }]}>
                  <ThemedText style={styles.avatarText}>{initials}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.memberName}>{b.member_name}</ThemedText>
                  <ThemedText style={styles.sessionName}>{b.session_name} · {fmtDate(b.booking_date)}</ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <ThemedText style={[styles.amount, b.status === 'no_show' && styles.amountStrike]}>
                    {fmtKes(b.amount_kes)}
                  </ThemedText>
                  <View style={[styles.badge, { backgroundColor: s.color + '18' }]}>
                    <ThemedText style={[styles.badgeText, { color: s.color }]}>{s.label}</ThemedText>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Withdraw Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Withdraw Money</ThemedText>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color="#111827" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalAvailable}>
                <ThemedText style={styles.modalAvailableLabel}>Available to withdraw</ThemedText>
                <ThemedText style={styles.modalAvailableAmount}>{fmtKes(stats.available)}</ThemedText>
              </View>

              <ThemedText style={styles.fieldLabel}>Amount (KES)</ThemedText>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder="Enter amount"
                placeholderTextColor="#9ca3af"
              />

              <ThemedText style={styles.fieldLabel}>Send to</ThemedText>
              <View style={styles.destTabs}>
                {(['MPESA_NUMBER', 'MPESA_PAYBILL', 'BANK'] as const).map((t) => {
                  const labels = { MPESA_NUMBER: 'M-Pesa', MPESA_PAYBILL: 'Paybill', BANK: 'Bank' };
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.destTab, destType === t && styles.destTabActive]}
                      onPress={() => setDestType(t)}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={[styles.destTabText, destType === t && styles.destTabTextActive]}>
                        {labels[t]}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {destType === 'MPESA_NUMBER' && (
                <>
                  <ThemedText style={styles.fieldLabel}>M-Pesa Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    keyboardType="phone-pad"
                    value={withdrawPhone}
                    onChangeText={setWithdrawPhone}
                    placeholder="07XX XXX XXX"
                    placeholderTextColor="#9ca3af"
                  />
                </>
              )}

              {destType === 'MPESA_PAYBILL' && (
                <>
                  <ThemedText style={styles.fieldLabel}>Paybill Business Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={withdrawBusinessNum}
                    onChangeText={setWithdrawBusinessNum}
                    placeholder="e.g. 522522"
                    placeholderTextColor="#9ca3af"
                  />
                  <ThemedText style={styles.fieldLabel}>Account Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={withdrawAccountNum}
                    onChangeText={setWithdrawAccountNum}
                    placeholder="Account / store number"
                    placeholderTextColor="#9ca3af"
                  />
                </>
              )}

              {destType === 'BANK' && (
                <>
                  <ThemedText style={styles.fieldLabel}>Bank Name</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={withdrawBankName}
                    onChangeText={setWithdrawBankName}
                    placeholder="e.g. KCB, Equity, NCBA"
                    placeholderTextColor="#9ca3af"
                  />
                  <ThemedText style={styles.fieldLabel}>Account Number</ThemedText>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={withdrawAccountNum}
                    onChangeText={setWithdrawAccountNum}
                    placeholder="Bank account number"
                    placeholderTextColor="#9ca3af"
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
                onPress={handleWithdraw}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <ThemedText style={styles.confirmBtnText}>Confirm Withdrawal</ThemedText>
                }
              </TouchableOpacity>

              <ThemedText style={styles.modalNote}>
                Transfers are processed manually within 24 hours.
              </ThemedText>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },

  balanceCard: { backgroundColor: PRIMARY, borderRadius: 20, padding: 20, marginBottom: 16 },
  balanceLabel: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '800', color: '#fff', paddingTop: 10 },
  balanceNote: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 },

  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  withdrawBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.2)' },
  withdrawBtnText: { fontSize: 14, fontWeight: '700', color: PRIMARY },
  withdrawBtnTextDisabled: { color: '#9ca3af' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  statLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },

  withdrawalRow: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  withdrawalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  withdrawalPhone: { fontSize: 13, fontWeight: '700', color: '#111827' },
  withdrawalDate: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  withdrawalReceipt: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  withdrawalError: { fontSize: 11, color: '#dc2626', marginTop: 2 },
  withdrawalAmount: { fontSize: 14, fontWeight: '700', color: '#111827' },

  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 40, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  bookingRow: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  bookingRowDim: { opacity: 0.65 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  memberName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  sessionName: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  amount: { fontSize: 14, fontWeight: '700', color: '#111827' },
  amountStrike: { textDecorationLine: 'line-through', color: '#9ca3af' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },

  modalAvailable: { backgroundColor: '#f5f5f7', borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center' },
  modalAvailableLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  modalAvailableAmount: { fontSize: 28, fontWeight: '800', color: '#111827', marginTop: 4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 16 },

  confirmBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  modalNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 12 },

  destTabs: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 },
  destTab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  destTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  destTabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  destTabTextActive: { color: '#111827' },
});

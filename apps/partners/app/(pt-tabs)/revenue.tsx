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

interface EarningRow {
  id: string;
  client_name: string;
  offering_title: string;
  scheduled_date: string;
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

export default function PTRevenueScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({ totalEarned: 0, thisMonth: 0, pending: 0, noShows: 0, totalWithdrawn: 0, available: 0 });
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [ptId, setPtId] = useState<string | null>(null);

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

      const { data: pt } = await supabase
        .from('personal_trainers').select('id').eq('user_id', user.id).single();
      if (!pt) return;
      setPtId(pt.id);

      const { data: bookingData } = await supabase
        .from('pt_bookings')
        .select('id, scheduled_date, status, amount_kes, users(name, email), pt_offerings(title)')
        .eq('pt_id', pt.id)
        .order('scheduled_date', { ascending: false })
        .limit(50);

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      let totalEarned = 0;
      let thisMonth = 0;
      let pending = 0;
      let noShows = 0;

      const rows: EarningRow[] = (bookingData || []).map((b: any) => {
        const payout = b.amount_kes || 0;
        const bDate = new Date(b.scheduled_date);
        const clientName = b.users?.name || b.users?.email || 'Client';
        const offeringTitle = b.pt_offerings?.title || 'Session';

        let rowStatus: BookingStatus;
        if (b.status === 'no_show' || b.status === 'cancelled') {
          rowStatus = 'no_show';
          noShows += payout;
        } else if (b.status === 'completed') {
          rowStatus = 'earned';
          totalEarned += payout;
          if (bDate >= monthStart) thisMonth += payout;
        } else {
          rowStatus = 'pending';
          pending += payout;
        }

        return {
          id: b.id,
          client_name: clientName,
          offering_title: offeringTitle,
          scheduled_date: b.scheduled_date,
          amount_kes: payout,
          status: rowStatus,
        };
      });

      // Load withdrawal history
      let totalWithdrawn = 0;
      let withdrawalRows: Withdrawal[] = [];
      const { data: wData } = await supabase
        .from('pt_payout_requests')
        .select('id, amount, phone, status, receipt_number, failure_reason, created_at')
        .eq('pt_id', pt.id)
        .order('created_at', { ascending: false })
        .limit(20);

      withdrawalRows = (wData || []) as Withdrawal[];
      totalWithdrawn = withdrawalRows
        .filter(w => w.status === 'completed' || w.status === 'processing')
        .reduce((s, w) => s + Number(w.amount), 0);

      setEarnings(rows);
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
    if (!ptId) { Alert.alert('Error', 'Profile not found'); return; }

    let phoneClean = '';
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
          type: 'pt',
          ptId,
          amount,
          destinationType: destType,
          phone: phoneClean || null,
          businessNumber: withdrawBusinessNum || null,
          accountNumber: withdrawAccountNum || null,
          bankName: withdrawBankName || null,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      setShowModal(false);
      const destLabel = destType === 'MPESA_NUMBER'
        ? 'M-Pesa number'
        : destType === 'MPESA_PAYBILL'
        ? 'Paybill account'
        : 'bank account';
      Alert.alert('Withdrawal Requested', `Your request has been received. We'll process the transfer to your ${destLabel} shortly.`);
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
    earned:  { label: 'Earned',  color: '#16a34a' },
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={PRIMARY}
          />
        }
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <ThemedText style={styles.balanceLabel}>Available to withdraw</ThemedText>
          <ThemedText style={styles.balanceAmount}>{fmtKes(stats.available)}</ThemedText>
          <ThemedText style={styles.balanceNote}>Completed session earnings · {fmtKes(stats.totalWithdrawn)} already withdrawn</ThemedText>
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
            { label: 'Lifetime revenue', value: fmtKes(stats.totalEarned),    sub: 'all time' },
            { label: 'This month',       value: fmtKes(stats.thisMonth),       sub: 'completed sessions' },
            { label: 'Upcoming',         value: fmtKes(stats.pending),         sub: 'not yet completed' },
            { label: 'Total withdrawn',  value: fmtKes(stats.totalWithdrawn),  sub: 'paid out' },
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

        {/* Session history */}
        <ThemedText style={styles.sectionTitle}>Session history</ThemedText>
        {earnings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={36} color="#d1d5db" />
            <ThemedText style={styles.emptyText}>No sessions yet</ThemedText>
          </View>
        ) : (
          earnings.map((e) => {
            const s = statusInfo[e.status];
            const initials = e.client_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            return (
              <View key={e.id} style={[styles.bookingRow, e.status === 'no_show' && styles.bookingRowDim]}>
                <View style={[styles.avatar, { backgroundColor: PRIMARY + '15' }]}>
                  <ThemedText style={styles.avatarText}>{initials}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.memberName}>{e.client_name}</ThemedText>
                  <ThemedText style={styles.sessionName}>{e.offering_title} · {fmtDate(e.scheduled_date)}</ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <ThemedText style={[styles.amount, e.status === 'no_show' && styles.amountStrike]}>
                    {fmtKes(e.amount_kes)}
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
                {destType === 'MPESA_PAYBILL'
                  ? 'Paybill transfers are sent automatically via M-Pesa.'
                  : 'Transfers are processed manually within 24 hours.'}
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

  destTabs: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 },
  destTab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  destTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  destTabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  destTabTextActive: { color: '#111827' },

  confirmBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  modalNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 12 },
});

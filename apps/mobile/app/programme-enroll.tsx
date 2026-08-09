import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Dimensions, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type OfferingFull = {
  id: string;
  title: string;
  pt_id: string;
  programme_weeks: number;
  programme_price_kes: number;
  deposit_pct: number;
  instalment_frequency_weeks: number | null;
  pt: {
    id: string;
    full_name: string;
    professional_name: string | null;
    photo_url: string | null;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - 48) / 7);
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMpesa(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return `254${digits}`;
  throw new Error('Enter a valid Safaricom M-Pesa number (07XX or 01XX).');
}

function fmtMoney(n: number) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProgrammeEnrollScreen() {
  const router = useRouter();
  const { offeringId, enrollmentId } = useLocalSearchParams<{ offeringId: string; enrollmentId: string }>();

  const [offering, setOffering] = useState<OfferingFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [step, setStep] = useState<'confirm' | 'processing' | 'confirmed' | 'failed'>('confirm');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calendar nav
  const _today = new Date();
  const [calYear, setCalYear] = useState(_today.getFullYear());
  const [calMonth, setCalMonth] = useState(_today.getMonth());

  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [offeringId]);

  const load = async () => {
    const { data } = await supabase
      .from('pt_offerings')
      .select('id, title, pt_id, programme_weeks, programme_price_kes, deposit_pct, instalment_frequency_weeks, personal_trainers!pt_id(id, full_name, professional_name, photo_url)')
      .eq('id', offeringId)
      .eq('is_programme', true)
      .single();

    if (data) {
      const rawPt = Array.isArray((data as any).personal_trainers)
        ? (data as any).personal_trainers[0]
        : (data as any).personal_trainers;
      setOffering({ ...(data as any), pt: rawPt });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (!offering) return null;

  const displayName = offering.pt.professional_name ?? offering.pt.full_name;
  const total = Number(offering.programme_price_kes);
  const depositPct = offering.deposit_pct ?? 30;
  const deposit = Math.round(total * depositPct / 100);
  const remaining = total - deposit;
  const freq = offering.instalment_frequency_weeks;
  const numInstalments = freq ? Math.floor(offering.programme_weeks / freq) : 0;
  const instalmentAmount = numInstalments > 0 ? Math.round(remaining / numInstalments) : remaining;

  const schedule: { label: string; amount: number }[] = [
    { label: 'Deposit — due now', amount: deposit },
  ];
  for (let i = 1; i <= numInstalments; i++) {
    schedule.push({
      label: `Week ${i * freq!}`,
      amount: i === numInstalments ? remaining - instalmentAmount * (numInstalments - 1) : instalmentAmount,
    });
  }

  async function handlePay() {
    setError(null);
    if (!startDate) { setError('Please select a programme start date.'); return; }

    let phone: string;
    try { phone = normalizeMpesa(mpesaPhone); }
    catch (e: any) { setError(e.message); return; }

    setStep('processing');

    try {
      const bookingId = `PROG-${enrollmentId.slice(0, 8).toUpperCase()}-${Date.now()}`;
      const billRef = `PROG-${enrollmentId.slice(0, 8).toUpperCase()}`;

      const payRes = await fetch('https://activecitypass.com/api/wallet/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: bookingId,
          billRef,
          phone,
          amount: String(deposit),
          currency: 'KES',
          metadata: { source: 'programme-deposit', enrollmentId, offeringId },
        }),
      });
      const payData = await payRes.json().catch(() => ({}));
      if (!payRes.ok) throw new Error((payData as any)?.error ?? 'Payment initiation failed.');

      const status = String((payData as any)?.status ?? '').toUpperCase();
      if (status === 'COMPLETED') {
        await commitEnrollment('paid', (payData as any)?.mpesaReceipt ?? billRef);
        return;
      }

      const requestId = (payData as any)?.requestId ?? bookingId;
      const startedAt = Date.now();
      const poll = async () => {
        if (Date.now() - startedAt > 120_000) {
          await commitEnrollment('failed', null);
          setStep('failed');
          setError('Payment timed out. Please try again.');
          return;
        }
        pollRef.current = setTimeout(async () => {
          try {
            const res = await fetch(`https://activecitypass.com/api/wallet/payment?requestId=${encodeURIComponent(requestId)}`);
            const data = await res.json().catch(() => ({}));
            const s = String((data as any)?.status ?? '').toUpperCase();
            if (s === 'COMPLETED') {
              await commitEnrollment('paid', (data as any)?.mpesaReceipt ?? billRef);
            } else if (['FAILED', 'CANCELLED', 'EXPIRED', 'TIMEOUT'].includes(s)) {
              await commitEnrollment('failed', null);
              setStep('failed');
              setError('Payment was not completed. Please try again.');
            } else {
              poll();
            }
          } catch {
            poll();
          }
        }, 5000);
      };
      poll();
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
      setStep('confirm');
    }
  }

  async function commitEnrollment(paymentStatus: 'paid' | 'failed', mpesaRef: string | null) {
    await fetch('https://activecitypass.com/api/pt-programme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'commit',
        enrollment_id: enrollmentId,
        programme_start_date: startDate,
        total_price_kes: total,
        deposit_pct: depositPct,
        deposit_paid_kes: deposit,
        payment_method: 'mpesa',
        payment_status: paymentStatus,
        mpesa_reference: mpesaRef,
      }),
    }).catch(() => null);
    if (paymentStatus === 'paid') setStep('confirmed');
  }

  // ── Processing screen ─────────────────────────────────────────────────────

  if (step === 'processing') {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#4f46e5" style={{ marginBottom: 24 }} />
        <ThemedText style={styles.processingTitle}>Waiting for M-Pesa payment…</ThemedText>
        <ThemedText style={styles.processingSubtitle}>
          Check your phone for an M-Pesa prompt and enter your PIN to complete.
        </ThemedText>
      </View>
    );
  }

  // ── Confirmed screen ──────────────────────────────────────────────────────

  if (step === 'confirmed') {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={36} color={palette.white} />
        </View>
        <ThemedText style={styles.successTitle}>You're in!</ThemedText>
        <ThemedText style={styles.successSub}>
          Your <ThemedText style={{ fontWeight: '800' }}>{offering.title}</ThemedText> journey begins{' '}
          <ThemedText style={{ fontWeight: '700' }}>{fmtDate(startDate!)}</ThemedText>.
        </ThemedText>
        <ThemedText style={styles.successNote}>{displayName} will be in touch to schedule your sessions.</ThemedText>

        <View style={styles.scheduleCard}>
          <ThemedText style={styles.scheduleCardTitle}>Payment schedule</ThemedText>
          {schedule.map((row, i) => (
            <View key={i} style={styles.scheduleRow}>
              <ThemedText style={[styles.scheduleLabel, i === 0 && { color: palette.ink900, fontWeight: '700' }]}>
                {row.label}
              </ThemedText>
              <ThemedText style={[styles.scheduleAmount, i === 0 && { color: palette.ink900, fontWeight: '800' }]}>
                {fmtMoney(row.amount)}
              </ThemedText>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(tabs)')}
        >
          <ThemedText style={styles.primaryBtnText}>Back to Home</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Failed screen ─────────────────────────────────────────────────────────

  if (step === 'failed') {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.failIcon}>
          <Ionicons name="close" size={36} color={palette.white} />
        </View>
        <ThemedText style={styles.successTitle}>Payment Failed</ThemedText>
        <ThemedText style={styles.processingSubtitle}>{error}</ThemedText>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => { setStep('confirm'); setError(null); }}
        >
          <ThemedText style={styles.primaryBtnText}>Try Again</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main confirm screen ───────────────────────────────────────────────────

  // Calendar logic
  const todayStr = _today.toISOString().slice(0, 10);
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const offset = (firstDay + 6) % 7;
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const canGoPrev = calYear > _today.getFullYear() || calMonth > _today.getMonth();
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.headerTitle}>Join Programme</ThemedText>
          <ThemedText style={styles.headerSub}>{offering.title}</ThemedText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Trainer */}
        <View style={styles.trainerRow}>
          {offering.pt.photo_url ? (
            <Image source={{ uri: offering.pt.photo_url }} style={styles.trainerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.trainerAvatarFallback}>
              <ThemedText style={styles.trainerInitial}>{displayName[0].toUpperCase()}</ThemedText>
            </View>
          )}
          <ThemedText style={styles.trainerName}>with {displayName}</ThemedText>
          <ThemedText style={styles.trainerDuration}>· {offering.programme_weeks} weeks</ThemedText>
        </View>

        {/* Payment schedule */}
        <View style={styles.scheduleCard}>
          <ThemedText style={styles.scheduleCardTitle}>Payment schedule</ThemedText>
          {schedule.map((row, i) => (
            <View key={i} style={styles.scheduleRow}>
              <ThemedText style={[styles.scheduleLabel, i === 0 && { color: palette.ink900, fontWeight: '600' }]}>
                {row.label}
              </ThemedText>
              <ThemedText style={[styles.scheduleAmount, i === 0 && { fontSize: fontSize.lg, color: palette.ink900, fontWeight: '800' }]}>
                {fmtMoney(row.amount)}
              </ThemedText>
            </View>
          ))}
          <View style={styles.scheduleTotalRow}>
            <ThemedText style={styles.scheduleTotalLabel}>Total programme</ThemedText>
            <ThemedText style={styles.scheduleTotalAmount}>{fmtMoney(total)}</ThemedText>
          </View>
        </View>

        {/* Start date */}
        <ThemedText style={styles.sectionLabel}>Programme start date</ThemedText>
        {startDate && (
          <View style={styles.selectedDateBadge}>
            <Ionicons name="calendar" size={15} color="#4f46e5" />
            <ThemedText style={styles.selectedDateText}>{fmtDate(startDate)}</ThemedText>
          </View>
        )}
        <View style={styles.calendarWrapper}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} disabled={!canGoPrev} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={20} color={canGoPrev ? palette.ink900 : palette.border} />
            </TouchableOpacity>
            <ThemedText style={styles.calMonthLabel}>{MONTH_NAMES[calMonth]} {calYear}</ThemedText>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={20} color={palette.ink900} />
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekRow}>
            {DAY_LABELS.map(d => (
              <View key={d} style={styles.calDayHeader}>
                <ThemedText style={styles.calDayHeaderText}>{d}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.calGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelectable = dateStr >= minDate;
              const isSelected = startDate === dateStr;
              const isToday = dateStr === todayStr;
              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.calCell,
                    isSelected && styles.calCellSelected,
                    isToday && !isSelected && styles.calCellToday,
                  ]}
                  onPress={() => isSelectable && setStartDate(dateStr)}
                  activeOpacity={isSelectable ? 0.7 : 1}
                >
                  <ThemedText style={[
                    styles.calDayText,
                    isSelected && styles.calDayTextSelected,
                    isToday && !isSelected && styles.calDayTextToday,
                    !isSelectable && styles.calDayTextDisabled,
                  ]}>
                    {day}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* M-Pesa */}
        <ThemedText style={styles.sectionLabel}>M-Pesa number</ThemedText>
        <TextInput
          style={styles.mpesaInput}
          placeholder="07XX XXX XXX"
          placeholderTextColor={palette.gray300}
          value={mpesaPhone}
          onChangeText={setMpesaPhone}
          keyboardType="phone-pad"
        />
        <ThemedText style={styles.inputHint}>
          You'll receive an M-Pesa prompt for the deposit of {fmtMoney(deposit)}.
        </ThemedText>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={palette.danger600} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.payBtn, (!startDate || !mpesaPhone.trim()) && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={!startDate || !mpesaPhone.trim()}
        >
          <ThemedText style={styles.payBtnText}>Pay deposit {fmtMoney(deposit)} via M-Pesa</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.bottomNote}>
          By confirming, you agree to the payment schedule above.
        </ThemedText>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  container: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  headerSub: { fontSize: 12, color: palette.gray300, marginTop: 1 },

  content: { padding: 24, paddingBottom: 140 },

  trainerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20,
  },
  trainerAvatar: { width: 32, height: 32, borderRadius: 16 },
  trainerAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center',
  },
  trainerInitial: { fontSize: fontSize.sm, fontWeight: '800', color: '#4f46e5' },
  trainerName: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  trainerDuration: { fontSize: fontSize.sm, color: palette.gray450 },

  scheduleCard: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  scheduleCardTitle: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  scheduleLabel: { fontSize: fontSize.sm, color: palette.gray450 },
  scheduleAmount: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  scheduleTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: palette.border,
    marginTop: 4, paddingTop: 12,
  },
  scheduleTotalLabel: { fontSize: fontSize.sm, color: palette.gray450 },
  scheduleTotalAmount: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },

  sectionLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900, marginBottom: 10,
  },

  selectedDateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eef2ff', borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
    alignSelf: 'flex-start',
  },
  selectedDateText: { fontSize: fontSize.sm, fontWeight: '700', color: '#4f46e5' },

  calendarWrapper: { marginBottom: 24 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calNavBtn: { padding: 8 },
  calMonthLabel: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader: { width: DAY_SIZE, alignItems: 'center', paddingVertical: 6 },
  calDayHeaderText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: DAY_SIZE, height: DAY_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: DAY_SIZE / 2 },
  calCellSelected: { backgroundColor: '#4f46e5' },
  calCellToday: { backgroundColor: palette.blue50 },
  calDayText: { fontSize: fontSize.base, fontWeight: '500', color: palette.ink700 },
  calDayTextSelected: { color: palette.white, fontWeight: '700' },
  calDayTextToday: { color: palette.blue500, fontWeight: '700' },
  calDayTextDisabled: { color: '#d1d5db' },

  mpesaInput: {
    borderWidth: 1.5, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: fontSize.base, color: palette.ink900,
    backgroundColor: palette.surfaceMuted,
    marginBottom: 8,
  },
  inputHint: { fontSize: fontSize.xs, color: palette.gray300, marginBottom: 16 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: palette.danger50, borderRadius: radii.md,
    padding: 12, borderWidth: 1, borderColor: '#fecaca',
  },
  errorText: { fontSize: fontSize.sm, color: palette.danger600, flex: 1, lineHeight: 18 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: palette.white,
    borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  payBtn: {
    backgroundColor: palette.ink900,
    paddingVertical: 16, borderRadius: 30,
    alignItems: 'center', marginBottom: 8,
  },
  payBtnDisabled: { opacity: 0.3 },
  payBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
  bottomNote: { fontSize: fontSize.xs, color: palette.gray300, textAlign: 'center' },

  // Centred screens (processing / confirmed / failed)
  centeredContainer: {
    flex: 1, backgroundColor: palette.white,
    alignItems: 'center', justifyContent: 'center',
    padding: 32,
  },
  processingTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, textAlign: 'center', marginBottom: 8 },
  processingSubtitle: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 22 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#4f46e5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  failIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: palette.danger500,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontSize: 26, fontWeight: '800', color: palette.ink900, marginBottom: 10, textAlign: 'center' },
  successSub: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 22, marginBottom: 6 },
  successNote: { fontSize: fontSize.xs, color: palette.gray300, textAlign: 'center', marginBottom: 24 },
  primaryBtn: {
    backgroundColor: palette.ink900,
    paddingVertical: 16, paddingHorizontal: 48,
    borderRadius: 30, marginTop: 8,
  },
  primaryBtnText: { color: palette.white, fontSize: fontSize.lg, fontWeight: '700' },
});

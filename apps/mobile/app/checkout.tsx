import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';
import { useState, useEffect, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';

const PAYBILL_NUMBER = '4322745';


type Phase = 'idle' | 'submitting' | 'waiting' | 'success' | 'failed';
type Method = 'mpesa' | 'pesapal';
type MpesaMode = 'stk' | 'paybill';

const CHECKOUT_TOUR: TourStep[] = [
  {
    icon: 'receipt-outline',
    title: 'Review Your Booking',
    description: 'Check the summary and price breakdown before you pay. Deposits are charged now — the balance is settled at the venue.',
  },
  {
    icon: 'phone-portrait-outline',
    title: 'Pay Your Way',
    description: 'Choose M-Pesa for an instant STK push to your phone, or pay by card through our secure Pesapal gateway.',
  },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('checkout');
  const params = useLocalSearchParams<{
    bookingType: string;
    itemId: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    totalPrice: string;
    depositAmount: string;
    remainderAmount: string;
    discountKes?: string;
    ptId?: string;
    ptDate?: string;
    ptTime?: string;
    locationType?: string;
    clientAddress?: string;
    mode?: string;
    existingBookingId?: string;
    existingConfirmationCode?: string;
  }>();

  const {
    bookingType, itemId, title, subtitle, imageUrl,
    totalPrice, depositAmount, remainderAmount, discountKes,
    ptId, ptDate, ptTime, locationType, clientAddress,
    mode, existingBookingId, existingConfirmationCode,
  } = params;

  const isBalanceMode = mode === 'balance';
  const depositNum = Number(depositAmount ?? 0);
  const remainderNum = Number(remainderAmount ?? 0);
  const totalNum = Number(totalPrice ?? depositNum + remainderNum);
  const discountNum = Number(discountKes ?? 0);
  const hasDiscount = discountNum > 0;

  const [method, setMethod] = useState<Method>('mpesa');
  const [mpesaMode, setMpesaMode] = useState<MpesaMode>('stk');
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  // PayBill sheet state
  const [paybillVisible, setPaybillVisible] = useState(false);
  const [paybillStep, setPaybillStep] = useState<'instructions' | 'receipt' | 'confirming'>('instructions');
  const [paybillCode, setPaybillCode] = useState<string | null>(null);
  const [paybillReceipt, setPaybillReceipt] = useState('');
  const [paybillPhone, setPaybillPhone] = useState('');
  const [paybillError, setPaybillError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? '');
      setUserName(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '');
      const { data } = await supabase.from('users').select('phone').eq('id', user.id).maybeSingle();
      if (data?.phone) setPhone(data.phone);
    })();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  // ── STK push polling ────────────────────────────────────────────────────────

  const pollBookingStatus = (bookingId: string, checkoutReqId: string, bType: string) => {
    let attempts = 0;
    const maxAttempts = 36; // ~2.5 min — extra buffer for late success callbacks
    let seenStkTimeout = false;

    const doPoll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setError(seenStkTimeout ? 'stk_timeout' : 'Confirmation timed out. If you approved the M-Pesa prompt, check your bookings page.');
        setPhase('failed');
        return;
      }
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('booking-status', {
          body: { bookingId, bookingType: bType, checkoutRequestId: checkoutReqId },
        });

        if (fnErr || !data) { pollRef.current = setTimeout(doPoll, 5000); return; }

        if (data.status === 'confirmed' || data.status === 'deposit_paid') {
          if (data.confirmationCode) setConfirmCode(data.confirmationCode);
          setPhase('success');
          return;
        }
        if (data.status === 'cancelled') {
          const reason = data.cancellationReason ?? '';
          if (reason === 'stk_timeout') {
            // Daraja timeout fired but user may have just paid — keep polling for success callback
            seenStkTimeout = true;
            pollRef.current = setTimeout(doPoll, 4000);
            return;
          }
          const darajaMsg = reason.startsWith('mpesa_failed: ')
            ? reason.slice('mpesa_failed: '.length)
            : null;
          setError(darajaMsg ?? 'Payment was not completed. Please try again.');
          setPhase('failed');
          return;
        }
        // pending — keep polling
        pollRef.current = setTimeout(doPoll, 4000);
      } catch {
        pollRef.current = setTimeout(doPoll, 5000);
      }
    };

    pollRef.current = setTimeout(doPoll, 3000);
  };

  const pollPtStatus = (ptBookingId: string) => {
    let attempts = 0;
    const maxAttempts = 30;

    const doPoll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setError('Confirmation timed out. If you approved the M-Pesa prompt, check your bookings page.');
        setPhase('failed');
        return;
      }
      try {
        const { data, error: dbErr } = await supabase
          .from('pt_bookings')
          .select('payment_status, status')
          .eq('id', ptBookingId)
          .single();

        if (!dbErr && data) {
          if (data.payment_status === 'paid' && data.status === 'confirmed') {
            setPhase('success');
            return;
          }
          if (data.status === 'cancelled') {
            setError('Payment was not completed. Please try again.');
            setPhase('failed');
            return;
          }
        }
        pollRef.current = setTimeout(doPoll, 4000);
      } catch {
        pollRef.current = setTimeout(doPoll, 5000);
      }
    };

    pollRef.current = setTimeout(doPoll, 3000);
  };

  // ── Pay via M-Pesa STK push ─────────────────────────────────────────────────

  const payMpesaStk = async () => {
    setError(null);
    if (!phone.trim()) { setError('Please enter your M-Pesa phone number.'); return; }
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    setPhase('submitting');

    try {
      if (isBalanceMode && existingBookingId) {
        const { data, error: fnErr } = await supabase.functions.invoke('pay-balance-stk', {
          body: { bookingId: existingBookingId, phone: phone.trim() },
        });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        setPhase('waiting');
        pollBookingStatus(existingBookingId, data.checkoutRequestId, 'session');

      } else if (bookingType === 'session') {
        const { data, error: fnErr } = await supabase.functions.invoke('book-session', {
          body: { sessionId: itemId, phone: phone.trim() },
        });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        if (data.confirmationCode) setConfirmCode(data.confirmationCode);
        setPhase('waiting');
        pollBookingStatus(data.bookingId, data.checkoutRequestId, 'session');

      } else if (bookingType === 'experience') {
        const { data, error: fnErr } = await supabase.functions.invoke('book-experience', {
          body: { experienceId: itemId, phone: phone.trim() },
        });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        if (data.confirmationCode) setConfirmCode(data.confirmationCode);
        setPhase('waiting');
        pollBookingStatus(data.bookingId, data.checkoutRequestId, 'experience');

      } else if (bookingType === 'community_event') {
        const { data, error: fnErr } = await supabase.functions.invoke('book-community-event', {
          body: { eventId: itemId, phone: phone.trim() },
        });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        if (data.confirmationCode) setConfirmCode(data.confirmationCode);
        setPhase('waiting');
        pollBookingStatus(data.attendeeId, data.checkoutRequestId, 'community_event');

      } else if (bookingType === 'pt') {
        if (!ptId || !ptDate || !ptTime) throw new Error('Missing PT booking details');
        const { data: { user } } = await supabase.auth.getUser();

        // Create PT booking first
        const { data: newPtBooking, error: ptErr } = await supabase
          .from('pt_bookings')
          .insert({
            pt_id: ptId,
            offering_id: itemId,
            user_id: user?.id,
            scheduled_date: ptDate,
            scheduled_time: ptTime,
            location_type: locationType || null,
            client_address: clientAddress || null,
            amount_kes: totalNum,
            payment_method: 'mpesa',
            payment_status: 'pending',
            status: 'pending',
          })
          .select('id')
          .single();

        if (ptErr || !newPtBooking) throw new Error(ptErr?.message ?? 'Failed to create booking');

        const { error: fnErr } = await supabase.functions.invoke('book-pt-stk', {
          body: { ptBookingId: newPtBooking.id, phone: phone.trim() },
        });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        setPhase('waiting');
        pollPtStatus(newPtBooking.id);
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setPhase('failed');
    }
  };

  // ── Pay via Pesapal ─────────────────────────────────────────────────────────

  const payPesapal = async () => {
    setError(null);
    setPhase('submitting');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const nameParts = userName.split(' ');
      let redirectUrl: string | null = null;
      let orderTrackingId: string | null = null;

      if (bookingType === 'session' || bookingType === 'experience') {
        const body: Record<string, any> = {
          paymentMethod: 'pesapal',
          phone: phone.trim() || undefined,
          email: userEmail || user.email,
        };
        if (bookingType === 'session') body.sessionId = itemId;
        else body.experienceId = itemId;

        const { data, error: fnErr } = await supabase.functions.invoke('checkout-booking', { body });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        redirectUrl = data.redirectUrl ?? data.redirect_url ?? null;
        orderTrackingId = data.orderTrackingId ?? null;

      } else if (bookingType === 'pt') {
        if (!ptId || !ptDate || !ptTime) throw new Error('Missing PT booking details');
        const { data, error: fnErr } = await supabase.functions.invoke('checkout-booking', {
          body: {
            type: 'pt',
            amount: totalNum,
            description: title,
            email: userEmail || user.email,
            phone: phone.trim() || undefined,
            firstName: nameParts[0] ?? '',
            lastName: nameParts.slice(1).join(' ') ?? '',
            callbackUrl: 'acitypass://pesapal-callback',
            metadata: {
              ptId,
              offeringId: itemId,
              scheduledDate: ptDate,
              scheduledTime: ptTime,
              locationType: locationType ?? '1-on-1',
              clientAddress: clientAddress ?? null,
              userId: user.id,
            },
          },
        });
        if (fnErr) throw new Error(fnErr.message ?? 'Payment initiation failed');
        redirectUrl = data.redirectUrl ?? data.redirect_url ?? null;
        orderTrackingId = data.orderTrackingId ?? null;
      }

      if (!redirectUrl) throw new Error('No redirect URL received');

      setPhase('waiting');
      const result = await WebBrowser.openAuthSessionAsync(redirectUrl, 'acitypass://pesapal-callback');

      if (result.type === 'success' || result.type === 'dismiss') {
        if (orderTrackingId) {
          const { data: statusData } = await supabase.functions.invoke('checkout-booking', {
            body: { checkStatus: true, orderTrackingId },
          });
          if (statusData?.payment_status_description === 'Completed') {
            setConfirmCode(statusData.confirmation_code ?? null);
            setPhase('success');
            return;
          }
        }
        setError('Payment is still processing. Check your bookings for confirmation.');
        setPhase('idle');
      } else {
        setPhase('idle');
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setPhase('failed');
    }
  };

  // ── PayBill ─────────────────────────────────────────────────────────────────

  const copyToClipboard = async (value: string, field: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openPayBill = () => {
    const code = isBalanceMode && existingConfirmationCode
      ? existingConfirmationCode
      : Math.random().toString(36).substring(2, 10).toUpperCase();
    setPaybillCode(code);
    setPaybillReceipt('');
    setPaybillPhone(phone);
    setPaybillError(null);
    setPaybillStep('instructions');
    setPaybillVisible(true);
  };

  const confirmPayBill = async () => {
    if (!paybillReceipt.trim() || !paybillCode) return;
    setPaybillStep('confirming');
    setPaybillError(null);
    try {
      const phoneForNotify = paybillPhone.trim() || null;
      if (isBalanceMode && existingBookingId) {
        const { error: fnErr } = await supabase.functions.invoke('book-paybill', {
          body: { balanceBookingId: existingBookingId, confirmationCode: paybillCode, receipt: paybillReceipt.trim(), phone: phoneForNotify },
        });
        if (fnErr) throw new Error((fnErr as any).message ?? 'Could not confirm payment');
      } else if (bookingType === 'pt') {
        if (!ptId || !ptDate || !ptTime) throw new Error('Missing PT booking details');
        const { error: fnErr } = await supabase.functions.invoke('book-paybill', {
          body: {
            ptOfferingId: itemId, ptId, ptDate, ptTime,
            locationType: locationType || null, clientAddress: clientAddress || null,
            confirmationCode: paybillCode, receipt: paybillReceipt.trim(), phone: phoneForNotify,
          },
        });
        if (fnErr) throw new Error((fnErr as any).message ?? 'Could not confirm payment');
      } else {
        const body = bookingType === 'session'
          ? { sessionId: itemId, confirmationCode: paybillCode, receipt: paybillReceipt.trim(), phone: phoneForNotify }
          : { experienceId: itemId, confirmationCode: paybillCode, receipt: paybillReceipt.trim(), phone: phoneForNotify };
        const { error: fnErr } = await supabase.functions.invoke('book-paybill', { body });
        if (fnErr) throw new Error((fnErr as any).message ?? 'Could not confirm payment');
      }
      setPaybillVisible(false);
      setConfirmCode(paybillCode!);
      setPhase('success');
    } catch (e: any) {
      setPaybillError(e.message ?? 'Something went wrong');
      setPaybillStep('receipt');
    }
  };

  const switchToPayBill = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    setError(null);
    setPhase('idle');
    setMethod('mpesa');
    setMpesaMode('paybill');
    openPayBill();
  };

  const handlePay = () => {
    if (method === 'mpesa' && mpesaMode === 'stk') payMpesaStk();
    else if (method === 'mpesa' && mpesaMode === 'paybill') openPayBill();
    else payPesapal();
  };

  // ── Success ─────────────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <View style={[styles.container, styles.centerFull]}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={40} color={palette.white} />
        </View>
        <ThemedText style={styles.successTitle}>
          {isBalanceMode ? 'Balance Paid!' : 'Booking Confirmed!'}
        </ThemedText>
        <ThemedText style={styles.successSub}>{title}</ThemedText>
        {confirmCode && (
          <View style={styles.receiptBox}>
            <ThemedText style={styles.receiptLabel}>Check-in code</ThemedText>
            <ThemedText style={styles.receiptCode}>{confirmCode}</ThemedText>
          </View>
        )}
        {isBalanceMode ? (
          <View style={styles.reminderBox}>
            <Ionicons name="checkmark-circle-outline" size={16} color={palette.success700} />
            <ThemedText style={[styles.reminderText, { color: palette.success700 }]}>
              You're fully paid — check in when you arrive.
            </ThemedText>
          </View>
        ) : remainderNum > 0 ? (
          <View style={styles.reminderBox}>
            <Ionicons name="information-circle-outline" size={16} color={palette.blue500} />
            <ThemedText style={styles.reminderText}>
              Pay KES {remainderNum.toLocaleString()} balance at the venue
            </ThemedText>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => {
            if (bookingType === 'community_event') {
              router.canGoBack() ? router.back() : router.replace('/(tabs)/communities' as any);
            } else {
              router.replace('/(tabs)/check-in' as any);
            }
          }}
        >
          <ThemedText style={styles.doneBtnText}>{isBalanceMode ? 'Go to Check In' : 'Done'}</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const isLoading = phase === 'submitting';
  const isWaiting = phase === 'waiting';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={26} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Checkout</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        {/* Booking summary card */}
        <View style={styles.summaryCard}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.summaryImage} contentFit="cover" />
          ) : (
            <View style={styles.summaryImageFallback}>
              <Ionicons name="calendar" size={28} color={palette.blue500} />
            </View>
          )}
          <View style={styles.summaryInfo}>
            <ThemedText style={styles.summaryTitle} numberOfLines={2}>{title}</ThemedText>
            {subtitle ? <ThemedText style={styles.summarySubtitle} numberOfLines={1}>{subtitle}</ThemedText> : null}
            {ptDate && ptTime ? (
              <View style={styles.summaryDateRow}>
                <Ionicons name="calendar-outline" size={12} color={palette.gray450} />
                <ThemedText style={styles.summaryDateText}>
                  {new Date(ptDate + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })} · {ptTime.slice(0, 5)}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        {/* Price breakdown */}
        <View style={styles.priceCard}>
          <ThemedText style={styles.priceCardTitle}>Order Summary</ThemedText>
          {isBalanceMode ? (
            <View style={styles.priceRow}>
              <ThemedText style={styles.priceTotalLabel}>Balance due</ThemedText>
              <ThemedText style={styles.priceTotalValue}>KES {totalNum.toLocaleString()}</ThemedText>
            </View>
          ) : remainderNum > 0 ? (
            <>
              {hasDiscount && (
                <>
                  <View style={styles.priceRow}>
                    <ThemedText style={styles.priceLabel}>Original price</ThemedText>
                    <ThemedText style={[styles.priceValue, { color: palette.gray300, textDecorationLine: 'line-through' }]}>
                      KES {totalNum.toLocaleString()}
                    </ThemedText>
                  </View>
                  <View style={styles.priceRow}>
                    <ThemedText style={[styles.priceLabel, { color: palette.success700 }]}>Platform discount</ThemedText>
                    <ThemedText style={[styles.priceValue, { color: palette.success700 }]}>-KES {discountNum.toLocaleString()}</ThemedText>
                  </View>
                </>
              )}
              <View style={styles.priceRow}>
                <ThemedText style={styles.priceLabel}>Deposit due now</ThemedText>
                <ThemedText style={styles.priceValue}>KES {depositNum.toLocaleString()}</ThemedText>
              </View>
              <View style={styles.priceRow}>
                <ThemedText style={styles.priceLabel}>Balance at venue</ThemedText>
                <ThemedText style={[styles.priceValue, { color: palette.gray300 }]}>KES {remainderNum.toLocaleString()}</ThemedText>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <ThemedText style={styles.priceTotalLabel}>Total</ThemedText>
                <ThemedText style={styles.priceTotalValue}>KES {(totalNum - discountNum).toLocaleString()}</ThemedText>
              </View>
            </>
          ) : (
            <View style={styles.priceRow}>
              <ThemedText style={styles.priceTotalLabel}>Total</ThemedText>
              <ThemedText style={styles.priceTotalValue}>KES {totalNum.toLocaleString()}</ThemedText>
            </View>
          )}
        </View>

        {/* Payment method selector */}
        {!isBalanceMode && (
          <>
            <ThemedText style={styles.sectionLabel}>Payment Method</ThemedText>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={[styles.radioRow, method === 'mpesa' && styles.radioRowActive]}
                onPress={() => setMethod('mpesa')}
                disabled={isLoading || isWaiting}
                activeOpacity={0.7}
              >
                <View style={[styles.radioOuter, method === 'mpesa' && styles.radioOuterActive]}>
                  {method === 'mpesa' && <View style={styles.radioInner} />}
                </View>
                <Ionicons name="phone-portrait-outline" size={18} color={method === 'mpesa' ? palette.ink900 : palette.gray450} />
                <View style={{ flex: 1, gap: 6 }}>
                  <ThemedText style={[styles.radioLabel, method === 'mpesa' && styles.radioLabelActive]}>M-Pesa</ThemedText>
                  {bookingType === 'community_event' ? (
                    <ThemedText style={styles.radioSub}>Instant STK push to your phone</ThemedText>
                  ) : method === 'mpesa' ? (
                    <View style={styles.mpesaModeToggle}>
                      <TouchableOpacity
                        style={[styles.mpesaModeBtn, mpesaMode === 'stk' && styles.mpesaModeBtnActive]}
                        onPress={() => setMpesaMode('stk')}
                        disabled={isLoading || isWaiting}
                      >
                        <ThemedText style={[styles.mpesaModeBtnText, mpesaMode === 'stk' && styles.mpesaModeBtnTextActive]}>
                          STK Push
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.mpesaModeBtn, mpesaMode === 'paybill' && styles.mpesaModeBtnActive]}
                        onPress={() => setMpesaMode('paybill')}
                        disabled={isLoading || isWaiting}
                      >
                        <ThemedText style={[styles.mpesaModeBtnText, mpesaMode === 'paybill' && styles.mpesaModeBtnTextActive]}>
                          PayBill
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <ThemedText style={styles.radioSub}>STK push or PayBill</ThemedText>
                  )}
                </View>
              </TouchableOpacity>

              {bookingType !== 'community_event' && (
                <TouchableOpacity
                  style={[styles.radioRow, method === 'pesapal' && styles.radioRowActive, { borderBottomWidth: 0 }]}
                  onPress={() => setMethod('pesapal')}
                  disabled={isLoading || isWaiting}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radioOuter, method === 'pesapal' && styles.radioOuterActive]}>
                    {method === 'pesapal' && <View style={styles.radioInner} />}
                  </View>
                  <Ionicons name="card-outline" size={18} color={method === 'pesapal' ? palette.ink900 : palette.gray450} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.radioLabel, method === 'pesapal' && styles.radioLabelActive]}>Card / Pesapal</ThemedText>
                    <ThemedText style={styles.radioSub}>Visa, Mastercard & more</ThemedText>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* Phone input — STK push or balance mode */}
        {((method === 'mpesa' && mpesaMode === 'stk') || isBalanceMode) && !isWaiting && (
          <View style={styles.phoneSection}>
            <ThemedText style={styles.phoneLabel}>M-Pesa phone number</ThemedText>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <ThemedText style={styles.phonePrefixText}>🇰🇪 +254</ThemedText>
              </View>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="7XX XXX XXX"
                placeholderTextColor={palette.gray300}
                keyboardType="phone-pad"
                editable={!isLoading}
              />
            </View>
          </View>
        )}

        {/* PayBill info card */}
        {method === 'mpesa' && mpesaMode === 'paybill' && !isBalanceMode && !isWaiting && (
          <View style={styles.paybillInfoCard}>
            <Ionicons name="information-circle-outline" size={18} color={palette.blue500} />
            <ThemedText style={styles.paybillInfoText}>
              You'll get step-by-step PayBill instructions on the next screen. Pay via Lipa Na M-Pesa, then enter your receipt to confirm.
            </ThemedText>
          </View>
        )}

        {/* Waiting state — STK push sent */}
        {isWaiting && method === 'mpesa' && (
          <>
            <View style={styles.waitingBox}>
              <ActivityIndicator size="small" color={palette.blue500} />
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText style={styles.waitingTitle}>Check your phone</ThemedText>
                <ThemedText style={styles.waitingText}>
                  An M-Pesa prompt has been sent to {phone}. Enter your PIN to confirm.
                </ThemedText>
              </View>
            </View>
            <TouchableOpacity style={styles.paybillFallbackLink} onPress={switchToPayBill}>
              <Ionicons name="phone-portrait-outline" size={14} color={palette.blue500} />
              <ThemedText style={styles.paybillFallbackLinkText}>Prompt not arriving? Pay via PayBill instead</ThemedText>
            </TouchableOpacity>
          </>
        )}

        {/* Waiting state — Pesapal */}
        {isWaiting && method === 'pesapal' && (
          <View style={styles.waitingBox}>
            <ActivityIndicator size="small" color={palette.blue500} />
            <ThemedText style={styles.waitingTitle}>Processing payment…</ThemedText>
          </View>
        )}

        {/* Error */}
        {error && (phase === 'failed' || phase === 'idle') && (
          <>
            {error === 'stk_timeout' ? (
              <View style={styles.errorBox}>
                <Ionicons name="time-outline" size={16} color={palette.danger500} />
                <ThemedText style={styles.errorText}>
                  The M-Pesa prompt timed out. Accept it within 30 seconds of tapping Pay.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={palette.danger500} />
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </View>
            )}
            {(method === 'mpesa' && mpesaMode === 'stk' || isBalanceMode) && phase === 'failed' && (
              <TouchableOpacity style={styles.paybillFallbackBtn} onPress={switchToPayBill}>
                <Ionicons name="phone-portrait-outline" size={16} color={palette.ink900} />
                <ThemedText style={styles.paybillFallbackBtnText}>Pay via M-Pesa PayBill instead</ThemedText>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Pay button */}
        {!isWaiting && (
          <TouchableOpacity
            style={[styles.payBtn, isLoading && styles.payBtnDisabled]}
            onPress={handlePay}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <ThemedText style={styles.payBtnText}>
                {isBalanceMode
                  ? `Pay KES ${totalNum.toLocaleString()} balance`
                  : method === 'mpesa' && mpesaMode === 'stk'
                  ? `Pay KES ${depositNum > 0 ? depositNum : totalNum} via M-Pesa`
                  : method === 'mpesa' && mpesaMode === 'paybill'
                  ? `Pay via M-Pesa PayBill`
                  : `Pay KES ${depositNum > 0 ? depositNum : totalNum} with Pesapal`}
              </ThemedText>
            )}
          </TouchableOpacity>
        )}

        <ThemedText style={styles.disclaimer}>
          By proceeding you agree to our Terms of Service. Bookings are subject to availability.
        </ThemedText>
      </ScrollView>

      <TourOverlay visible={tourVisible} steps={CHECKOUT_TOUR} onDismiss={dismissTour} />

      {/* PayBill bottom sheet */}
      <Modal visible={paybillVisible} transparent animationType="slide" onRequestClose={() => setPaybillVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPaybillVisible(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrapper}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>Pay via M-Pesa PayBill</ThemedText>
              <TouchableOpacity onPress={() => setPaybillVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={palette.ink900} />
              </TouchableOpacity>
            </View>

            {(paybillStep === 'instructions' || paybillStep === 'receipt') && (
              <>
                {paybillError && (
                  <View style={styles.sheetErrorBox}>
                    <Ionicons name="alert-circle-outline" size={15} color={palette.danger600} />
                    <ThemedText style={styles.sheetErrorText}>{paybillError}</ThemedText>
                  </View>
                )}

                {paybillCode && (
                  <>
                    <ThemedText style={styles.sheetInstruction}>
                      Open M-Pesa → <ThemedText style={{ fontWeight: '700' }}>Lipa na M-Pesa → Pay Bill</ThemedText>, then enter:
                    </ThemedText>
                    <View style={styles.sheetInfoBox}>
                      <TouchableOpacity style={styles.sheetInfoRow} onPress={() => copyToClipboard(PAYBILL_NUMBER, 'business')}>
                        <ThemedText style={styles.sheetInfoLabel}>Business No.</ThemedText>
                        <View style={styles.sheetInfoCopyRow}>
                          <ThemedText style={styles.sheetInfoValue}>{PAYBILL_NUMBER}</ThemedText>
                          <Ionicons
                            name={copiedField === 'business' ? 'checkmark' : 'copy-outline'}
                            size={15}
                            color={copiedField === 'business' ? palette.success700 : palette.blue500}
                          />
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.sheetInfoRow} onPress={() => copyToClipboard(paybillCode!, 'account')}>
                        <ThemedText style={styles.sheetInfoLabel}>Account No.</ThemedText>
                        <View style={styles.sheetInfoCopyRow}>
                          <ThemedText style={styles.sheetInfoValue}>{paybillCode}</ThemedText>
                          <Ionicons
                            name={copiedField === 'account' ? 'checkmark' : 'copy-outline'}
                            size={15}
                            color={copiedField === 'account' ? palette.success700 : palette.blue500}
                          />
                        </View>
                      </TouchableOpacity>
                      <View style={[styles.sheetInfoRow, { borderBottomWidth: 0 }]}>
                        <ThemedText style={styles.sheetInfoLabel}>Amount</ThemedText>
                        <ThemedText style={[styles.sheetInfoValue, { color: palette.ink900, fontWeight: '800' }]}>
                          KES {(isBalanceMode ? totalNum : depositNum > 0 ? depositNum : totalNum).toLocaleString()}
                        </ThemedText>
                      </View>
                    </View>
                  </>
                )}

                <ThemedText style={[styles.sheetInstruction, { marginTop: 16 }]}>
                  Your WhatsApp number for booking updates:
                </ThemedText>
                <TextInput
                  style={styles.sheetReceiptInput}
                  value={paybillPhone}
                  onChangeText={setPaybillPhone}
                  placeholder="e.g. 0712345678"
                  placeholderTextColor={palette.gray300}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />

                <ThemedText style={[styles.sheetInstruction, { marginTop: 12 }]}>
                  After paying, enter the M-Pesa confirmation code (e.g. QHK1KUZS2T):
                </ThemedText>
                <TextInput
                  style={styles.sheetReceiptInput}
                  value={paybillReceipt}
                  onChangeText={(t) => setPaybillReceipt(t.toUpperCase())}
                  placeholder="M-Pesa receipt code"
                  placeholderTextColor={palette.gray300}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  style={[styles.sheetConfirmBtn, !paybillReceipt.trim() && styles.payBtnDisabled]}
                  onPress={confirmPayBill}
                  disabled={!paybillReceipt.trim()}
                >
                  <ThemedText style={styles.sheetConfirmBtnText}>Confirm Payment</ThemedText>
                </TouchableOpacity>
              </>
            )}

            {paybillStep === 'confirming' && (
              <View style={styles.sheetConfirmingBox}>
                <ActivityIndicator size="large" color={palette.blue500} />
                <ThemedText style={styles.sheetConfirmingText}>Verifying payment…</ThemedText>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  content: { padding: 20, paddingBottom: 60 },
  centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: palette.ink900 },

  summaryCard: {
    flexDirection: 'row', gap: 14, backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: palette.hairline,
  },
  summaryImage: { width: 72, height: 72, borderRadius: radii.md },
  summaryImageFallback: {
    width: 72, height: 72, borderRadius: radii.md,
    backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center',
  },
  summaryInfo: { flex: 1, gap: 4, justifyContent: 'center' },
  summaryTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  summarySubtitle: { fontSize: fontSize.sm, color: palette.gray450 },
  summaryDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  summaryDateText: { fontSize: fontSize.xs, color: palette.gray450 },

  priceCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
    padding: 16, marginBottom: 24, borderWidth: 1, borderColor: palette.hairline,
    gap: 10,
  },
  priceCardTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 4 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: fontSize.sm, color: palette.gray450 },
  priceValue: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  priceDivider: { height: 1, backgroundColor: palette.hairline },
  priceTotalLabel: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  priceTotalValue: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },

  sectionLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: palette.gray450,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },

  radioGroup: {
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg,
    overflow: 'hidden', marginBottom: 20,
  },
  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  radioRowActive: { backgroundColor: palette.surfaceMuted },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: palette.ink900 },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.ink900 },
  radioLabel: { fontSize: fontSize.base, fontWeight: '600', color: palette.gray450 },
  radioLabelActive: { color: palette.ink900 },
  radioSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  phoneSection: { marginBottom: 20, gap: 8 },
  phoneLabel: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: palette.border,
    borderRadius: radii.lg, overflow: 'hidden',
  },
  phonePrefix: {
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: palette.hairline, borderRightWidth: 1, borderRightColor: palette.border,
  },
  phonePrefixText: { fontSize: fontSize.base, color: palette.ink700, fontWeight: '600' },
  phoneInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: fontSize.base, color: palette.ink900,
  },

  waitingBox: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: palette.blue50, borderRadius: radii.md, padding: 14, marginBottom: 20,
  },
  waitingTitle: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue600 },
  waitingText: { fontSize: fontSize.sm, color: palette.blue600, lineHeight: 20 },

  errorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: palette.danger50, borderRadius: radii.md, padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: fontSize.sm, color: palette.danger600 },

  payBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.lg,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },

  disclaimer: { fontSize: fontSize.xs, color: palette.gray300, textAlign: 'center', lineHeight: 16 },

  mpesaModeToggle: {
    flexDirection: 'row', gap: 6,
  },
  mpesaModeBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: radii.md, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.white,
  },
  mpesaModeBtnActive: {
    backgroundColor: palette.ink900, borderColor: palette.ink900,
  },
  mpesaModeBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450 },
  mpesaModeBtnTextActive: { color: palette.white },

  paybillFallbackLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', paddingVertical: 10, marginBottom: 8,
  },
  paybillFallbackLinkText: { fontSize: fontSize.sm, color: palette.blue500, textDecorationLine: 'underline' },
  paybillFallbackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: palette.ink900, borderRadius: radii.lg,
    paddingVertical: 13, marginBottom: 12,
  },
  paybillFallbackBtnText: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },

  paybillInfoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: palette.blue50, borderRadius: radii.md,
    padding: 12, marginBottom: 20,
  },
  paybillInfoText: { flex: 1, fontSize: fontSize.sm, color: palette.blue600, lineHeight: 20 },

  // PayBill sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: palette.hairline,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  sheetErrorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: palette.danger50, borderRadius: radii.md, padding: 10, marginBottom: 12,
  },
  sheetErrorText: { flex: 1, fontSize: fontSize.sm, color: palette.danger600 },
  sheetInstruction: { fontSize: fontSize.sm, color: palette.ink700, lineHeight: 20, marginBottom: 10 },
  sheetInfoBox: {
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg,
    overflow: 'hidden', marginBottom: 4,
  },
  sheetInfoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
    backgroundColor: palette.surfaceMuted,
  },
  sheetInfoLabel: { fontSize: fontSize.sm, color: palette.gray450 },
  sheetInfoCopyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetInfoValue: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, letterSpacing: 1 },
  sheetReceiptInput: {
    borderWidth: 1.5, borderColor: palette.border, borderRadius: radii.lg,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: fontSize.base, color: palette.ink900,
    marginBottom: 14, letterSpacing: 1.5,
  },
  sheetConfirmBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.lg,
    paddingVertical: 15, alignItems: 'center',
  },
  sheetConfirmBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
  sheetConfirmingBox: { alignItems: 'center', paddingVertical: 32, gap: 14 },
  sheetConfirmingText: { fontSize: fontSize.base, color: palette.gray450 },

  // Success
  successIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: palette.success700,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, marginBottom: 6 },
  successSub: { fontSize: fontSize.base, color: palette.gray450, marginBottom: 24, textAlign: 'center' },
  receiptBox: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
    padding: 16, alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: palette.hairline, width: '100%',
  },
  receiptLabel: { fontSize: fontSize.xs, color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptCode: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, marginTop: 4, letterSpacing: 4 },
  reminderBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: palette.blue50, borderRadius: radii.md, padding: 12, marginBottom: 24, width: '100%',
  },
  reminderText: { flex: 1, fontSize: fontSize.sm, color: palette.blue600 },
  doneBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.lg,
    paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center',
  },
  doneBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
});

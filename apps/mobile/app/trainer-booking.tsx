import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Dimensions,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';

// ─── Types ────────────────────────────────────────────────────────────────────

type Offering = {
  id: string;
  title: string;
  type: string;
  duration_minutes: number;
  price_kes: number | null;
  max_participants: number;
  description: string | null;
  location_details: string | null;
  meeting_link: string | null;
  cancellation_hours: number;
  service_zones: string[];
  slug: string | null;
};

type PT = {
  id: string;
  full_name: string;
  professional_name: string | null;
  training_locations: string[];
};

type Availability = { day_of_week: number; start_time: string; end_time: string };
type BlockedDate = { date: string };

// ─── Session type metadata ────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  '1-on-1':     { label: '1-on-1',     icon: 'person',          color: '#002fff' },
  'group':      { label: 'Group',      icon: 'people',          color: '#7c3aed' },
  'online':     { label: 'Online',     icon: 'videocam',        color: '#059669' },
  'outdoor':    { label: 'Outdoor',    icon: 'leaf',            color: '#d97706' },
  'home-visit': { label: 'Home Visit', icon: 'home',            color: '#db2777' },
  'drop-in':    { label: 'Drop-in',    icon: 'business',        color: '#0891b2' },
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - 48) / 7);
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTimeSlots(startTime: string, endTime: string, durationMin: number): string[] {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const slots: string[] = [];
  for (let m = startMins; m + durationMin <= endMins; m += durationMin) {
    slots.push(`${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`);
  }
  return slots;
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}


// ─── Component ────────────────────────────────────────────────────────────────

const TRAINER_TOUR: TourStep[] = [
  {
    icon: 'calendar-outline',
    title: 'Pick Your Date & Time',
    description: 'Choose a date that works for you, then select an available time slot. Your trainer\'s live availability updates in real time.',
  },
  {
    icon: 'location-outline',
    title: 'Choose Your Training Style',
    description: 'Select how you\'d like to train — at the gym, at your home, or virtually. Some trainers offer all three options.',
  },
  {
    icon: 'checkmark-circle-outline',
    title: 'Review & Confirm',
    description: 'Check your booking details and choose how to pay. Your trainer is notified the moment payment goes through.',
  },
];

export default function TrainerBookingScreen() {
  const router = useRouter();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('trainer-booking');
  const { offeringId, ptId, isProgramme, introPrice } = useLocalSearchParams<{
    offeringId: string; ptId: string; isProgramme?: string; introPrice?: string;
  }>();

  const [offering, setOffering] = useState<Offering | null>(null);
  const [pt, setPt] = useState<PT | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Step state
  // Steps: 1=date, 2=time, 3=location/address (conditional), last=payment, +1=confirm
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Calendar nav state
  const _today = new Date();
  const [calYear, setCalYear] = useState(_today.getFullYear());
  const [calMonth, setCalMonth] = useState(_today.getMonth());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [locationPref, setLocationPref] = useState('');
  const [clientAddress, setClientAddress] = useState('');


  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: off }, { data: ptData }, { data: offeringAvail }, { data: globalAvail }, { data: blocked }] = await Promise.all([
      supabase.from('pt_offerings')
        .select('id, title, type, duration_minutes, price_kes, max_participants, description, location_details, meeting_link, cancellation_hours, service_zones, slug')
        .eq('id', offeringId).single(),
      supabase.from('personal_trainers')
        .select('id, full_name, professional_name, training_locations').eq('id', ptId).single(),
      supabase.from('pt_availability')
        .select('day_of_week, start_time, end_time').eq('pt_id', ptId).eq('offering_id', offeringId),
      supabase.from('pt_availability')
        .select('day_of_week, start_time, end_time').eq('pt_id', ptId).is('offering_id', null),
      supabase.from('pt_blocked_dates').select('date').eq('pt_id', ptId),
    ]);
    if (off && isProgramme === 'true' && introPrice) {
      (off as any).price_kes = Number(introPrice);
    }
    if (off) setOffering(off as any);
    if (ptData) setPt(ptData as any);
    // Use offering-specific availability if set, otherwise fall back to PT-level
    const resolvedAvail = (offeringAvail && offeringAvail.length > 0) ? offeringAvail : (globalAvail ?? []);
    setAvailability(resolvedAvail as any);
    if (blocked) setBlockedDates(blocked as any);
    setLoading(false);
  }, [offeringId, ptId, isProgramme, introPrice]);

  useEffect(() => { void load(); }, [load]);

  const linkProgrammeIntro = useCallback(async (bookingId: string) => {

    if (isProgramme !== 'true') return;
    try {
      await fetch('https://activecitypass.com/api/pt-programme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_intro',
          intro_booking_id: bookingId,
          programme_id: offeringId,
        }),
      });
    } catch { /* best-effort */ }
  }, [isProgramme, offeringId]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const timeSlots = (() => {
    if (!selectedDate || !offering) return [];
    const d = new Date(selectedDate + 'T00:00:00');
    const jsDay = d.getDay();
    const ourDay = jsDay === 0 ? 6 : jsDay - 1;
    const slots: string[] = [];
    availability
      .filter(a => a.day_of_week === ourDay)
      .forEach(a => {
        generateTimeSlots(a.start_time, a.end_time, offering.duration_minutes).forEach(s => {
          if (!slots.includes(s)) slots.push(s);
        });
      });
    return slots.sort();
  })();

  // Step logic per session type
  // 1-on-1:    date → time → location-pick → payment   (4 steps)
  // home-visit: date → time → client-address → payment (4 steps)
  // others:    date → time → payment                   (3 steps)
  const primaryType = offering?.type?.split(',')[0] ?? '1-on-1';
  const typeMeta = offering ? (TYPE_META[primaryType] ?? { label: primaryType, icon: 'person', color: '#002fff' }) : null;
  const displayName = pt ? (pt.professional_name ?? pt.full_name) : '';
  const isFree = (offering?.price_kes ?? 0) === 0;

  const needsLocationPick = primaryType === '1-on-1';
  const needsAddressInput = primaryType === 'home-visit';
  const hasExtraStep = needsLocationPick || needsAddressInput;
  const totalSteps = hasExtraStep ? 4 : 3;
  const paymentStep = hasExtraStep ? 4 : 3;

  // ── Submission ──────────────────────────────────────────────────────────────

  // Only free sessions are handled inline; paid sessions go to checkout
  const handleSubmit = async () => {
    if (!offering || !pt || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const { data, error } = await supabase.from('pt_bookings').insert({
        pt_id: pt.id,
        user_id: user.id,
        offering_id: offering.id,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        location_type: locationPref || primaryType,
        location_address: needsAddressInput ? clientAddress : null,
        payment_method: 'free',
        amount_kes: 0,
        payment_status: 'paid',
        status: 'confirmed',
      }).select().single();
      if (error) throw error;
      await linkProgrammeIntro((data as any).id);
      setStep(99);
    } catch (e: any) {
      Alert.alert('Booking failed', e.message || 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceedToCheckout = () => {
    if (!offering || !pt || !selectedDate || !selectedTime) return;
    router.push({
      pathname: '/checkout',
      params: {
        bookingType: 'pt',
        itemId: offering.id,
        title: offering.title,
        subtitle: displayName,
        totalPrice: String(offering.price_kes ?? 0),
        depositAmount: String(offering.price_kes ?? 0),
        remainderAmount: '0',
        ptId: pt.id,
        ptDate: selectedDate,
        ptTime: selectedTime,
        locationType: locationPref || primaryType,
        clientAddress: needsAddressInput ? clientAddress : '',
      },
    } as any);
  };

  // ── Loading / guard ─────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={palette.blue500} /></View>;
  }
  if (!offering || !pt) return null;

  // ── Confirmation screen ─────────────────────────────────────────────────────

  if (step === 99) {
    const isOnline = primaryType === 'online';
    const isHomeVisit = primaryType === 'home-visit';
    const locationLine = offering.location_details || locationPref || null;
    const isIntro = isProgramme === 'true';
    return (
      <View style={styles.confirmContainer}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: isIntro ? '#4f46e5' : typeMeta!.color }]}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <ThemedText style={styles.confirmTitle}>
            {isIntro ? 'Intro Session Booked!' : 'Booking Confirmed!'}
          </ThemedText>
          <ThemedText style={styles.confirmSub}>
            {isIntro
              ? `Your intro session with ${displayName} is confirmed. Once the trainer marks it complete, you can join the full programme.`
              : `Your ${typeMeta!.label} session with ${displayName} is confirmed.`
            }
          </ThemedText>

          <View style={styles.confirmDetails}>
            <View style={[styles.typeBadge, { backgroundColor: typeMeta!.color + '15' }]}>
              <Ionicons name={typeMeta!.icon as any} size={14} color={typeMeta!.color} />
              <ThemedText style={[styles.typeBadgeText, { color: typeMeta!.color }]}>{typeMeta!.label} Session</ThemedText>
            </View>

            <ConfirmRow icon="calendar-outline" text={fmtDate(selectedDate!)} />
            <ConfirmRow icon="time-outline" text={`${fmtTime(selectedTime!)} · ${offering.duration_minutes} min`} />
            <ConfirmRow icon="person-outline" text={displayName} />

            {isOnline && <ConfirmRow icon="videocam-outline" text="Meeting link will be sent after PT confirms" />}
            {isHomeVisit && clientAddress ? <ConfirmRow icon="home-outline" text={clientAddress} /> : null}
            {locationLine && !isOnline ? <ConfirmRow icon="location-outline" text={locationLine} /> : null}
            {primaryType === 'group' ? <ConfirmRow icon="people-outline" text={`Group session · up to ${offering.max_participants} participants`} /> : null}

            <View style={styles.cancelNote}>
              <Ionicons name="information-circle-outline" size={14} color="#9ca3af" />
              <ThemedText style={styles.cancelNoteText}>
                Cancel up to {offering.cancellation_hours}h before for a full refund
              </ThemedText>
            </View>

            {isFree && <ConfirmRow icon="gift-outline" text="Free intro session — no payment charged" />}
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(tabs)')}>
            <ThemedText style={styles.doneBtnText}>Back to Home</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main booking flow ───────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => step === 1 ? router.back() : setStep(s => s - 1)}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.headerTitle}>{isProgramme === 'true' ? 'Book Intro Session' : 'Book Session'}</ThemedText>
          <ThemedText style={styles.headerSub}>{displayName} · {offering.title}</ThemedText>
        </View>
        {/* Session type pill */}
        {typeMeta && (
          <View style={[styles.headerTypePill, { backgroundColor: typeMeta.color + '15' }]}>
            <Ionicons name={typeMeta.icon as any} size={12} color={typeMeta.color} />
            <ThemedText style={[styles.headerTypeText, { color: typeMeta.color }]}>{typeMeta.label}</ThemedText>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View key={i} style={[styles.progressSeg, i < step && styles.progressSegActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Date ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <View>
            <ThemedText style={styles.stepTitle}>Choose a date</ThemedText>
            <ThemedText style={styles.stepSub}>Showing available days in the next 4 weeks</ThemedText>

            {/* Info banner for fixed-location types */}
            {offering.location_details && (
              <View style={styles.infoBanner}>
                <Ionicons name="location-outline" size={15} color="#374151" />
                <ThemedText style={styles.infoBannerText}>{offering.location_details}</ThemedText>
              </View>
            )}
            {primaryType === 'online' && (
              <View style={styles.infoBanner}>
                <Ionicons name="videocam-outline" size={15} color="#059669" />
                <ThemedText style={[styles.infoBannerText, { color: '#059669' }]}>
                  Virtual session — meeting link sent after confirmation
                </ThemedText>
              </View>
            )}
            {primaryType === 'group' && (
              <View style={styles.infoBanner}>
                <Ionicons name="people-outline" size={15} color="#7c3aed" />
                <ThemedText style={[styles.infoBannerText, { color: '#7c3aed' }]}>
                  Group session · up to {offering.max_participants} participants
                </ThemedText>
              </View>
            )}

            {(() => {
              const todayStr = new Date().toISOString().split('T')[0];
              const blockedSet = new Set(blockedDates.map(b => b.date));
              const availDays = new Set(availability.map(a => a.day_of_week));
              const firstDay = new Date(calYear, calMonth, 1).getDay();
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
              const offset = (firstDay + 6) % 7; // Mon-first offset
              const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
              while (cells.length % 7 !== 0) cells.push(null);
              const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
              const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
              // Disable prev if already at current month
              const nowDate = new Date();
              const canGoPrev = calYear > nowDate.getFullYear() || calMonth > nowDate.getMonth();
              return (
                <View style={styles.calendarWrapper}>
                  {/* Month nav */}
                  <View style={styles.calHeader}>
                    <TouchableOpacity onPress={prevMonth} disabled={!canGoPrev} style={styles.calNavBtn}>
                      <Ionicons name="chevron-back" size={20} color={canGoPrev ? '#000' : '#e5e7eb'} />
                    </TouchableOpacity>
                    <ThemedText style={styles.calMonthLabel}>{MONTH_NAMES[calMonth]} {calYear}</ThemedText>
                    <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
                      <Ionicons name="chevron-forward" size={20} color="#000" />
                    </TouchableOpacity>
                  </View>
                  {/* Day headers */}
                  <View style={styles.calWeekRow}>
                    {DAY_LABELS.map(d => (
                      <View key={d} style={styles.calDayHeader}>
                        <ThemedText style={styles.calDayHeaderText}>{d}</ThemedText>
                      </View>
                    ))}
                  </View>
                  {/* Date grid */}
                  <View style={styles.calGrid}>
                    {cells.map((day, idx) => {
                      if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isPast = dateStr < todayStr;
                      const jsDay = new Date(dateStr + 'T00:00:00').getDay();
                      const ptDow = jsDay === 0 ? 6 : jsDay - 1;
                      const isAvailable = availDays.has(ptDow) && !blockedSet.has(dateStr) && !isPast;
                      const isSelected = selectedDate === dateStr;
                      const isToday = dateStr === todayStr;
                      return (
                        <TouchableOpacity
                          key={dateStr}
                          style={[styles.calCell, isSelected && styles.calCellSelected, isToday && !isSelected && styles.calCellToday]}
                          onPress={() => isAvailable && (setSelectedDate(dateStr), setSelectedTime(null))}
                          activeOpacity={isAvailable ? 0.7 : 1}
                        >
                          <ThemedText style={[
                            styles.calDayText,
                            isSelected && styles.calDayTextSelected,
                            isToday && !isSelected && styles.calDayTextToday,
                            !isAvailable && styles.calDayTextDisabled,
                          ]}>
                            {day}
                          </ThemedText>
                          {isAvailable && !isSelected && <View style={styles.calDot} />}
                          {isAvailable && isSelected && <View style={styles.calDotSelected} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* No availability notice */}
                  {!cells.some((day) => {
                    if (!day) return false;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isPast = dateStr < todayStr;
                    const jsDay = new Date(dateStr + 'T00:00:00').getDay();
                    const ptDow = jsDay === 0 ? 6 : jsDay - 1;
                    return availDays.has(ptDow) && !blockedSet.has(dateStr) && !isPast;
                  }) && (
                    <View style={styles.noSlots}>
                      <ThemedText style={styles.noSlotsText}>No availability this month</ThemedText>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        )}

        {/* ── Step 2: Time ─────────────────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <ThemedText style={styles.stepTitle}>Choose a time</ThemedText>
            <ThemedText style={styles.stepSub}>{fmtDate(selectedDate!)} · {offering.duration_minutes} min session</ThemedText>
            {timeSlots.length === 0 ? (
              <View style={styles.noSlots}>
                <ThemedText style={styles.noSlotsText}>No time slots available for this day</ThemedText>
              </View>
            ) : (
              <View style={styles.timesGrid}>
                {timeSlots.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeChip, selectedTime === t && styles.timeChipActive]}
                    onPress={() => setSelectedTime(t)}
                  >
                    <ThemedText style={[styles.timeChipText, selectedTime === t && styles.timeChipTextActive]}>
                      {fmtTime(t)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Step 3 (1-on-1 only): Location preference ──────────────────── */}
        {step === 3 && needsLocationPick && (
          <View>
            <ThemedText style={styles.stepTitle}>Where will you train?</ThemedText>
            <ThemedText style={styles.stepSub}>Choose from {displayName}&apos;s available locations</ThemedText>
            {pt.training_locations.map(loc => (
              <TouchableOpacity
                key={loc}
                style={[styles.locationOption, locationPref === loc && styles.locationOptionActive]}
                onPress={() => setLocationPref(loc)}
              >
                <Ionicons
                  name={loc.toLowerCase().includes('home') ? 'home-outline' : loc.toLowerCase().includes('online') ? 'videocam-outline' : 'location-outline'}
                  size={20} color={locationPref === loc ? '#fff' : '#6b7280'}
                />
                <ThemedText style={[styles.locationOptionText, locationPref === loc && { color: '#fff' }]}>{loc}</ThemedText>
                {locationPref === loc && <Ionicons name="checkmark" size={18} color="#fff" style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Step 3 (home-visit only): Client address ───────────────────── */}
        {step === 3 && needsAddressInput && (
          <View>
            <ThemedText style={styles.stepTitle}>Your address</ThemedText>
            <ThemedText style={styles.stepSub}>
              {displayName} will travel to you.
              {offering.service_zones.length > 0
                ? ` Covered areas: ${offering.service_zones.join(', ')}.`
                : ''}
            </ThemedText>
            <TextInput
              style={styles.addressInput}
              placeholder="e.g. 14 Muthangari Drive, Westlands, Nairobi"
              placeholderTextColor="#9ca3af"
              value={clientAddress}
              onChangeText={setClientAddress}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <ThemedText style={styles.addressHint}>
              Include apartment/gate details to help the trainer find you.
            </ThemedText>
          </View>
        )}

        {/* ── Payment step ─────────────────────────────────────────────────── */}
        {step === paymentStep && (
          <View>
            <ThemedText style={styles.stepTitle}>Payment</ThemedText>

            {/* Summary card */}
            <View style={styles.summaryCard}>
              <ThemedText style={styles.summaryLabel}>Booking Summary</ThemedText>
              <SummaryRow label="Session" value={offering.title} />
              <SummaryRow label="Type" value={typeMeta!.label} />
              <SummaryRow label="Date" value={fmtDate(selectedDate!)} />
              <SummaryRow label="Time" value={`${fmtTime(selectedTime!)} · ${offering.duration_minutes} min`} />
              <SummaryRow label="With" value={displayName} />
              {locationPref ? <SummaryRow label="Location" value={locationPref} /> : null}
              {clientAddress ? <SummaryRow label="Address" value={clientAddress} /> : null}
              {offering.location_details ? <SummaryRow label="Venue" value={offering.location_details} /> : null}
              {primaryType === 'online' ? <SummaryRow label="Format" value="Virtual — link after confirmation" /> : null}
              {primaryType === 'group' ? <SummaryRow label="Format" value={`Group · up to ${offering.max_participants} pax`} /> : null}

              {/* Cancellation policy */}
              <View style={styles.cancelRow}>
                <Ionicons name="information-circle-outline" size={13} color="#9ca3af" />
                <ThemedText style={styles.cancelText}>
                  Free cancellation up to {offering.cancellation_hours}h before session
                </ThemedText>
              </View>
            </View>

            {/* Payment options */}
            {isFree ? (
              <View style={styles.freeBanner}>
                <Ionicons name="gift-outline" size={18} color="#15803d" />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.freeBannerTitle}>This intro session is free</ThemedText>
                  <ThemedText style={styles.freeBannerSub}>No payment required — tap confirm to book your slot.</ThemedText>
                </View>
              </View>
            ) : (
              <View style={styles.checkoutBanner}>
                <Ionicons name="card-outline" size={18} color={palette.blue500} />
                <ThemedText style={styles.checkoutBannerText}>
                  Pay KES {offering.price_kes?.toLocaleString()} via M-Pesa or card on the next screen.
                </ThemedText>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        {step < paymentStep ? (
          <TouchableOpacity
            style={[
              styles.nextBtn,
              ((step === 1 && !selectedDate) ||
               (step === 2 && !selectedTime) ||
               (step === 3 && needsLocationPick && !locationPref) ||
               (step === 3 && needsAddressInput && !clientAddress.trim())) && styles.nextBtnDisabled,
            ]}
            disabled={
              (step === 1 && !selectedDate) ||
              (step === 2 && !selectedTime) ||
              (step === 3 && needsLocationPick && !locationPref) ||
              (step === 3 && needsAddressInput && !clientAddress.trim())
            }
            onPress={() => setStep(s => s + 1)}
          >
            <ThemedText style={styles.nextBtnText}>Continue</ThemedText>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        ) : isFree ? (
          <TouchableOpacity
            style={[styles.nextBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.nextBtnText}>Confirm Booking</ThemedText>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextBtn} onPress={handleProceedToCheckout}>
            <ThemedText style={styles.nextBtnText}>Proceed to Checkout</ThemedText>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}
      </View>

      <TourOverlay visible={tourVisible} steps={TRAINER_TOUR} onDismiss={dismissTour} />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText style={styles.summaryRowLabel}>{label}</ThemedText>
      <ThemedText style={styles.summaryRowValue}>{value}</ThemedText>
    </View>
  );
}

function ConfirmRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.confirmRow}>
      <Ionicons name={icon} size={16} color="#6b7280" />
      <ThemedText style={styles.confirmRowText}>{text}</ThemedText>
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
  headerTypePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.md,
  },
  headerTypeText: { fontSize: fontSize.xs, fontWeight: '700' },

  progressBar: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, gap: 6 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: palette.border },
  progressSegActive: { backgroundColor: palette.ink900 },

  content: { padding: 24, paddingBottom: 120 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: palette.ink900, marginBottom: 6 },
  stepSub: { fontSize: fontSize.base, color: palette.gray300, marginBottom: 20 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#f9fafb', borderRadius: radii.md, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: palette.hairline,
  },
  infoBannerText: { fontSize: fontSize.sm, color: '#374151', flex: 1, lineHeight: 18 },

  noSlots: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  noSlotsText: { fontSize: fontSize.sm, color: palette.gray300, textAlign: 'center' },

  calendarWrapper: { paddingTop: 8 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calNavBtn: { padding: 8 },
  calMonthLabel: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader: { width: DAY_SIZE, alignItems: 'center', paddingVertical: 6 },
  calDayHeaderText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: DAY_SIZE, height: DAY_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: DAY_SIZE / 2 },
  calCellSelected: { backgroundColor: palette.ink900 },
  calCellToday: { backgroundColor: palette.blue50 },
  calDayText: { fontSize: fontSize.base, fontWeight: '500', color: palette.ink700 },
  calDayTextSelected: { color: palette.white, fontWeight: '700' },
  calDayTextToday: { color: palette.blue500, fontWeight: '700' },
  calDayTextDisabled: { color: '#d1d5db' },
  calDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.blue500, marginTop: 2 },
  calDotSelected: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.white, marginTop: 2 },

  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeChip: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: radii.md,
    borderWidth: 1.5, borderColor: palette.border,
  },
  timeChipActive: { borderColor: palette.ink900, backgroundColor: palette.ink900 },
  timeChipText: { fontSize: fontSize.base, fontWeight: '600', color: '#374151' },
  timeChipTextActive: { color: palette.white },

  locationOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: palette.border, marginBottom: 10,
  },
  locationOptionActive: { borderColor: palette.ink900, backgroundColor: palette.ink900 },
  locationOptionText: { fontSize: fontSize.base, fontWeight: '600', color: '#374151' },

  addressInput: {
    borderWidth: 1.5, borderColor: palette.border, borderRadius: 14,
    padding: 16, fontSize: fontSize.base, color: palette.ink900, minHeight: 100,
    backgroundColor: '#fafafa',
  },
  addressHint: { fontSize: 12, color: palette.gray300, marginTop: 8 },

  summaryCard: {
    backgroundColor: '#f9fafb', borderRadius: radii.lg, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: palette.hairline,
  },
  summaryLabel: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryRowLabel: { fontSize: fontSize.sm, color: palette.gray450 },
  summaryRowValue: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink900, flex: 1, textAlign: 'right' },
  cancelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  cancelText: { fontSize: 12, color: palette.gray300 },

  freeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: radii.md, padding: 14, marginBottom: 16,
  },
  freeBannerTitle: { fontSize: fontSize.base, fontWeight: '700', color: '#15803d', marginBottom: 2 },
  freeBannerSub: { fontSize: 12, color: '#166534', lineHeight: 16 },

  payLabel: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 12 },
  payOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: palette.border, marginBottom: 10,
  },
  payOptionActive: { borderColor: palette.ink900, backgroundColor: palette.ink900 },
  payOptionDisabled: { opacity: 0.4 },
  payOptionTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  payOptionSub: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  checkoutBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.blue50, borderRadius: radii.md, padding: 14, marginTop: 12,
  },
  checkoutBannerText: { flex: 1, fontSize: fontSize.sm, color: palette.blue600, lineHeight: 18 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 36, backgroundColor: palette.white,
    borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  nextBtn: {
    backgroundColor: palette.ink900, paddingVertical: 16, borderRadius: 30,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.3 },
  nextBtnText: { color: palette.white, fontSize: fontSize.lg, fontWeight: '700' },

  confirmContainer: { flex: 1, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', alignItems: 'center' },
  confirmIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  confirmTitle: { fontSize: 26, fontWeight: '800', color: palette.ink900, marginBottom: 10 },
  confirmSub: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  confirmDetails: {
    width: '100%', backgroundColor: '#f9fafb', borderRadius: radii.lg,
    padding: 18, gap: 12, marginBottom: 24,
  },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.md, marginBottom: 4,
  },
  typeBadgeText: { fontSize: fontSize.sm, fontWeight: '700' },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  confirmRowText: { fontSize: fontSize.base, color: '#374151', flex: 1 },
  cancelNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border,
  },
  cancelNoteText: { fontSize: 12, color: palette.gray300, flex: 1 },
  doneBtn: { backgroundColor: palette.ink900, paddingVertical: 16, paddingHorizontal: 48, borderRadius: 30 },
  doneBtnText: { color: palette.white, fontSize: fontSize.lg, fontWeight: '700' },
});

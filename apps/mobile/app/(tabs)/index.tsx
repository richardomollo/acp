import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  Dimensions, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { DateRail, buildDateRange } from '@/components/date-rail';
import { useTour } from '@/hooks/use-tour';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { type Recurrence } from '@/services/notifications';
import { computeStreak, type Stats } from '@/services/fitnessStats';

const { width } = Dimensions.get('window');
const RAIL_CARD_W = Math.round(width * 0.5);
const EDITORIAL_W = Math.round(width * 0.48);

interface Gym {
  id: string;
  name: string;
  location: string;
  image_url: string | null;
  description: string | null;
}

interface Session {
  id: string;
  name: string;
  instructor: string | null;
  description: string | null;
  date: string;
  time: string;
  drop_in_price?: number | null;
  image_url: string | null;
  gym_id: string;
  spots_left: number;
  category?: string | null;
  gyms?: { name: string; deposit_pct?: number | null };
}

interface UserProfile {
  name: string;
}

const MOODS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '🙁' },
  { value: 3, emoji: '😐' },
  { value: 4, emoji: '🙂' },
  { value: 5, emoji: '😄' },
] as const;

interface PTHome {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  specialisations: string[];
  years_of_experience: number | null;
  is_certified_verified: boolean;
  avg_rating: number | null;
  min_price: number | null;
}

interface ActiveBooking {
  id: string;
  session_id: string | null;
  booking_date: string;
  booking_time: string;
  sessions: { name: string; gyms: { name: string } | null } | null;
}

interface WorkoutSchedule {
  id: string;
  workout_id: string;
  start_date: string;
  time_of_day: string;
  recurrence: Recurrence;
  weekdays: number[];
  workouts: { title: string; category: string } | null;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'done';
  recurrence: Recurrence;
  weekdays: number[];
  last_completed_date: string | null;
}

interface Experience {
  id: string;
  name: string;
  tagline: string | null;
  date: string;
  start_time: string;
  price_kes: number;
  discount_kes: number;
  spots_left: number;
  max_capacity: number;
  image_url: string | null;
  category: string | null;
  gym_id: string;
  gyms?: { name: string } | null;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Eyebrow({ text, color = palette.gray300 }: { text: string; color?: string }) {
  return (
    <ThemedText style={[styles.eyebrow, { color }]}>{text}</ThemedText>
  );
}

function SectionHeader({
  eyebrow, title, onSeeAll,
}: { eyebrow: string; title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View>
        <Eyebrow text={eyebrow} />
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll}>
          <ThemedText style={styles.seeAllText}>See All</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CatTag({ icon, label }: { icon?: string; label: string }) {
  return (
    <View style={styles.catTag}>
      {icon && <Ionicons name={icon as any} size={11} color="#fff" />}
      <ThemedText style={styles.catTagText}>{label}</ThemedText>
    </View>
  );
}

function RatingPill({ value }: { value: number | null }) {
  if (value == null) {
    return <View style={styles.ratingPill}><ThemedText style={styles.ratingPillText}>New</ThemedText></View>;
  }
  return (
    <View style={styles.ratingPill}>
      <Ionicons name="star" size={11} color={palette.warning500} />
      <ThemedText style={styles.ratingPillText}>{value}</ThemedText>
    </View>
  );
}

// ─── Overlay card (Coming Up Soon + Experiences) ──────────────────────────────

interface OverlayCardProps {
  imageUrl: string | null;
  fallbackIcon?: string;
  catLabel: string;
  catIcon?: string;
  name: string;
  tagline?: string | null;
  metaIcon?: string;
  metaText?: string;
  dateBadge?: { mon: string; day: string | number } | null;
  scarcity?: string | null;
  priceLabel: ReactNode;
  priceSub: string;
  priceRemainder?: string | null;
  saveBadge?: string | null;
  onPress: () => void;
  width?: number;
  imageHeight?: number;
}

function OverlayCard({
  imageUrl, fallbackIcon = 'fitness', catLabel, catIcon,
  name, tagline, metaIcon, metaText,
  dateBadge, scarcity,
  priceLabel, priceSub, priceRemainder, saveBadge,
  onPress,
  width: cardW = RAIL_CARD_W,
  imageHeight = Math.round(cardW * 0.62),
}: OverlayCardProps) {
  return (
    <TouchableOpacity
      style={[styles.overlayCard, { width: cardW }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={{ position: 'relative', height: imageHeight }}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.overlayCardFallback, { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <Ionicons name={fallbackIcon as any} size={40} color="rgba(255,255,255,0.5)" />
          </View>
        )}

        {/* Top row: cat tag + date/scarcity badge */}
        <View style={styles.overlayTopRow}>
          <CatTag icon={catIcon} label={catLabel} />
          {dateBadge ? (
            <View style={styles.overlayDateBadge}>
              <ThemedText style={styles.overlayDateMon}>{dateBadge.mon}</ThemedText>
              <ThemedText style={styles.overlayDateDay}>{dateBadge.day}</ThemedText>
            </View>
          ) : scarcity ? (
            <View style={styles.scarcityBadge}>
              <Ionicons name="flame" size={11} color={palette.danger500} />
              <ThemedText style={styles.scarcityText}>{scarcity}</ThemedText>
            </View>
          ) : null}
        </View>

        {saveBadge ? (
          <View style={styles.overlaySaveBadgeAbs}>
            <ThemedText style={styles.overlaySaveBadgeText}>{saveBadge}</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.stackedBody}>
        <ThemedText style={styles.stackedName} numberOfLines={1}>{name}</ThemedText>
        {tagline ? <ThemedText style={styles.stackedTagline} numberOfLines={1}>{tagline}</ThemedText> : null}
        {metaIcon && metaText ? (
          <View style={styles.stackedMetaRow}>
            <View style={styles.stackedMetaItem}>
              <Ionicons name={metaIcon as any} size={12} color={palette.gray300} />
              <ThemedText style={styles.stackedMetaText} numberOfLines={1}>{metaText}</ThemedText>
            </View>
          </View>
        ) : null}
        <View style={styles.stackedFooter}>
          <View>
            <ThemedText style={styles.stackedPrice}>{priceLabel}</ThemedText>
            {priceSub ? <ThemedText style={styles.stackedAside}>{priceSub}</ThemedText> : null}
            {priceRemainder ? <ThemedText style={styles.stackedAside}>{priceRemainder}</ThemedText> : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Stacked card (Venues + Trainers) ────────────────────────────────────────

interface StackedCardProps {
  imageUrl: string | null;
  fallbackIcon?: string;
  fallbackBg?: string;
  catLabel: string;
  catIcon?: string;
  rating?: number | null;
  verifiedBadge?: boolean;
  name: string;
  tagline?: string | null;
  meta1?: string | null;
  meta2?: string | null;
  priceLabel: string;
  aside?: string | null;
  onPress: () => void;
  width?: number;
  imageHeight?: number;
}

function StackedCard({
  imageUrl, fallbackIcon = 'fitness', fallbackBg = palette.blue500,
  catLabel, catIcon, rating, verifiedBadge = false,
  name, tagline, meta1, meta2,
  priceLabel, aside,
  onPress,
  width: cardW = RAIL_CARD_W,
  imageHeight = Math.round(cardW * 0.62),
}: StackedCardProps) {
  return (
    <TouchableOpacity
      style={[styles.stackedCard, { width: cardW }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={{ position: 'relative', height: imageHeight }}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl.split(',')[0] }} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name={fallbackIcon as any} size={40} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        <View style={styles.stackedTopRow}>
          <CatTag icon={catIcon} label={catLabel} />
          <RatingPill value={rating ?? null} />
        </View>
        {verifiedBadge && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={palette.blue500} />
            <ThemedText style={styles.verifiedText}>Verified Pro</ThemedText>
          </View>
        )}
      </View>
      <View style={styles.stackedBody}>
        <ThemedText style={styles.stackedName} numberOfLines={1}>{name}</ThemedText>
        {tagline ? <ThemedText style={styles.stackedTagline} numberOfLines={1}>{tagline}</ThemedText> : null}
        {(meta1 || meta2) ? (
          <View style={styles.stackedMetaRow}>
            {meta1 ? (
              <View style={styles.stackedMetaItem}>
                <Ionicons name="location-outline" size={12} color={palette.gray300} />
                <ThemedText style={styles.stackedMetaText} numberOfLines={1}>{meta1}</ThemedText>
              </View>
            ) : null}
            {meta2 ? (
              <View style={styles.stackedMetaItem}>
                <Ionicons name="barbell-outline" size={12} color={palette.gray300} />
                <ThemedText style={styles.stackedMetaText} numberOfLines={1}>{meta2}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.stackedFooter}>
          <ThemedText style={styles.stackedPrice}>{priceLabel}</ThemedText>
          {aside ? <ThemedText style={styles.stackedAside}>{aside}</ThemedText> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Editorial card (Something for everyone) ──────────────────────────────────

function EditorialCard({ image, title, eyebrow, desc }: {
  image: any; title: string; eyebrow: string; desc: string;
}) {
  return (
    <View style={styles.editorialCard}>
      <ExpoImage source={image} style={[StyleSheet.absoluteFill, { borderRadius: radii.xl }]} contentFit="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        style={[StyleSheet.absoluteFill, { top: '40%' }]}
      />
      <View style={styles.editorialContent}>
        <ThemedText style={styles.editorialEyebrow}>{eyebrow}</ThemedText>
        <ThemedText style={styles.editorialTitle}>{title}</ThemedText>
        <ThemedText style={styles.editorialDesc}>{desc}</ThemedText>
      </View>
    </View>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

const HOW_STEPS = [
  { icon: 'search-outline' as const, num: '01', title: 'Discover', desc: 'Browse 50+ Nairobi venues, classes and trainers in one place.' },
  { icon: 'calendar-outline' as const, num: '02', title: 'Book', desc: 'Reserve with a small deposit — pay the balance at the venue.' },
  { icon: 'scan-outline' as const, num: '03', title: 'Show up', desc: 'Scan to check in. One pass works everywhere you move.' },
  { icon: 'barbell-outline' as const, num: '04', title: 'Train anytime', desc: 'Free workouts in the Fitness Hub — build your own, schedule reminders, and track your streaks.' },
];

function HowItWorks() {
  return (
    <View style={styles.howPanel}>
      <ThemedText style={styles.howEyebrow}>How it works</ThemedText>
      <ThemedText style={styles.howHeadline}>Pick a class, tap book, show up</ThemedText>
      <View style={{ marginTop: 22 }}>
        {HOW_STEPS.map((step, i) => (
          <View key={i} style={[styles.howStep, i < HOW_STEPS.length - 1 && { paddingBottom: 20 }]}>
            <View style={styles.howStepLeft}>
              <View style={styles.howStepCircle}>
                <Ionicons name={step.icon} size={20} color="#fff" />
              </View>
              {i < HOW_STEPS.length - 1 && <View style={styles.howConnector} />}
            </View>
            <View style={styles.howStepBody}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemedText style={styles.howStepNum}>{step.num}</ThemedText>
                <ThemedText style={styles.howStepTitle}>{step.title}</ThemedText>
              </View>
              <ThemedText style={styles.howStepDesc}>{step.desc}</ThemedText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Guest Hero ───────────────────────────────────────────────────────────────

function GuestHero({ onSearch }: { onSearch: () => void }) {
  return (
    <View style={styles.guestHero}>
      <ThemedText style={styles.guestHeadline}>
        Active City Pass — Get active, wherever you want.
      </ThemedText>
      <ThemedText style={styles.guestSub}>
        Access to gyms, studios, wellness experiences, kids activities, coaches and trainers across Nairobi — all in one app.
      </ThemedText>
      <TouchableOpacity style={styles.guestSearchBtn} onPress={onSearch} activeOpacity={0.8}>
        <Ionicons name="search" size={16} color={palette.gray300} />
        <ThemedText style={styles.guestSearchPlaceholder}>Search classes, gyms, trainers...</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

// ─── Editorial data ───────────────────────────────────────────────────────────

const FOR_EVERYONE = [
  { image: require('@/assets/images/ref.jpeg'), eyebrow: 'Early risers', title: 'Morning movers', desc: 'Sunrise classes before the city wakes.' },
  { image: require('@/assets/images/plts.webp'), eyebrow: 'Wind down', title: 'Restore & recover', desc: 'Yoga, spa and mobility sessions.' },
  { image: require('@/assets/images/yoga.jpg'), eyebrow: 'Bring a friend', title: 'Train together', desc: 'Group classes with room for two.' },
];

// ─── Tour ─────────────────────────────────────────────────────────────────────

const HOME_TOUR: TourStep[] = [
  { icon: 'hand-left-outline', title: 'Welcome to Active CityPass', description: "Your all-in-one pass to gyms, classes, trainers, and experiences across Nairobi. Let's take a quick look around." },
  { icon: 'calendar-outline', title: 'Book Classes Instantly', description: 'Coming Up Soon shows fitness classes in the next few days. Tap any card to see details and reserve your spot with a deposit.' },
  { icon: 'location-outline', title: 'Explore Partner Venues', description: 'Browse top gyms and studios near you. Each venue has its own schedule — find the one that fits your lifestyle.' },
  { icon: 'sparkles-outline', title: 'Experiences & Personal Training', description: 'Go beyond the gym — book a hike, a wellness retreat, or train 1-on-1 with a certified PT. Scroll down to discover everything on offer.' },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { showAuthModal } = useAuthModal();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('home');
  const [isGuest, setIsGuest] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [todayMood, setTodayMood] = useState<number | null>(null);
  const [savingMood, setSavingMood] = useState(false);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [nearTermSessions, setNearTermSessions] = useState<Session[]>([]);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [workoutSchedules, setWorkoutSchedules] = useState<WorkoutSchedule[]>([]);
  const [completedWorkoutKeys, setCompletedWorkoutKeys] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [fitnessStats, setFitnessStats] = useState<Stats>({ totalWorkouts: 0, totalMinutes: 0, streakDays: 0, longestStreak: 0 });
  const [trainers, setTrainers] = useState<PTHome[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [calSelected, setCalSelected] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    sessions: Session[];
    gyms: Gym[];
    experiences: Experience[];
    trainers: { id: string; full_name: string; professional_name: string | null; photo_url: string | null; specialisations: string[] }[];
  }>({ sessions: [], gyms: [], experiences: [], trainers: [] });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const next14Days = useMemo(() => buildDateRange(14), []);

  const sessionDates = useMemo(() => new Set(nearTermSessions.map(s => s.date)), [nearTermSessions]);

  const exactDaySessions = useMemo(
    () => nearTermSessions.filter(s => s.date === calSelected),
    [nearTermSessions, calSelected],
  );

  // nearTermSessions is pre-sorted by date, so the first match after calSelected is the soonest;
  // fall back to the very first upcoming session if none fall after the selected day.
  const nextAvailableSessionDate = useMemo(() => {
    if (exactDaySessions.length > 0) return null;
    return nearTermSessions.find(s => s.date > calSelected)?.date ?? nearTermSessions[0]?.date ?? null;
  }, [nearTermSessions, exactDaySessions, calSelected]);

  const visibleSessions = useMemo(() => {
    if (exactDaySessions.length > 0) return exactDaySessions;
    if (nextAvailableSessionDate) return nearTermSessions.filter(s => s.date === nextAvailableSessionDate);
    return [];
  }, [exactDaySessions, nextAvailableSessionDate, nearTermSessions]);

  const isTaskDoneOnSelectedDate = (task: TaskRow): boolean =>
    task.recurrence === 'once' ? task.status === 'done' : task.last_completed_date === calSelected;

  const scheduleMatchesDate = (schedule: WorkoutSchedule, dateStr: string): boolean => {
    if (schedule.recurrence === 'once') return schedule.start_date === dateStr;
    if (dateStr < schedule.start_date) return false;
    if (schedule.recurrence === 'daily') return true;
    return schedule.weekdays.includes(new Date(dateStr + 'T00:00:00').getDay());
  };

  const taskMatchesDate = (task: TaskRow, dateStr: string): boolean => {
    if (task.recurrence === 'once') return task.due_date === dateStr;
    const anchor = task.due_date ?? dateStr;
    if (dateStr < anchor) return false;
    if (task.recurrence === 'daily') return true;
    return task.weekdays.includes(new Date(dateStr + 'T00:00:00').getDay());
  };

  const scheduledWorkoutsForDay = useMemo(
    () => workoutSchedules.filter(s => scheduleMatchesDate(s, calSelected)),
    [workoutSchedules, calSelected],
  );
  const scheduledTasksForDay = useMemo(
    () => tasks.filter(t => taskMatchesDate(t, calSelected)),
    [tasks, calSelected],
  );

  // Once a scheduled workout has a completed session logged for this date, or
  // a task is marked done for this date, it drops off the day's list entirely
  // rather than lingering (struck-through or otherwise) — completed items
  // shouldn't compete for attention with what's still outstanding.
  const dayWorkouts = useMemo(
    () => scheduledWorkoutsForDay.filter(s => !completedWorkoutKeys.has(`${s.workout_id}|${calSelected}`)),
    [scheduledWorkoutsForDay, completedWorkoutKeys, calSelected],
  );
  const dayTasks = useMemo(
    () => scheduledTasksForDay.filter(t => !isTaskDoneOnSelectedDate(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduledTasksForDay, calSelected],
  );

  const allDoneForDay = (scheduledWorkoutsForDay.length > 0 || scheduledTasksForDay.length > 0)
    && dayWorkouts.length === 0 && dayTasks.length === 0;

  const isSelectedDateToday = calSelected === new Date().toISOString().split('T')[0];

  const toggleDayTask = async (task: TaskRow) => {
    if (!isSelectedDateToday) return;
    const doneNow = isTaskDoneOnSelectedDate(task);

    if (task.recurrence === 'once') {
      const nextStatus = doneNow ? 'pending' : 'done';
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
      const { error } = await supabase.from('client_tasks').update({ status: nextStatus }).eq('id', task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    } else {
      const nextDate = doneNow ? null : calSelected;
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: nextDate } : t));
      const { error } = await supabase.from('client_tasks').update({ last_completed_date: nextDate }).eq('id', task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: task.last_completed_date } : t));
    }
  };

  const bookingAt = useMemo(
    () => activeBooking ? new Date(`${activeBooking.booking_date}T${activeBooking.booking_time}`) : null,
    [activeBooking],
  );

  type NextUpItem =
    | { kind: 'booking'; key: string; at: Date; booking: ActiveBooking }
    | { kind: 'workout'; key: string; at: Date; schedule: WorkoutSchedule };

  const nextUpItems = useMemo(() => {
    const items: NextUpItem[] = [];
    if (activeBooking && bookingAt && bookingAt.getTime() > Date.now()) {
      items.push({ kind: 'booking', key: `booking-${activeBooking.id}`, at: bookingAt, booking: activeBooking });
    }
    return items.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [activeBooking, bookingAt]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleMoodTap = async (mood: number) => {
    if (!userId || savingMood) return;
    setSavingMood(true);
    const prevMood = todayMood;
    setTodayMood(mood);
    const { error } = await supabase.from('daily_checkins').upsert(
      { user_id: userId, mood, checkin_date: new Date().toISOString().split('T')[0] },
      { onConflict: 'user_id,checkin_date' },
    );
    if (error) setTodayMood(prevMood);
    setSavingMood(false);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { loadData(); });
    return () => subscription.unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const authSession = await authService.getSession();

      if (authSession?.user) {
        setIsGuest(false);
        setUserId(authSession.user.id);
        const { data: userData } = await supabase
          .from('users')
          .select('name')
          .eq('id', authSession.user.id)
          .maybeSingle();

        setUser({
          name: userData?.name || authSession.user.user_metadata?.full_name || authSession.user.email?.split('@')[0] || 'there',
        });

        const today = new Date().toISOString().split('T')[0];

        const { data: checkinData } = await supabase
          .from('daily_checkins')
          .select('mood')
          .eq('user_id', authSession.user.id)
          .eq('checkin_date', today)
          .maybeSingle();
        setTodayMood(checkinData?.mood ?? null);
        const nowTime = new Date().toTimeString().slice(0, 8);
        const { data: bookingData } = await supabase
          .from('bookings')
          .select(`id, booking_date, booking_time, sessions(name, gyms(name))`)
          .eq('user_id', authSession.user.id)
          .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
          .or(`booking_date.gt.${today},and(booking_date.eq.${today},booking_time.gte.${nowTime})`)
          .order('booking_date', { ascending: true })
          .order('booking_time', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (bookingData) setActiveBooking(bookingData as any);

        const { data: scheduleData } = await supabase
          .from('workout_schedules')
          .select('id, workout_id, start_date, time_of_day, recurrence, weekdays, workouts(title, category)')
          .eq('user_id', authSession.user.id)
          .eq('is_active', true);

        setWorkoutSchedules((scheduleData as any) ?? []);

        const { data: taskData } = await supabase
          .from('client_tasks')
          .select('id, title, due_date, status, recurrence, weekdays, last_completed_date')
          .eq('client_user_id', authSession.user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        setTasks((taskData as TaskRow[]) ?? []);

        const { data: historyData } = await supabase
          .from('workout_history')
          .select('workout_id, completed_at, duration_minutes')
          .eq('user_id', authSession.user.id)
          .order('completed_at', { ascending: false })
          .limit(100);

        const rows = (historyData as { workout_id: string; completed_at: string; duration_minutes: number | null }[]) ?? [];
        const { current, longest } = computeStreak(rows);
        setFitnessStats({
          totalWorkouts: rows.length,
          totalMinutes: rows.reduce((a, r) => a + (r.duration_minutes ?? 0), 0),
          streakDays: current,
          longestStreak: longest,
        });
        setCompletedWorkoutKeys(new Set(rows.map(r => `${r.workout_id}|${r.completed_at.slice(0, 10)}`)));
      } else {
        setIsGuest(true);
        setUser(null);
        setUserId(null);
        setTodayMood(null);
        setActiveBooking(null);
        setWorkoutSchedules([]);
        setCompletedWorkoutKeys(new Set());
        setTasks([]);
        setFitnessStats({ totalWorkouts: 0, totalMinutes: 0, streakDays: 0, longestStreak: 0 });
      }

      const { data: gymsData } = await supabase
        .from('gyms')
        .select('id, name, location, image_url, description')
        .eq('is_active', true)
        .limit(6);
      if (gymsData) setGyms(gymsData);

      const todayStr = new Date().toISOString().split('T')[0];
      const fourteenDaysLater = new Date();
      fourteenDaysLater.setDate(fourteenDaysLater.getDate() + 13);

      const { data: nearTermData } = await supabase
        .from('sessions')
        .select('id, name, instructor, description, date, time, drop_in_price, image_url, gym_id, spots_left, category, gyms(name, deposit_pct)')
        .gte('date', todayStr)
        .lte('date', fourteenDaysLater.toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(60);
      if (nearTermData) setNearTermSessions(nearTermData as any);

      const { data: ptData } = await supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, photo_url, specialisations, years_of_experience, is_certified_verified')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(8);

      if (ptData?.length) {
        const ptIds = ptData.map((p: any) => p.id);
        const [{ data: ptPrices }, { data: ptReviews }] = await Promise.all([
          supabase.from('pt_offerings').select('pt_id, price_kes').in('pt_id', ptIds).eq('is_active', true).eq('is_draft', false),
          supabase.from('pt_reviews').select('pt_id, rating').in('pt_id', ptIds),
        ]);
        setTrainers(ptData.map((pt: any) => {
          const offers = ptPrices?.filter((o: any) => o.pt_id === pt.id) ?? [];
          const reviews = ptReviews?.filter((r: any) => r.pt_id === pt.id) ?? [];
          const prices = offers.map((o: any) => o.price_kes).filter(Boolean) as number[];
          const avg = reviews.length ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : null;
          return {
            ...pt,
            min_price: prices.length ? Math.min(...prices) : null,
            avg_rating: avg ? Math.round(avg * 10) / 10 : null,
          };
        }));
      }

      const { data: expData } = await supabase
        .from('experiences')
        .select('id, name, tagline, date, start_time, price_kes, discount_kes, spots_left, max_capacity, image_url, category, gym_id, gyms(name)')
        .eq('is_active', true)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(6);
      if (expData) setExperiences(expData as any);

    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeString: string) => {
    try {
      const [h, m] = timeString.split(':');
      const hour = parseInt(h, 10);
      return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    } catch { return timeString; }
  };

  const formatNextUpWhen = (d: Date) => {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
    return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} · ${time}`;
  };

  const sessionDeposit = (session: Session) => {
    const total = Number(session.drop_in_price) || 0;
    const pct = session.gyms?.deposit_pct ?? 30;
    const deposit = Math.round(total * pct / 100);
    const remainder = total - deposit;
    return { deposit, remainder };
  };

  const runSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults({ sessions: [], gyms: [], experiences: [], trainers: [] });
      return;
    }
    setSearchLoading(true);
    try {
      const term = `%${q.trim()}%`;
      const [sessRes, gymRes, expRes, ptRes] = await Promise.all([
        supabase.from('sessions').select('id, name, instructor, date, time, drop_in_price, image_url, gym_id, spots_left, category, gyms(name, deposit_pct)').ilike('name', term).limit(5),
        supabase.from('gyms').select('id, name, location, image_url, description').ilike('name', term).limit(4),
        supabase.from('experiences').select('id, name, tagline, date, start_time, price_kes, discount_kes, spots_left, max_capacity, image_url, category, gym_id, gyms(name)').ilike('name', term).limit(4),
        supabase.from('personal_trainers').select('id, full_name, professional_name, photo_url, specialisations').ilike('full_name', term).eq('status', 'approved').limit(4),
      ]);
      setSearchResults({
        sessions: (sessRes.data ?? []) as any,
        gyms: gymRes.data ?? [],
        experiences: (expRes.data ?? []) as any,
        trainers: (ptRes.data ?? []) as any,
      });
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 350);
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchResults({ sessions: [], gyms: [], experiences: [], trainers: [] });
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ─── Header greeting / guest hero ─── */}
        {isGuest ? (
          <GuestHero onSearch={() => setSearchVisible(true)} />
        ) : (
          <View style={styles.header}>
            <View>
              <ThemedText style={styles.headerGreeting}>{getGreeting()}</ThemedText>
              <ThemedText style={styles.headerName}>{user?.name?.split(' ')[0] || 'there'}</ThemedText>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.journeyChip}
                onPress={() => router.push('/fitness-journey')}
                activeOpacity={0.8}
              >
                <Ionicons name="trophy-outline" size={14} color={palette.blue500} />
                <ThemedText style={styles.journeyChipText}>My Journey</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── How are you feeling: full-width check-in CTA (hidden once logged today) ─── */}
        {!isGuest && todayMood === null && (
          <View style={styles.moodCtaCard}>
            <ThemedText style={styles.moodCtaTitle}>How are you feeling today?</ThemedText>
            <View style={styles.moodCtaRow}>
              {MOODS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={styles.moodCtaBtn}
                  onPress={() => handleMoodTap(m.value)}
                  disabled={savingMood}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.moodCtaEmoji}>{m.emoji}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ─── Next up: booking + scheduled workout, compact ─── */}
        {!isGuest && nextUpItems.length > 0 && (
          <View style={styles.nextUpCard}>
            <ThemedText style={styles.nextUpHeader}>Next Up</ThemedText>
            {nextUpItems.map((item, i) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.nextUpRow, i < nextUpItems.length - 1 && styles.nextUpRowDivider]}
                onPress={() => item.kind === 'booking'
                  ? router.push({ pathname: '/(tabs)/check-in', params: { sessionId: item.booking.session_id ?? '' } } as any)
                  : router.push({ pathname: '/workout-detail', params: { workoutId: item.schedule.workout_id } } as any)
                }
                activeOpacity={0.7}
              >
                <View style={styles.nextUpRowIcon}>
                  <Ionicons
                    name={item.kind === 'booking' ? 'qr-code-outline' : 'barbell-outline'}
                    size={15} color={palette.blue500}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.nextUpRowTitle} numberOfLines={1}>
                    {item.kind === 'booking' ? item.booking.sessions?.name : (item.schedule.workouts?.title ?? 'Workout')}
                  </ThemedText>
                  <ThemedText style={styles.nextUpRowMeta} numberOfLines={1}>
                    {item.kind === 'booking'
                      ? `${item.booking.sessions?.gyms?.name ?? ''} · ${formatTime(item.booking.booking_time)}`
                      : formatNextUpWhen(item.at)}
                  </ThemedText>
                </View>
                <View style={[styles.nextUpBadge, item.kind === 'booking' ? styles.nextUpBadgeClass : styles.nextUpBadgeWorkout]}>
                  <ThemedText style={[styles.nextUpBadgeText, item.kind === 'booking' ? styles.nextUpBadgeTextClass : styles.nextUpBadgeTextWorkout]}>
                    {item.kind === 'booking' ? 'Class' : 'Workout'}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={14} color={palette.gray300} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ─── Date strip: next 14 days ─── */}
        <DateRail
          days={next14Days}
          selected={calSelected}
          sessionDates={sessionDates}
          onSelect={setCalSelected}
        />

        {/* ─── Your Exercises & Tasks (filtered by date strip above) ─── */}
        {!isGuest && (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              <SectionHeader eyebrow="For this day" title="Your Exercises & Tasks" />
            </View>
            {dayWorkouts.length === 0 && dayTasks.length === 0 ? (
              <View style={styles.noSessionsRow}>
                <Ionicons
                  name={allDoneForDay ? 'checkmark-circle' : 'calendar-outline'}
                  size={16}
                  color={allDoneForDay ? palette.success700 : palette.gray300}
                />
                <ThemedText style={styles.noSessionsText}>
                  {allDoneForDay ? 'All done for this day 🎉' : 'Nothing scheduled for this day'}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.dayItemsList}>
                {dayWorkouts.map(schedule => (
                  <TouchableOpacity
                    key={`w-${schedule.id}`}
                    style={styles.dayItemRow}
                    onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: schedule.workout_id } } as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dayItemIcon}>
                      <Ionicons name="barbell-outline" size={16} color={palette.blue500} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.dayItemTitle} numberOfLines={1}>
                        {schedule.workouts?.title ?? 'Workout'}
                      </ThemedText>
                      <ThemedText style={styles.dayItemMeta}>{schedule.time_of_day.slice(0, 5)}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
                {dayTasks.map(task => {
                  const done = isTaskDoneOnSelectedDate(task);
                  return (
                    <TouchableOpacity
                      key={`t-${task.id}`}
                      style={styles.dayItemRow}
                      onPress={() => toggleDayTask(task)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.dayItemIcon, { backgroundColor: palette.surfaceMuted }]}>
                        <Ionicons
                          name={done ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16} color={done ? palette.blue500 : palette.gray300}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText
                          style={[styles.dayItemTitle, done && styles.dayItemTitleDone]}
                          numberOfLines={1}
                        >
                          {task.title}
                        </ThemedText>
                        <ThemedText style={styles.dayItemMeta}>Task from your trainer</ThemedText>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ─── Classes and Sessions for You ─── */}
        {nearTermSessions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              <SectionHeader
                eyebrow={nextAvailableSessionDate ? 'Next available' : 'For this day'}
                title="Classes & Sessions for You"
                onSeeAll={() => router.push('/(tabs)/classes' as any)}
              />
            </View>
            {visibleSessions.length === 0 ? (
              <View style={styles.noSessionsRow}>
                <Ionicons name="calendar-outline" size={16} color={palette.gray300} />
                <ThemedText style={styles.noSessionsText}>No upcoming classes</ThemedText>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad}>
                {visibleSessions.map((session) => {
                  const { deposit, remainder } = sessionDeposit(session);
                  const isFree = (Number(session.drop_in_price) || 0) === 0;
                  const d = new Date(session.date);
                  return (
                    <OverlayCard
                      key={session.id}
                      imageUrl={session.image_url}
                      fallbackIcon="fitness"
                      catLabel={session.category || 'Class'}
                      catIcon="barbell-outline"
                      name={session.name}
                      tagline={session.gyms?.name}
                      metaIcon="time-outline"
                      metaText={formatTime(session.time)}
                      dateBadge={{
                        mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                        day: d.getDate(),
                      }}
                      priceLabel={isFree ? 'Book for Free!' : `KES ${deposit.toLocaleString()}`}
                      priceSub={isFree ? '' : 'deposit'}
                      priceRemainder={!isFree && remainder > 0 ? `+${remainder.toLocaleString()} at venue` : null}
                      onPress={() => router.push({ pathname: '/session-details', params: { sessionId: session.id } })}
                    />
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* ─── My Journey CTA (fitness + nutrition, merged) ─── */}
        <TouchableOpacity
          style={styles.journeyCta}
          onPress={() => isGuest
            ? showAuthModal(undefined, { defaultTab: 'signup' })
            : router.push('/fitness-journey' as any)
          }
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[palette.blue500, palette.success700]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.journeyCtaGrad}
          >
            <View style={styles.journeyCtaIcon}>
              <Ionicons name="trophy-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.journeyCtaTitle}>My Journey</ThemedText>
              <ThemedText style={styles.journeyCtaSub}>
                {isGuest ? 'Sign up to track your progress' : 'Workouts, meals, streaks & achievements'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* ─── Something for everyone ─── */}
        {/* <View style={styles.section}>
          <View style={styles.sectionPad}>
            <SectionHeader eyebrow="Curated for you" title="Something for everyone" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad} style={{ marginBottom: 14 }}>
            {FOR_EVERYONE.map((item, i) => (
              <EditorialCard key={i} {...item} />
            ))}
          </ScrollView>
        </View> */}

        {/* ─── How it works ───
        <View style={styles.sectionPad}>
          <HowItWorks />
        </View> */}

        {/* ─── Explore top venues ─── */}
        {gyms.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              <SectionHeader
                eyebrow="Near you"
                title="Explore Top Venues"
                onSeeAll={() => router.push('/(tabs)/venues')}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.railPad, { alignItems: 'stretch' }]}>
              {gyms.map((gym) => (
                <StackedCard
                  key={gym.id}
                  imageUrl={gym.image_url}
                  fallbackIcon="fitness"
                  catLabel="Venue"
                  catIcon="business-outline"
                  rating={null}
                  name={gym.name}
                  tagline={gym.description}
                  meta1={gym.location}
                  priceLabel="Explore"
                  onPress={() => router.push({ pathname: '/gym-details', params: { gymId: gym.id } })}
                />
              ))}
              <TouchableOpacity
                style={styles.seeAllTile}
                onPress={() => router.push('/(tabs)/venues')}
              >
                <View style={styles.seeAllTileIcon}>
                  <Ionicons name="arrow-forward" size={28} color={palette.blue500} />
                </View>
                <ThemedText style={styles.seeAllTileText}>All Venues</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ─── Train with a Pro ─── */}
        {trainers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              <SectionHeader
                eyebrow="1-on-1 coaching"
                title="Train with a Pro"
                onSeeAll={() => router.push('/(tabs)/trainers' as any)}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad}>
              {trainers.map((pt) => (
                <StackedCard
                  key={pt.id}
                  imageUrl={pt.photo_url}
                  fallbackIcon="person"
                  fallbackBg={palette.blue500}
                  catLabel={pt.specialisations[0] || 'Trainer'}
                  catIcon="ribbon-outline"
                  rating={pt.avg_rating}
                  verifiedBadge={pt.is_certified_verified}
                  name={pt.professional_name ?? pt.full_name}
                  tagline={pt.specialisations.slice(0, 2).join(' · ') || null}
                  meta1={pt.years_of_experience ? `${pt.years_of_experience} yrs exp` : null}
                  priceLabel={pt.min_price ? `from KES ${pt.min_price.toLocaleString()} / session` : 'Book a session'}
                  onPress={() => router.push({ pathname: '/trainer-profile', params: { id: pt.id } })}
                />
              ))}
              <TouchableOpacity
                style={styles.seeAllTile}
                onPress={() => router.push('/(tabs)/trainers' as any)}
              >
                <View style={styles.seeAllTileIcon}>
                  <Ionicons name="arrow-forward" size={28} color={palette.blue500} />
                </View>
                <ThemedText style={styles.seeAllTileText}>All Trainers</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ─── Experiences (guests only) ─── */}
        {isGuest && experiences.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionPad}>
              <SectionHeader
                eyebrow="Beyond the gym"
                title="Experiences"
                onSeeAll={() => router.push('/(tabs)/experiences' as any)}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad}>
              {experiences.map((exp) => {
                const scarcity = exp.spots_left > 0 && exp.spots_left <= 6 ? `${exp.spots_left} spots left` : null;
                const isFree = Number(exp.price_kes) === 0;
                return (
                  <OverlayCard
                    key={exp.id}
                    imageUrl={exp.image_url}
                    fallbackIcon="sparkles"
                    catLabel={exp.category || 'Experience'}
                    catIcon="trail-sign-outline"
                    name={exp.name}
                    tagline={exp.tagline}
                    metaIcon="calendar-outline"
                    metaText={new Date(exp.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    scarcity={scarcity}
                    saveBadge={!isFree && exp.discount_kes > 0 ? `Save KES ${exp.discount_kes.toLocaleString()}` : null}
                    priceLabel={
                      isFree ? 'Book for Free!' :
                      exp.discount_kes > 0 ? (
                        <ThemedText>
                          <ThemedText style={{ textDecorationLine: 'line-through', color: palette.gray300, fontSize: 12 }}>
                            KES {Number(exp.price_kes).toLocaleString()}{'  '}
                          </ThemedText>
                          KES {(Number(exp.price_kes) - exp.discount_kes).toLocaleString()}
                        </ThemedText>
                      ) : (
                        `KES ${Number(exp.price_kes).toLocaleString()}`
                      )
                    }
                    priceSub={isFree ? '' : 'per person'}
                    onPress={() => router.push({ pathname: '/experience-details', params: { id: exp.id } } as any)}
                    width={RAIL_CARD_W}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

      </ScrollView>

      <TourOverlay visible={tourVisible} steps={HOME_TOUR} onDismiss={dismissTour} />

      {/* ─── Search Modal ─── */}
      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSearch}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.searchModal}>
          <View style={styles.searchHeader}>
            <TouchableOpacity onPress={closeSearch} style={styles.searchBackBtn}>
              <Ionicons name="arrow-back" size={22} color={palette.ink900} />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder="Search classes, gyms, trainers..."
              placeholderTextColor={palette.gray300}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {searchLoading && <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue500} />}

            {!searchLoading && searchQuery.trim().length >= 2
              && searchResults.sessions.length === 0 && searchResults.gyms.length === 0
              && searchResults.experiences.length === 0 && searchResults.trainers.length === 0 && (
              <View style={styles.searchEmpty}>
                <Ionicons name="search-outline" size={40} color={palette.gray300} />
                <ThemedText style={styles.searchEmptyText}>No results for "{searchQuery}"</ThemedText>
              </View>
            )}

            {searchResults.sessions.length > 0 && (
              <View>
                <ThemedText style={styles.searchSectionLabel}>Classes</ThemedText>
                {searchResults.sessions.map(session => {
                  const { deposit } = sessionDeposit(session);
                  return (
                    <TouchableOpacity key={session.id} style={styles.searchResultRow}
                      onPress={() => { closeSearch(); router.push({ pathname: '/session-details', params: { sessionId: session.id } }); }}>
                      {session.image_url
                        ? <Image source={{ uri: session.image_url }} style={styles.searchThumb} />
                        : <View style={[styles.searchThumb, styles.searchThumbFallback]}><Ionicons name="fitness" size={20} color="rgba(255,255,255,0.5)" /></View>}
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.searchResultName} numberOfLines={1}>{session.name}</ThemedText>
                        <ThemedText style={styles.searchResultSub} numberOfLines={1}>
                          {session.gyms?.name} · {new Date(session.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} · KES {deposit.toLocaleString()} deposit
                        </ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {searchResults.gyms.length > 0 && (
              <View>
                <ThemedText style={styles.searchSectionLabel}>Venues</ThemedText>
                {searchResults.gyms.map(gym => (
                  <TouchableOpacity key={gym.id} style={styles.searchResultRow}
                    onPress={() => { closeSearch(); router.push({ pathname: '/gym-details', params: { gymId: gym.id } }); }}>
                    {gym.image_url
                      ? <Image source={{ uri: gym.image_url }} style={styles.searchThumb} />
                      : <View style={[styles.searchThumb, styles.searchThumbFallback, { backgroundColor: palette.blue500 }]}><Ionicons name="business" size={20} color="rgba(255,255,255,0.5)" /></View>}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.searchResultName} numberOfLines={1}>{gym.name}</ThemedText>
                      <ThemedText style={styles.searchResultSub} numberOfLines={1}>{gym.location}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchResults.experiences.length > 0 && (
              <View>
                <ThemedText style={styles.searchSectionLabel}>Experiences</ThemedText>
                {searchResults.experiences.map(exp => (
                  <TouchableOpacity key={exp.id} style={styles.searchResultRow}
                    onPress={() => { closeSearch(); router.push({ pathname: '/experience-details', params: { id: exp.id } } as any); }}>
                    {exp.image_url
                      ? <Image source={{ uri: exp.image_url }} style={styles.searchThumb} />
                      : <View style={[styles.searchThumb, styles.searchThumbFallback]}><Ionicons name="sparkles" size={20} color="rgba(255,255,255,0.5)" /></View>}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.searchResultName} numberOfLines={1}>{exp.name}</ThemedText>
                      <ThemedText style={styles.searchResultSub} numberOfLines={1}>
                        {exp.tagline ?? exp.category} · KES {(Number(exp.price_kes) - (exp.discount_kes || 0)).toLocaleString()}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchResults.trainers.length > 0 && (
              <View>
                <ThemedText style={styles.searchSectionLabel}>Trainers</ThemedText>
                {searchResults.trainers.map(pt => (
                  <TouchableOpacity key={pt.id} style={styles.searchResultRow}
                    onPress={() => { closeSearch(); router.push({ pathname: '/trainer-profile', params: { id: pt.id } }); }}>
                    {pt.photo_url
                      ? <Image source={{ uri: pt.photo_url }} style={[styles.searchThumb, { borderRadius: 24 }]} />
                      : <View style={[styles.searchThumb, styles.searchThumbFallback, { backgroundColor: palette.blue500, borderRadius: 24 }]}><Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" /></View>}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.searchResultName} numberOfLines={1}>{pt.professional_name ?? pt.full_name}</ThemedText>
                      <ThemedText style={styles.searchResultSub} numberOfLines={1}>{pt.specialisations.slice(0, 2).join(' · ')}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerGreeting: { fontSize: fontSize.base, color: palette.gray450, fontWeight: '500' },
  headerName: { fontSize: 30, fontWeight: '800', paddingTop:10, color: palette.ink900, letterSpacing: -0.5 },

  // Mood check-in CTA (full-width, right after header)
  moodCtaCard: {
    margin: 20, marginTop: 16, backgroundColor: palette.white,
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.borderFaint,
    paddingHorizontal: 16, paddingVertical: 16, ...shadows.sm,
  },
  moodCtaTitle: { fontSize: 16, fontWeight: '800', color: palette.ink900, letterSpacing: -0.2, marginBottom: 12 },
  moodCtaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moodCtaBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  moodCtaEmoji: { fontSize: 30, lineHeight: 40 },

  // Next up card
  nextUpCard: {
    margin: 20, marginTop: 16, backgroundColor: palette.blue50,
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.blue100,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
  },
  nextUpHeader: {
    fontSize: 10.5, fontWeight: '700', color: palette.blue500,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
  },
  nextUpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  nextUpRowDivider: { borderBottomWidth: 1, borderBottomColor: palette.blue100 },
  nextUpRowIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: palette.white,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  nextUpRowTitle: { fontSize: 13.5, fontWeight: '700', color: palette.ink900 },
  nextUpRowMeta: { fontSize: 11.5, color: palette.gray450, marginTop: 1 },
  nextUpBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, flexShrink: 0 },
  nextUpBadgeClass: { backgroundColor: palette.blue100 },
  nextUpBadgeWorkout: { backgroundColor: palette.warning100 },
  nextUpBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  nextUpBadgeTextClass: { color: palette.blue500 },
  nextUpBadgeTextWorkout: { color: palette.warning700 },

  // Guest hero
  guestHero: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 8 },
  guestHeadline: { fontSize: 30, fontWeight: '800', color: palette.ink900, lineHeight: 37, marginBottom: 12, letterSpacing: -0.5 },
  guestSub: { fontSize: fontSize.base, color: palette.gray450, lineHeight: 22 },

  // Section layout
  section: { marginTop: 20 },
  sectionPad: { paddingHorizontal: 20, marginBottom: 16, },
  railPad: { paddingHorizontal: 20, gap: 14, paddingBottom: 4 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, textTransform: 'uppercase', marginBottom: 5 },
  sectionTitle: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, letterSpacing: -0.5 },
  seeAllText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue500 },

  // Overlay card
  overlayCard: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline, ...shadows.md },
  overlayCardFallback: { backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' },
  overlayTopRow: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  overlayDateBadge: { backgroundColor: palette.white, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', ...shadows.sm },
  overlayDateMon: { fontSize: 8.5, fontWeight: '700', color: palette.blue500, textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 10 },
  overlayDateDay: { fontSize: 15, fontWeight: '800', color: palette.ink900, lineHeight: 17 },
  scarcityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.danger50, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  scarcityText: { fontSize: 11, fontWeight: '700', color: palette.danger600 },
  overlaySaveBadgeAbs: { position: 'absolute', bottom: 12, left: 12, backgroundColor: palette.success700, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  overlaySaveBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Cat tag (shared)
  catTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.pill },
  catTagText: { fontSize: 11.5, fontWeight: '700', color: '#fff' },

  // Rating pill (shared)
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, ...shadows.sm },
  ratingPillText: { fontSize: 12, fontWeight: '700', color: palette.ink900 },

  // Stacked card
  stackedCard: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline, ...shadows.md },
  stackedTopRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  verifiedBadge: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill },
  verifiedText: { fontSize: 11.5, fontWeight: '700', color: palette.blue500 },
  stackedBody: { padding: 15, gap: 4 },
  stackedName: { fontSize: 17, fontWeight: '700', color: palette.ink900, letterSpacing: -0.2 },
  stackedTagline: { fontSize: 13, color: palette.gray450, fontStyle: 'italic' },
  stackedMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  stackedMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stackedMetaText: { fontSize: 12.5, color: palette.gray450, fontWeight: '500' },
  stackedFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline },
  stackedPrice: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  stackedAside: { fontSize: 12.5, color: palette.gray300, fontWeight: '500' },

  // Editorial card
  editorialCard: { width: EDITORIAL_W, height: Math.round(EDITORIAL_W * 1.33), borderRadius: radii.xl, overflow: 'hidden', ...shadows.sm },
  editorialContent: { position: 'absolute', bottom: 15, left: 15, right: 15 },
  editorialEyebrow: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.14 * 10, textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)', marginBottom: 5 },
  editorialTitle: { fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.4, lineHeight: 22 },
  editorialDesc: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 4, lineHeight: 17 },

  // How it works panel
  howPanel: { backgroundColor: palette.ink900, borderRadius: radii['2xl'], padding: 24, marginTop:16 },
  howEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, textTransform: 'uppercase', color: palette.blue100 },
  howHeadline: { fontSize: 23, fontWeight: '800', color: '#fff', letterSpacing: -0.4, marginTop: 8, lineHeight: 28 },
  howStep: { flexDirection: 'row', gap: 15 },
  howStepLeft: { alignItems: 'center', flexShrink: 0 },
  howStepCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: palette.blue500, alignItems: 'center', justifyContent: 'center' },
  howConnector: { width: 2, flex: 1, minHeight: 22, backgroundColor: palette.blue600, opacity: 0.4, marginVertical: 4 },
  howStepBody: { flex: 1, paddingTop: 6 },
  howStepNum: { fontSize: 11, fontWeight: '700', color: palette.blue100, fontVariant: ['tabular-nums'] },
  howStepTitle: { fontSize: 16.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  howStepDesc: { fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 19, marginTop: 4 },

  // No sessions empty state
  noSessionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 20 },
  noSessionsText: { fontSize: fontSize.sm, color: palette.gray300, fontWeight: '500' },

  // Day items (exercises & tasks filtered by date strip)
  dayItemsList: { paddingHorizontal: 20, gap: 8 },
  dayItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline, padding: 12,
  },
  dayItemIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dayItemTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  dayItemTitleDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  dayItemMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },

  // Date rail

  // See-all tile
  seeAllTile: { width: 130, borderRadius: radii.xl, backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.borderFaint, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 12 },
  seeAllTileIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', ...shadows.md },
  seeAllTileText: { fontSize: fontSize.base, fontWeight: '700', color: palette.blue500, textAlign: 'center', paddingHorizontal: 16 },

  // Fitness + Nutrition split CTA
  // My Journey CTA (fitness + nutrition, merged)
  journeyCta: { marginHorizontal: 20, marginTop: 6 },
  journeyCtaGrad: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radii.xl, paddingHorizontal: 18, paddingVertical: 16 },
  journeyCtaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  journeyCtaTitle: { fontSize: fontSize.lg, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  journeyCtaSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.82)', marginTop: 2 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  journeyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue25, borderRadius: radii.pill,
    paddingHorizontal: 14, height: 34, borderWidth: 1, borderColor: palette.blue100,
  },
  journeyChipText: { fontSize: 13, fontWeight: '800', color: palette.blue500 },

  // Guest hero search bar
  guestSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: palette.borderFaint },
  guestSearchPlaceholder: { fontSize: fontSize.base, color: palette.gray300, flex: 1 },

  // Search modal
  searchModal: { flex: 1, backgroundColor: palette.white },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, gap: 10 },
  searchBackBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, height: 42, backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 16, fontSize: fontSize.base, color: palette.ink900, borderWidth: 1, borderColor: palette.borderFaint },
  searchSectionLabel: { fontSize: 11, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  searchThumb: { width: 48, height: 48, borderRadius: 10 },
  searchThumbFallback: { backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' },
  searchResultName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, letterSpacing: -0.2 },
  searchResultSub: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },
  searchEmpty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  searchEmptyText: { fontSize: fontSize.base, color: palette.gray300, textAlign: 'center' },
});

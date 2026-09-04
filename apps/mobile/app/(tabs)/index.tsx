import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  Dimensions, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { type Recurrence } from '@/services/notifications';
import { computeStreak, type Stats } from '@/services/fitnessStats';
import { syncHealthData, checkAppleHealthConnection } from '@/services/health';
import { estimateTodayStepsFromStrava, getStravaStatus } from '@/services/strava';
import { buildPlanSummary, GOAL_OPTIONS, EMPTY_ANSWERS, isStep2Complete } from '@/lib/onboarding';
import { isValidAssessment, CATEGORY_LABEL, type AIAssessment, type ActivityCategory } from '@/lib/ai-assessment';
import { hydrateWorkoutExerciseMedia } from '@/services/activity-recommendation-service';
import {
  selectMealsForNutritionFocus, nutritionFocusTagLabel, selectDailyMeals,
  type FoodCandidate, type DailyMealCandidates,
} from '@/lib/nutrition-matching';
import { getFulfilmentForActivity, nextDateForWeekday, type PlanActivityFulfilment, type MarketplaceInventoryItem, type MarketplaceMatch } from '@/lib/fulfilment';
import { ActivityFulfilmentCard, GymAccessList } from '@/components/activity-fulfilment-card';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { isMeasurementCheckinEnabled } from '@/lib/flags';
import { MeasurementCheckinCard } from '@/components/home/measurement-checkin-card';
import { getMeasurementCheckinState, syncMeasurementCheckinNotification } from '@/services/measurement-checkin-service';
import type { MeasurementCheckinStatus } from '@/lib/progress/measurement-checkin';
import { ExerciseMedia } from '@/components/exercise-media';
import {
  getCompletionProgress, findStravaCandidates, findExerciseDbCandidates, findAcpBookingCandidates, findHealthKitCandidates,
  type PlanActivityCompletion, type CompletionCandidate, type StravaActivityRow, type WorkoutHistoryRow, type AcpCheckedInRow, type HealthKitWorkoutRow,
} from '@/lib/completion';
import { getHomeIntelligenceInsight, findTodayActivity, selectNextActivity } from '@/lib/home-intelligence';
import { pickHomeInsight, formatOverallProgress, type CoachingMemoryRow } from '@/lib/coaching-memory';
import { buildWeeklyCoachingBrief } from '@/lib/coaching';
import {
  isPlanReadyForReview, isSundayPlanningWindow, fetchPlanDateUpgrade,
  getScheduledNextPlan, localDateIso, type ScheduledNextPlan,
} from '@/lib/weekly-review';

const { width } = Dimensions.get('window');
const RAIL_CARD_W = Math.round(width * 0.5);
const EDITORIAL_W = Math.round(width * 0.48);

// Today's Plan / Up next background — the real per-exercise MuscleWiki clip
// is preferred, but it's frozen null on any workout generated while the
// provider was down. Rather than fall back to a bare white card, use a
// category-appropriate bundled image so the card always reads as intentional.
const CATEGORY_FALLBACK_MEDIA: Record<ActivityCategory, number> = {
  strength: require('@/assets/images/desktop.jpg'),
  cardio: require('@/assets/images/ref.jpeg'),
  recovery: require('@/assets/images/yoga.jpg'),
  mobility: require('@/assets/images/yoga.jpg'),
  sport: require('@/assets/images/ref.jpeg'),
};

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
  avatarUrl: string | null;
}

const MOODS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '🙁' },
  { value: 3, emoji: '😐' },
  { value: 4, emoji: '🙂' },
  { value: 5, emoji: '😄' },
] as const;

const STEPS_GOAL = 8000;
const WATER_GOAL = 8;
const GOAL_BANNER_DISMISS_KEY = 'home:goalBannerDismissedFor';

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

interface TodayMeal {
  id: string;
  mealId: string;
  name: string;
  image_url: string | null;
  calories: number | null;
  slotLabel: string;
  // Home Nutrition Integration — set only when this meal was chosen because
  // it carries the current nutrition_focus's real ACP tag (never invented);
  // undefined for the existing general/meal-plan suggestions.
  focusTagLabel?: string;
}

const MEAL_SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', smoothie: 'Smoothie',
};

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
  eyebrow, title, onInfoPress, onSeeAll, seeAllLabel = 'See All',
}: { eyebrow?: string; title: string; onInfoPress?: () => void; onSeeAll?: () => void; seeAllLabel?: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View>
        {eyebrow && <Eyebrow text={eyebrow} />}
        <View style={styles.sectionTitleRow}>
          <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
          {onInfoPress && (
            <TouchableOpacity onPress={onInfoPress} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="information-circle-outline" size={16} color={palette.gray300} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll}>
          <ThemedText style={styles.seeAllText}>{seeAllLabel}</ThemedText>
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

// ─── Combined goal rings (Steps / Water / Exercises — "For this day") ────────
// One Apple-Health-style concentric-ring card with a legend, replacing three
// separate ring cards. Rings are purely informational (matches the reference
// design); the existing interactions (log water, open today's workout,
// connect Health) live on the legend rows instead of dedicated buttons.

const RINGS_SIZE = 118;
const RINGS_STROKE = 11;
const RINGS_GAP = 5;

const RING_COLOR = {
  steps: palette.warning500,
  water: palette.blue500,
  exercises: palette.success700,
} as const;

interface GoalRingDef {
  key: string;
  color: string;
  label: string;
  value: number;
  goal: number;
  displayValue: string;
  displayGoal: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
}

function RingArc({ radius, color, progress }: { radius: number; color: string; progress: number }) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <>
      <Circle
        cx={RINGS_SIZE / 2}
        cy={RINGS_SIZE / 2}
        r={radius}
        stroke={palette.border}
        strokeWidth={RINGS_STROKE}
        fill="none"
      />
      <Circle
        cx={RINGS_SIZE / 2}
        cy={RINGS_SIZE / 2}
        r={radius}
        stroke={color}
        strokeWidth={RINGS_STROKE}
        fill="none"
        strokeDasharray={`${circumference}, ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        rotation={-90}
        origin={`${RINGS_SIZE / 2}, ${RINGS_SIZE / 2}`}
      />
    </>
  );
}

function CombinedGoalRingsCard({ rings }: { rings: GoalRingDef[] }) {
  return (
    <View style={styles.ringsCombinedRow}>
      <Svg width={RINGS_SIZE} height={RINGS_SIZE}>
        {rings.map((ring, i) => (
          <RingArc
            key={ring.key}
            radius={(RINGS_SIZE - RINGS_STROKE) / 2 - i * (RINGS_STROKE + RINGS_GAP)}
            color={ring.color}
            progress={ring.goal > 0 ? ring.value / ring.goal : 0}
          />
        ))}
      </Svg>
      <View style={styles.ringsLegend}>
        {rings.map(ring => {
          const Row = ring.onPress || ring.onLongPress ? TouchableOpacity : View;
          return (
            <Row
              key={ring.key}
              style={styles.ringsLegendRow}
              onPress={ring.onPress}
              onLongPress={ring.onLongPress}
              activeOpacity={0.7}
            >
              <View style={[styles.ringsLegendDot, { backgroundColor: ring.color }]} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.ringsLegendLabel}>{ring.label}</ThemedText>
                {ring.subtitle && (
                  <ThemedText style={styles.ringsLegendSubtitle} numberOfLines={1}>{ring.subtitle}</ThemedText>
                )}
              </View>
              <View style={styles.ringsLegendValueRow}>
                <ThemedText style={styles.ringsLegendValue}>{ring.displayValue}</ThemedText>
                <ThemedText style={styles.ringsLegendGoal}>{ring.displayGoal}</ThemedText>
              </View>
            </Row>
          );
        })}
      </View>
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
        Lana Health — your plan for staying active and healthy.
      </ThemedText>
      <ThemedText style={styles.guestSub}>
        Set a goal and Lana builds a personalised plan to move, eat, connect and track your progress — then adapts it around your real life. Gyms, studios, classes, coaches and experiences across Nairobi help you follow it through.
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

// Beta Feedback #008B — Home is contextual FEATURE education, not a second
// product introduction (the pre-auth walkthrough already covers "what is
// ACP"). It describes what's on this screen today; no membership/pass
// framing, no overclaimed intelligence.
const HOME_TOUR: TourStep[] = [
  { icon: 'today-outline', title: 'Today, at a glance', description: "Your home shows what Lana has planned for you today — your session, your meals, and where you're at with the week." },
  { icon: 'sparkles-outline', title: 'What Lana notices', description: 'As you complete, skip or log things, Lana shares short, plain observations here — and uses them to shape your next plan.' },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('home');
  // Beta #019 — Home's marketplace modules ("Need a gym?", "Do it with Lana"
  // matches) only appear when Lana has bookable supply where the user is. This
  // never prompts for GPS (§12) — Home is a fitness/nutrition surface. If the
  // user already granted location on Discover it resolves; otherwise the
  // marketplace modules are simply absent and everything else is unchanged.
  const marketLoc = useMarketplaceLocation();
  const marketAvailable = marketLoc.availability?.status === 'available';
  const marketLocRef = useRef(marketLoc);
  marketLocRef.current = marketLoc;
  /** Predicate for "keep this marketplace row?" — read inside data-loading
   *  effects. Kill switch off → always true (pre-#019). Lana available here →
   *  membership in the in-radius venue set. Otherwise → always false. */
  const marketVenueFilter = (): ((gymId: string | null | undefined) => boolean) => {
    const m = marketLocRef.current;
    if (!m.geoGatingEnabled) return () => true;
    if (m.availability?.status !== 'available') return () => false;
    const allow = new Set(m.venueIdsInRadius);
    return (gymId) => !!gymId && allow.has(gymId);
  };
  const [isGuest, setIsGuest] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [todayMood, setTodayMood] = useState<number | null>(null);
  // Beta #020 — weekly measurement check-in due state (in-app source of truth).
  const [measurementCheckin, setMeasurementCheckin] = useState<MeasurementCheckinStatus | null>(null);
  const [goalStatus, setGoalStatus] = useState<'not_set' | 'incomplete' | 'complete'>('complete');
  const [goalSummary, setGoalSummary] = useState<{ goalLine: string; icon: string } | null>(null);
  // "Your goal" banner — user can dismiss it once their goal is set; it comes
  // back only when the goal actually changes (dismissal is stored keyed to
  // the current goal summary).
  const [goalBannerDismissed, setGoalBannerDismissed] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [workoutSchedules, setWorkoutSchedules] = useState<WorkoutSchedule[]>([]);
  const [completedWorkoutKeys, setCompletedWorkoutKeys] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [fitnessStats, setFitnessStats] = useState<Stats>({ totalWorkouts: 0, totalMinutes: 0, streakDays: 0, longestStreak: 0 });
  const [todayGoals, setTodayGoals] = useState({ steps: 0, waterCups: 0, sleepHours: 0 });
  const [stepsGoal, setStepsGoal] = useState(STEPS_GOAL);
  const [stepsFromStrava, setStepsFromStrava] = useState(false);
  // Connection-status notifications (bell icon) — default true/connected so
  // nothing flashes on load; only flips once we've actually confirmed the
  // account has no Apple Health authorization / no linked Strava account.
  const [appleHealthConnected, setAppleHealthConnected] = useState(true);
  const [stravaConnected, setStravaConnected] = useState(true);
  // Today's Plan card — reported by ActivityFulfilmentCard once its
  // recommendation resolves: the workout id (→ background media lookup), the
  // "N exercises · M min" summary shown next to the category, and any
  // gym-access matches rendered as their own "Need a gym?" card below.
  const [todayWorkoutId, setTodayWorkoutId] = useState<string | null>(null);
  const [todayPlanMediaUrl, setTodayPlanMediaUrl] = useState<string | null>(null);
  const [todayWorkoutMeta, setTodayWorkoutMeta] = useState<{ exerciseCount: number | null; durationMinutes: number | null } | null>(null);
  const [todayGymAccess, setTodayGymAccess] = useState<MarketplaceMatch[]>([]);
  // Beta #012 — same exercise-video background treatment for the "Up next" card;
  // its gym-access matches render as their own card BELOW, never over the video.
  const [upNextWorkoutId, setUpNextWorkoutId] = useState<string | null>(null);
  const [upNextMediaUrl, setUpNextMediaUrl] = useState<string | null>(null);
  const [upNextGymAccess, setUpNextGymAccess] = useState<MarketplaceMatch[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [upcomingWorkoutProgress, setUpcomingWorkoutProgress] = useState<{ completed: number; total: number } | null>(null);
  const [todayMeals, setTodayMeals] = useState<TodayMeal[]>([]);
  const [todayMealsAreSuggested, setTodayMealsAreSuggested] = useState(false);
  const [cuisinePreference, setCuisinePreference] = useState<string | null>(null);
  // ACP Intelligence™ Home integration — loaded independently of loadData()
  // above (see the dedicated effect below), so it never delays the existing
  // Home content or the main `loading` spinner. Home makes no AI call of
  // its own: this is purely a presentation layer over the assessment /
  // completions data Days 1-4 already produced.
  const [homeAssessment, setHomeAssessment] = useState<AIAssessment | null>(null);
  const [homePlanId, setHomePlanId] = useState<string | null>(null);
  const [homeCompletions, setHomeCompletions] = useState<PlanActivityCompletion[]>([]);
  // Day 6 — already-computed longitudinal coaching evidence, read once
  // alongside homeAssessment; never recomputed on Home.
  const [homeCoachingMemory, setHomeCoachingMemory] = useState<CoachingMemoryRow[]>([]);
  // True once the load attempt (success or failure) has finished — gates
  // rendering so nothing flashes/shifts layout while it's in flight; per
  // spec, quietly omitting is preferred over a new loading indicator.
  const [homeIntelLoaded, setHomeIntelLoaded] = useState(false);
  const [todayFulfilment, setTodayFulfilment] = useState<PlanActivityFulfilment | null>(null);
  const [todayCandidate, setTodayCandidate] = useState<CompletionCandidate | null>(null);
  // Beta Feedback #012 — "what's next?" after today is resolved. Day 9 skip
  // state + Beta #001 scheduled next-week plan feed the deterministic
  // next-activity selection; upcomingFulfilment is the future-dated supply
  // for that activity (its own bounded query, no LLM).
  const [homeSkippedIndexes, setHomeSkippedIndexes] = useState<Set<number>>(new Set());
  const [homeScheduledNext, setHomeScheduledNext] = useState<ScheduledNextPlan | null>(null);
  const [upcomingFulfilment, setUpcomingFulfilment] = useState<PlanActivityFulfilment | null>(null);
  const [showIntelligenceInfo, setShowIntelligenceInfo] = useState(false);

  // Beta #019 — resolve marketplace availability in the background (no GPS
  // prompt), and strip marketplace matches from the plan-fulfilment cards
  // when Lana has no bookable supply where the user is. Self-directed
  // workouts, nutrition and coaching content are untouched.
  useEffect(() => { marketLoc.ensureResolved({ requestPermission: false }); }, [marketLoc]);
  const gateFulfilment = useCallback(
    (f: PlanActivityFulfilment | null): PlanActivityFulfilment | null =>
      f && !marketAvailable ? { ...f, marketplaceMatches: [] } : f,
    [marketAvailable],
  );
  const todayFulfilmentGated = gateFulfilment(todayFulfilment);
  const upcomingFulfilmentGated = gateFulfilment(upcomingFulfilment);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const calSelected = new Date().toISOString().split('T')[0];
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

  // Exercises ring — when there's an upcoming/current scheduled workout, show
  // progress through *that workout's* individual exercises (e.g. 1/4 sets of
  // exercises done); otherwise fall back to a simple scheduled-items count
  // (workouts + trainer tasks for the day).
  const exercisesTotal = upcomingWorkoutProgress?.total ?? (scheduledWorkoutsForDay.length + scheduledTasksForDay.length);
  const exercisesCompleted = upcomingWorkoutProgress
    ? upcomingWorkoutProgress.completed
    : exercisesTotal - dayWorkouts.length - dayTasks.length;

  const adjustGoal = async (field: 'waterCups' | 'sleepHours', delta: number) => {
    if (!userId) return;
    const prev = todayGoals;
    const next = { ...prev, [field]: Math.max(0, prev[field] + delta) };
    setTodayGoals(next);
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('health_daily_stats').upsert({
      user_id: userId,
      date: today,
      water_cups: next.waterCups,
      sleep_hours: next.sleepHours,
    }, { onConflict: 'user_id,date' });
    if (error) setTodayGoals(prev);
  };

  // Only meals from a real meal plan have a meal_plan_items row to log
  // against — suggested meals (no active plan) toggle locally only.
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
    const todayStr = new Date().toISOString().split('T')[0];
    for (const schedule of workoutSchedules) {
      if (!scheduleMatchesDate(schedule, todayStr)) continue;
      if (completedWorkoutKeys.has(`${schedule.workout_id}|${todayStr}`)) continue;
      const at = new Date(`${todayStr}T${schedule.time_of_day}`);
      if (at.getTime() <= Date.now()) continue;
      items.push({ kind: 'workout', key: `workout-${schedule.id}`, at, schedule });
    }
    return items.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [activeBooking, bookingAt, workoutSchedules, completedWorkoutKeys]);

  const upcomingWorkoutId = nextUpItems[0]?.kind === 'workout' ? nextUpItems[0].schedule.workout_id : null;

  // Exercises ring: how many of *this specific upcoming workout's* exercises
  // have already been logged today, out of how many it has in total.
  useEffect(() => {
    if (!userId || !upcomingWorkoutId) { setUpcomingWorkoutProgress(null); return; }
    let cancelled = false;
    (async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const [{ count: total }, { data: historyRow }] = await Promise.all([
        supabase.from('workout_exercises').select('id', { count: 'exact', head: true }).eq('workout_id', upcomingWorkoutId),
        supabase.from('workout_history').select('id')
          .eq('user_id', userId).eq('workout_id', upcomingWorkoutId)
          .gte('completed_at', `${todayStr}T00:00:00.000Z`).lte('completed_at', `${todayStr}T23:59:59.999Z`)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (!total) { setUpcomingWorkoutProgress(null); return; }

      let completed = 0;
      if (historyRow?.id) {
        const { data: setLogs } = await supabase
          .from('workout_set_logs')
          .select('exercise_id')
          .eq('workout_history_id', historyRow.id);
        completed = new Set((setLogs ?? []).map(r => r.exercise_id)).size;
      }
      if (!cancelled) setUpcomingWorkoutProgress({ completed, total });
    })();
    return () => { cancelled = true; };
  }, [userId, upcomingWorkoutId]);

  // Derived purely from already-loaded state — no extra query, no AI call.
  const homeTodayActivity = homeAssessment ? findTodayActivity(homeAssessment.starting_plan.activities) : null;
  const homeTodayIndex = homeAssessment && homeTodayActivity ? homeAssessment.starting_plan.activities.indexOf(homeTodayActivity) : -1;
  const homeTodayCompletionRecord = homeTodayIndex >= 0 ? homeCompletions.find(c => c.activityIndex === homeTodayIndex) : undefined;
  const homeTodayCompleted = !!homeTodayCompletionRecord;
  const homeWeeklyProgress = homeAssessment
    ? getCompletionProgress(homeAssessment.starting_plan.activities.length, homeCompletions)
    : { completed: 0, total: 0, percent: 0 };

  // ── Beta Feedback #012 — deterministic "what's next" selection ────────────
  // Pure, no query, no AI. `homeTodayActivity` / `homeTodayCompleted` above
  // are LEFT UNTOUCHED so the daily exercise ring keeps representing today's
  // progress (spec §9). This is presentation-order only, over the same
  // canonical completion/skip state Beta #010 fixed.
  const homeCompletedIndexes = useMemo(
    () => new Set(homeCompletions.map(c => c.activityIndex)),
    [homeCompletions],
  );
  const homeNextSel = useMemo(
    () => (homeAssessment
      ? selectNextActivity({
          activities: homeAssessment.starting_plan.activities,
          completedIndexes: homeCompletedIndexes,
          skippedIndexes: homeSkippedIndexes,
        })
      : { kind: 'none' as const }),
    [homeAssessment, homeCompletedIndexes, homeSkippedIndexes],
  );
  // The "Today's Plan" section's featured activity: the still-unresolved
  // activity dated today (which may be the 2nd of the day, §4/§22-B), else
  // today's activity shown as completed/skipped context, else none.
  const homePrimaryRef = useMemo(() => {
    if (!homeAssessment) return null;
    if (homeNextSel.kind === 'today') return homeNextSel.ref;
    const ta = findTodayActivity(homeAssessment.starting_plan.activities);
    if (!ta) return null;
    return { activity: ta, activityIndex: homeAssessment.starting_plan.activities.indexOf(ta), dateIso: localDateIso(new Date()) };
  }, [homeAssessment, homeNextSel]);
  const homePrimaryCompletionRecord = homePrimaryRef
    ? homeCompletions.find(c => c.activityIndex === homePrimaryRef.activityIndex)
    : undefined;
  const homePrimaryCompleted = !!homePrimaryCompletionRecord;
  const homePrimarySkipped = homePrimaryRef ? homeSkippedIndexes.has(homePrimaryRef.activityIndex) : false;
  const homePrimaryResolved = homePrimaryCompleted || homePrimarySkipped;
  const homePrimarySyncLabel = homePrimaryCompletionRecord?.completionSource === 'strava'
    ? 'Synced from Strava'
    : homePrimaryCompletionRecord?.completionSource === 'healthkit'
    ? 'Synced from Apple Health'
    : null;
  // "UP NEXT" — only once today's actionable work is resolved (kind !== 'today'):
  // the next unresolved activity in the current plan, or the earliest activity
  // of a scheduled next-week plan (Beta #001, read-only preview, §17).
  const homeUpcomingRef = useMemo(() => {
    if (homeNextSel.kind === 'upcoming') {
      return {
        activity: homeNextSel.ref.activity, activityIndex: homeNextSel.ref.activityIndex,
        dateIso: homeNextSel.ref.dateIso, dateLabel: homeNextSel.dateLabel,
        restTomorrow: homeNextSel.restTomorrow, planId: homePlanId, fromScheduled: false,
      };
    }
    if (homeNextSel.kind === 'none' && homeScheduledNext) {
      const s = selectNextActivity({
        activities: homeScheduledNext.assessment.starting_plan.activities,
        completedIndexes: new Set(), skippedIndexes: new Set(),
      });
      if (s.kind === 'upcoming') {
        return {
          activity: s.ref.activity, activityIndex: s.ref.activityIndex, dateIso: s.ref.dateIso,
          dateLabel: s.dateLabel, restTomorrow: s.restTomorrow,
          planId: homeScheduledNext.planId, fromScheduled: true,
        };
      }
    }
    return null;
  }, [homeNextSel, homeScheduledNext, homePlanId]);
  // When today's canonical plan activity is strength, the Exercises ring
  // switches from the general trainer-workout schedule (a different,
  // unrelated system) to representing that specific plan activity instead —
  // same completion signal already used by the "Today's Plan" section.
  const todayIsStrength = homeIntelLoaded && !!homeAssessment && homeTodayActivity?.category === 'strength';
  // Day 5 — a compact entry point when the current plan's week has ended and
  // a review is available, reusing the exact same ACP Intelligence card
  // slot (no new card/notification system, per Part 43) rather than
  // duplicating any review/adaptation logic here — generating the review
  // itself only ever happens on My Plan, from an explicit tap.
  const homeReviewReady = homeIntelLoaded && isPlanReadyForReview(homeAssessment, new Date());
  // Beta Feedback #001 — Sunday next-week planning window (local date).
  const homeSundayPlanning = homeIntelLoaded && !homeReviewReady && isSundayPlanningWindow(homeAssessment, new Date());
  // Day 8.1 — deterministic weekly coaching brief (no network, no LLM). Only
  // ever occupies the existing "no activity today" insight slot below, and
  // only when it has something more specific to say than the generic filler
  // (never for its plain neutral/first-week fallback — pickHomeInsight stays
  // the fallback there). Never blocks Home; a failure just means no brief.
  const homeBriefInsight = (() => {
    if (!homeIntelLoaded || !homeAssessment) return null;
    try {
      const brief = buildWeeklyCoachingBrief({
        assessment: homeAssessment,
        overall: formatOverallProgress(homeCoachingMemory),
        coachingMemory: homeCoachingMemory,
        isFirstWeek: homeCoachingMemory.length === 0 && homeWeeklyProgress.completed === 0,
      });
      if (brief.provenance.detail === 'neutral') return null;
      return { headline: brief.headline, body: `${brief.observation} ${brief.guidance}`.trim() };
    } catch {
      return null;
    }
  })();
  const homeInsight = homeReviewReady
    ? {
        headline: 'Your weekly review is ready',
        body: 'See what Lana learned from last week and get your next plan.',
        ctaLabel: 'See what Lana learned →',
        ctaTarget: '/my-plan',
      }
    : homeIntelLoaded
    ? getHomeIntelligenceInsight({
        assessment: homeAssessment,
        todayActivity: homeTodayActivity,
        todayCompleted: homeTodayCompleted,
        weeklyProgress: homeWeeklyProgress,
        longitudinalInsight: homeBriefInsight ?? pickHomeInsight(homeCoachingMemory),
      })
    : null;

  // Confirming a synced signal (e.g. today's Strava walk) records the same
  // plan_activity_completions row My Plan's "Mark as done" would — same
  // insert shape, so both screens immediately agree on progress. Dismissing
  // is a local-only nudge (matches My Plan's dismissal, not persisted).
  const handleConfirmTodayCandidate = async () => {
    if (!userId || !homeAssessment || !homePlanId || homeTodayIndex < 0 || !todayCandidate) return;
    const candidate = todayCandidate;
    const day = homeAssessment.starting_plan.activities[homeTodayIndex]?.day;
    const plannedDate = day ? nextDateForWeekday(day, new Date()) : new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('plan_activity_completions')
      .insert({
        user_id: userId, plan_id: homePlanId,
        activity_index: homeTodayIndex, planned_date: plannedDate,
        completion_source: candidate.source, source_entity_id: candidate.sourceEntityId,
      })
      .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
      .single();
    if (!data) return;
    setHomeCompletions(prev => [...prev, {
      id: data.id, planId: data.plan_id, activityIndex: data.activity_index, plannedDate: data.planned_date,
      completedAt: data.completed_at, completionSource: data.completion_source, sourceEntityId: data.source_entity_id,
    }]);
    setTodayCandidate(null);
  };

  const handleDismissTodayCandidate = () => setTodayCandidate(null);

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

  // Today's Plan background — the first exercise with demo media (a real
  // MuscleWiki video, else its animated GIF) from today's resolved workout.
  // Cheap read, non-blocking; a miss just leaves the card in its plain form.
  const fetchFirstExerciseMedia = useCallback(async (workoutId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('workout_exercises')
      .select('sort_order, exercises(gif_url)')
      .eq('workout_id', workoutId)
      .order('sort_order');
    return ((data as any[]) ?? [])
      .map(r => r.exercises?.gif_url as string | null)
      .find(u => !!u) ?? null;
  }, []);

  // A stored gif_url is preferred; on a miss, try a one-off backfill of the
  // workout's MuscleWiki exercises (rows frozen null while the proxy was
  // down) and use whatever that recovers. Both are non-blocking and
  // decorative — a total miss just leaves the plain/category-fallback card.
  useEffect(() => {
    if (!todayWorkoutId) { setTodayPlanMediaUrl(null); return; }
    let active = true;
    (async () => {
      let url = await fetchFirstExerciseMedia(todayWorkoutId).catch(() => null);
      if (!url) url = await hydrateWorkoutExerciseMedia(todayWorkoutId).catch(() => null);
      if (active) setTodayPlanMediaUrl(url);
    })();
    return () => { active = false; };
  }, [todayWorkoutId, fetchFirstExerciseMedia]);

  // Beta #012 — same background-media lookup (+ backfill) for the "Up next" card.
  useEffect(() => {
    if (!upNextWorkoutId) { setUpNextMediaUrl(null); return; }
    let active = true;
    (async () => {
      let url = await fetchFirstExerciseMedia(upNextWorkoutId).catch(() => null);
      if (!url) url = await hydrateWorkoutExerciseMedia(upNextWorkoutId).catch(() => null);
      if (active) setUpNextMediaUrl(url);
    })();
    return () => { active = false; };
  }, [upNextWorkoutId, fetchFirstExerciseMedia]);

  // ACP Intelligence™ Home integration — deliberately independent of
  // loadData() above: it never touches `loading`, so existing Home content
  // renders first regardless of whether/how fast this finishes. Reads only
  // data Days 1-4 already produced (assessment, completions) — makes NO
  // OpenAI call. Any failure here just leaves the section omitted; nothing
  // else on Home is affected. Only runs once a complete goal exists — if
  // the goal itself isn't set up yet, the existing goal banner above
  // already covers that messaging, so this section stays hidden rather
  // than duplicating it.
  useEffect(() => {
    if (isGuest || !userId || goalStatus !== 'complete') {
      setHomeIntelLoaded(false);
      return;
    }
    let cancelled = false;
    setHomeIntelLoaded(false);

    (async () => {
      const { data } = await supabase
        .from('fitness_profile')
        .select('ai_assessment, ai_assessment_generated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;

      // Old Day-1-shaped or otherwise invalid rows are treated as "no
      // assessment yet" (Priority 5) — same safety rule as My Plan.
      if (!data?.ai_assessment || !isValidAssessment(data.ai_assessment) || !data.ai_assessment_generated_at) {
        setHomeAssessment(null);
        setHomePlanId(null);
        setHomeCompletions([]);
        setTodayFulfilment(null);
        setTodayCandidate(null);
        setHomeCoachingMemory([]);
        setHomeIntelLoaded(true);
        return;
      }

      const assessment = data.ai_assessment;
      const planId = data.ai_assessment_generated_at as string;
      setHomeAssessment(assessment);
      setHomePlanId(planId);

      // Day 6 — coaching memory is already fully computed server-side; a
      // plain, non-blocking read, same pattern as the date upgrade below.
      supabase
        .from('coaching_memory')
        .select('memory_type, subject, confidence, evidence, user_message')
        .eq('user_id', userId)
        .eq('active', true)
        .then(
          ({ data: memoryRows }) => { if (!cancelled) setHomeCoachingMemory((memoryRows ?? []) as CoachingMemoryRow[]); },
          () => { /* non-blocking read — Home renders fine without coaching memory */ },
        );

      // Day 5.5 Problem C — same opportunistic, lazy date upgrade as My
      // Plan: never blocks this render, never surfaces an error if it fails
      // (the plan already rendered above is left exactly as-is either way).
      if (!assessment.starting_plan?.week_end_date) {
        authService.getSession().then(authSession => {
          if (authSession?.access_token) {
            fetchPlanDateUpgrade({ userId, accessToken: authSession.access_token }).then(result => {
              if (!cancelled && result.upgraded && result.assessment) {
                setHomeAssessment(result.assessment);
              }
            });
          }
        }).catch(() => { /* opportunistic upgrade — the rendered plan is left as-is on any failure */ });
      }

      const { data: completionsData } = await supabase
        .from('plan_activity_completions')
        .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
        .eq('user_id', userId)
        .eq('plan_id', planId);
      if (cancelled) return;

      const completions: PlanActivityCompletion[] = ((completionsData ?? []) as any[]).map(c => ({
        id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
        completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
      }));
      setHomeCompletions(completions);

      // Beta #012 — Day 9 skip state + Beta #001 scheduled next-week plan.
      // Two bounded reads; feed the deterministic next-activity selection.
      const [{ data: execData }, scheduledNext] = await Promise.all([
        supabase.from('plan_activity_execution')
          .select('activity_index, execution_status')
          .eq('user_id', userId).eq('plan_id', planId),
        getScheduledNextPlan(supabase as any, userId),
      ]);
      if (cancelled) return;
      const skippedIndexes = new Set<number>(
        ((execData ?? []) as any[]).filter(r => r.execution_status === 'skipped').map(r => r.activity_index),
      );
      setHomeSkippedIndexes(skippedIndexes);
      setHomeScheduledNext(scheduledNext);

      const today = new Date();
      const completedIndexes = new Set(completions.map(c => c.activityIndex));
      // Which activity today still needs doing (§4/§22-B) — the same selector
      // the render uses. `null` = every actionable activity today is resolved
      // (or it's a rest day) → the "Today's Plan" fulfilment/candidate lookup
      // is skipped and "UP NEXT" takes over.
      const sel = selectNextActivity({
        activities: assessment.starting_plan.activities,
        completedIndexes, skippedIndexes, now: today,
      });
      const todayRef = sel.kind === 'today' ? sel.ref : null;

      if (!todayRef) {
        setTodayFulfilment(null);
        setTodayCandidate(null);
      } else {
        {
          const todayActivity = todayRef.activity;
          const todayIndex = todayRef.activityIndex;
          // Only fetched when there's actually an incomplete activity today
          // to enhance — no query at all on rest days or once today is done.
          const todayIso = today.toISOString().split('T')[0];
          const twoDaysAgoIso = new Date(today.getTime() - 2 * 86400000).toISOString();
          const [sessionsRes, experiencesRes, stravaStatus, stravaActivitiesRes, healthWorkoutsRes, workoutHistoryRes, checkedInBookingsRes, checkedInExperiencesRes] = await Promise.all([
            supabase.from('sessions')
              .select('id, gym_id, name, category, date, time, duration_minutes, is_active, spots_left, image_url, drop_in_price, gyms(name)')
              .eq('date', todayIso).eq('is_active', true),
            supabase.from('experiences')
              .select('id, gym_id, name, category, date, start_time, price_kes, is_active, spots_left, image_url, gyms(name)')
              .eq('date', todayIso).eq('is_active', true),
            getStravaStatus(),
            // Existing signals from things the user already did — synced
            // against the plan here so "Today's Plan" never shows a blind
            // "track activity" CTA when e.g. a Strava walk or an Apple
            // Health workout already logged today would satisfy it (same
            // Day 4 candidate-matching used on My Plan, just scoped to
            // today's single activity). Strava/HealthKit are device/OS-
            // verified, so a match here is auto-counted below rather than
            // requiring a confirm tap; ExerciseDB/ACP-booking matches remain
            // suggestion-only, further down.
            supabase.from('activities')
              .select('id, activity_type, start_time, duration_seconds')
              .eq('user_id', userId).eq('source', 'strava').gte('start_time', twoDaysAgoIso),
            supabase.from('health_workouts')
              .select('id, activity_type, start_date, duration_seconds')
              .eq('user_id', userId).gte('start_date', twoDaysAgoIso),
            supabase.from('workout_history')
              .select('id, completed_at, workouts(category)')
              .eq('user_id', userId).gte('completed_at', twoDaysAgoIso),
            supabase.from('bookings')
              .select('id, checked_in, check_in_time, sessions(name, category)')
              .eq('user_id', userId).eq('checked_in', true).gte('check_in_time', twoDaysAgoIso),
            supabase.from('experience_bookings')
              .select('id, updated_at, experiences(name, category)')
              .eq('user_id', userId).eq('status', 'checked_in').gte('updated_at', twoDaysAgoIso),
          ]);
          if (cancelled) return;
          // Beta #019 — geo-scope: only venues with valid active+bookable
          // supply within radius; nothing when Lana isn't available here.
          const _keep = marketVenueFilter(); // Beta #019 — geo-scope
          const inventory: MarketplaceInventoryItem[] = [
            ...((sessionsRes?.data ?? []) as any[]).filter(s => _keep(s.gym_id)).map(s => ({
              id: s.id, type: 'session' as const, name: s.name, category: s.category ?? null,
              date: s.date ?? null, startTime: s.time ?? null, durationMinutes: s.duration_minutes ?? null,
              gymName: s.gyms?.name ?? null, isActive: !!s.is_active, spotsLeft: s.spots_left ?? null,
              imageUrl: s.image_url ?? null, priceKes: s.drop_in_price ?? null,
            })),
            ...((experiencesRes?.data ?? []) as any[]).filter(e => _keep(e.gym_id)).map(e => ({
              id: e.id, type: 'experience' as const, name: e.name, category: e.category ?? null,
              date: e.date ?? null, startTime: e.start_time ?? null, durationMinutes: null,
              gymName: e.gyms?.name ?? null, isActive: !!e.is_active, spotsLeft: e.spots_left ?? null,
              imageUrl: e.image_url ?? null, priceKes: e.price_kes ?? null,
            })),
          ];
          setTodayFulfilment(getFulfilmentForActivity(todayActivity, todayIndex, inventory, stravaStatus.connected, today));

          const completedIndexes = new Set(completions.map(c => c.activityIndex));
          const usedSourceEntityIds = new Set(completions.map(c => c.sourceEntityId).filter((id): id is string => !!id));
          const stravaRows: StravaActivityRow[] = ((stravaActivitiesRes?.data ?? []) as any[]).map(a => ({
            id: a.id, activityType: a.activity_type, startTime: a.start_time, durationSeconds: a.duration_seconds ?? 0,
          }));
          const healthKitRows: HealthKitWorkoutRow[] = ((healthWorkoutsRes?.data ?? []) as any[]).map(w => ({
            id: w.id, activityType: w.activity_type, startDate: w.start_date, durationSeconds: Math.round(w.duration_seconds ?? 0),
          }));
          const workoutRows: WorkoutHistoryRow[] = ((workoutHistoryRes?.data ?? []) as any[]).map(w => ({
            id: w.id, workoutCategory: w.workouts?.category ?? null, completedAt: w.completed_at,
          }));
          const checkedInRows: AcpCheckedInRow[] = [
            ...((checkedInBookingsRes?.data ?? []) as any[]).map(b => ({
              id: b.id, type: 'acp_session' as const, name: b.sessions?.name ?? '', category: b.sessions?.category ?? null,
              checkedInDate: (b.check_in_time ?? '').split('T')[0],
            })),
            ...((checkedInExperiencesRes?.data ?? []) as any[]).map(e => ({
              id: e.id, type: 'acp_experience' as const, name: e.experiences?.name ?? '', category: e.experiences?.category ?? null,
              checkedInDate: (e.updated_at ?? '').split('T')[0],
            })),
          ];

          // Strava + Apple Health are device/OS-verified — auto-counted, no
          // tap required. ExerciseDB/ACP-booking matches stay suggestion-only.
          const autoCandidates = [
            ...findStravaCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, stravaRows, today),
            ...findHealthKitCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, healthKitRows, today),
          ];
          const autoMatch = autoCandidates.find(c => c.activityIndex === todayIndex);

          if (autoMatch) {
            const day = todayActivity.day;
            const plannedDate = day ? nextDateForWeekday(day, today) : todayIso;
            const { data: inserted } = await supabase
              .from('plan_activity_completions')
              .insert({
                user_id: userId, plan_id: planId, activity_index: todayIndex, planned_date: plannedDate,
                completion_source: autoMatch.source, source_entity_id: autoMatch.sourceEntityId,
              })
              .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
              .single();
            if (cancelled) return;
            if (inserted) {
              setHomeCompletions(prev => [...prev, {
                id: inserted.id, planId: inserted.plan_id, activityIndex: inserted.activity_index, plannedDate: inserted.planned_date,
                completedAt: inserted.completed_at, completionSource: inserted.completion_source, sourceEntityId: inserted.source_entity_id,
              }]);
            }
            setTodayCandidate(null);
          } else {
            const manualCandidates = [
              ...findExerciseDbCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, workoutRows, today),
              ...findAcpBookingCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, checkedInRows, today),
            ];
            setTodayCandidate(manualCandidates.find(c => c.activityIndex === todayIndex) ?? null);
          }
        }
      }

      setHomeIntelLoaded(true);
    })().catch(() => {
      if (!cancelled) {
        setHomeAssessment(null);
        setHomePlanId(null);
        setHomeCompletions([]);
        setTodayFulfilment(null);
        setTodayCandidate(null);
        setHomeIntelLoaded(true);
      }
    });

    return () => { cancelled = true; };
  }, [isGuest, userId, goalStatus]);

  // Beta Feedback #010 — the ACP-intel effect above only runs at mount, so
  // completing a workout (or any plan action) elsewhere left Home showing the
  // stale ring / recommendation until an app relaunch. Re-derive completion
  // state from the canonical rows on every return to Home: one indexed query,
  // no LLM, no marketplace fetch. State stays backend-derived — no local
  // "workoutCompleted = true" is trusted (spec #010 §3).
  const refreshHomeCompletions = useCallback(async () => {
    if (isGuest || !userId || !homePlanId) return;
    // Beta #012 — also re-read Day 9 skip state (a skip on My Plan must not
    // leave Home trapped on the skipped activity) and the scheduled next-week
    // plan (so a Beta #003 regeneration is reflected without a relaunch).
    const [{ data }, { data: execData }, scheduledNext] = await Promise.all([
      supabase
        .from('plan_activity_completions')
        .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
        .eq('user_id', userId).eq('plan_id', homePlanId),
      supabase
        .from('plan_activity_execution')
        .select('activity_index, execution_status')
        .eq('user_id', userId).eq('plan_id', homePlanId),
      getScheduledNextPlan(supabase as any, userId),
    ]);
    setHomeScheduledNext(scheduledNext);
    if (!data) return;
    const next: PlanActivityCompletion[] = (data as any[]).map(c => ({
      id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
      completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
    }));
    setHomeCompletions(next);
    setHomeSkippedIndexes(new Set(
      ((execData ?? []) as any[]).filter(r => r.execution_status === 'skipped').map(r => r.activity_index),
    ));
    if (homeAssessment) {
      const todayAct = findTodayActivity(homeAssessment.starting_plan.activities, new Date());
      const todayIdx = todayAct ? homeAssessment.starting_plan.activities.indexOf(todayAct) : -1;
      if (todayIdx >= 0 && next.some(c => c.activityIndex === todayIdx)) {
        setTodayCandidate(null);
        setTodayFulfilment(null);
      }
    }
  }, [isGuest, userId, homePlanId, homeAssessment]);

  useFocusEffect(useCallback(() => {
    if (homeIntelLoaded) refreshHomeCompletions();
  }, [homeIntelLoaded, refreshHomeCompletions]));

  // Beta #012 — supply for the "UP NEXT" activity, fetched for its real
  // future date (§11). Its own bounded query; skipped for a scheduled
  // next-week plan (read-only preview, §17) and when nothing is upcoming.
  const upcomingKey = homeUpcomingRef && !homeUpcomingRef.fromScheduled
    ? `${homeUpcomingRef.dateIso}:${homeUpcomingRef.activityIndex}`
    : null;
  useEffect(() => {
    if (isGuest || !userId || !homeUpcomingRef || homeUpcomingRef.fromScheduled) {
      setUpcomingFulfilment(null);
      return;
    }
    const { activity, activityIndex, dateIso } = homeUpcomingRef;
    let cancelled = false;
    (async () => {
      const [sessionsRes, experiencesRes, stravaStatusRes] = await Promise.all([
        supabase.from('sessions')
          .select('id, gym_id, name, category, date, time, duration_minutes, is_active, spots_left, image_url, drop_in_price, gyms(name)')
          .eq('date', dateIso).eq('is_active', true),
        supabase.from('experiences')
          .select('id, gym_id, name, category, date, start_time, price_kes, is_active, spots_left, image_url, gyms(name)')
          .eq('date', dateIso).eq('is_active', true),
        getStravaStatus(),
      ]);
      if (cancelled) return;
      const _keep = marketVenueFilter(); // Beta #019 — geo-scope
      const inventory: MarketplaceInventoryItem[] = [
        ...((sessionsRes?.data ?? []) as any[]).filter(sn => _keep(sn.gym_id)).map(sn => ({
          id: sn.id, type: 'session' as const, name: sn.name, category: sn.category ?? null,
          date: sn.date ?? null, startTime: sn.time ?? null, durationMinutes: sn.duration_minutes ?? null,
          gymName: sn.gyms?.name ?? null, isActive: !!sn.is_active, spotsLeft: sn.spots_left ?? null,
          imageUrl: sn.image_url ?? null, priceKes: sn.drop_in_price ?? null,
        })),
        ...((experiencesRes?.data ?? []) as any[]).filter(e => _keep(e.gym_id)).map(e => ({
          id: e.id, type: 'experience' as const, name: e.name, category: e.category ?? null,
          date: e.date ?? null, startTime: e.start_time ?? null, durationMinutes: null,
          gymName: e.gyms?.name ?? null, isActive: !!e.is_active, spotsLeft: e.spots_left ?? null,
          imageUrl: e.image_url ?? null, priceKes: e.price_kes ?? null,
        })),
      ];
      const [y, m, d] = dateIso.split('-').map(Number);
      setUpcomingFulfilment(
        getFulfilmentForActivity(activity, activityIndex, inventory, stravaStatusRes.connected, new Date(y, m - 1, d)),
      );
    })().catch(() => { if (!cancelled) setUpcomingFulfilment(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, userId, upcomingKey, marketLoc.availability?.status]);

  // Home Nutrition Integration — deterministic, never a second OpenAI call.
  // Only ever overrides the existing GENERAL/suggested meal path
  // (todayMealsAreSuggested) — an active, self-built or nutritionist-
  // assigned meal_plan (the "Today's plan" path) is left completely alone,
  // since that's a deliberate, already-curated choice a generic tag
  // heuristic shouldn't second-guess. Runs only after loadData()'s own
  // todayMeals/todayMealsAreSuggested have already settled and the ACP
  // Intelligence assessment has loaded, so it never blocks Home's first
  // render or introduces a new loading state.
  useEffect(() => {
    if (loading || !homeIntelLoaded || !todayMealsAreSuggested) return;
    const focus = homeAssessment?.nutrition_focus;
    if (!focus) return;

    let cancelled = false;
    (async () => {
      const categories = ['breakfast', 'lunch', 'dinner'];
      const categoryResults = await Promise.all(
        categories.map(category =>
          supabase.from('meals')
            .select('id, name, image_url, calories, category, cuisine, tags')
            .eq('is_active', true)
            .eq('category', category),
        ),
      );
      if (cancelled) return;

      const mealsBySlot = categories.map((category, i) => ({
        category,
        foods: ((categoryResults[i].data ?? []) as any[]).map(m => ({
          id: m.id, name: m.name, category: m.category, cuisine: m.cuisine, tags: m.tags ?? [],
        } as FoodCandidate)),
      }));
      const selections = selectMealsForNutritionFocus(focus.type, cuisinePreference, mealsBySlot);
      if (selections.length === 0) return; // nothing safe/available for this focus — leave the existing general suggestions exactly as they are

      const rawById = new Map<string, any>();
      categoryResults.forEach(r => (r.data ?? []).forEach((m: any) => rawById.set(m.id, m)));

      const focusMeals: TodayMeal[] = selections.map(sel => {
        const raw = rawById.get(sel.food.id);
        return {
          id: sel.food.id,
          mealId: sel.food.id,
          name: sel.food.name,
          image_url: raw?.image_url ?? null,
          calories: raw?.calories ?? null,
          slotLabel: MEAL_SLOT_LABEL[sel.category] ?? sel.category,
          focusTagLabel: sel.matchesFocus ? nutritionFocusTagLabel(focus.type) : undefined,
        };
      });
      setTodayMeals(focusMeals);
    })().catch(() => { /* leave the existing general suggestions exactly as they were */ });

    return () => { cancelled = true; };
  }, [loading, homeIntelLoaded, todayMealsAreSuggested, homeAssessment?.nutrition_focus, cuisinePreference]);

  const loadData = async () => {
    try {
      setLoading(true);
      const authSession = await authService.getSession();

      if (authSession?.user) {
        setIsGuest(false);
        setUserId(authSession.user.id);
        const { data: userData } = await supabase
          .from('users')
          .select('name, avatar_url')
          .eq('id', authSession.user.id)
          .maybeSingle();

        setUser({
          name: userData?.name || authSession.user.user_metadata?.full_name || authSession.user.email?.split('@')[0] || 'there',
          avatarUrl: userData?.avatar_url || null,
        });

        const today = new Date().toISOString().split('T')[0];

        const { data: checkinData } = await supabase
          .from('daily_checkins')
          .select('mood')
          .eq('user_id', authSession.user.id)
          .eq('checkin_date', today)
          .maybeSingle();
        setTodayMood(checkinData?.mood ?? null);

        // Beta #020 — weekly measurement check-in. In-app due state is the
        // source of truth (shown regardless of notification permission); the
        // supplemental local notification is reconciled idempotently here.
        if (isMeasurementCheckinEnabled()) {
          const mcState = await getMeasurementCheckinState(authSession.user.id);
          setMeasurementCheckin(mcState.ok ? mcState.status : null); // load failure → no card (§19)
          syncMeasurementCheckinNotification(mcState).catch(() => {});
        } else {
          setMeasurementCheckin(null);
        }

        const { data: fitnessProfileData } = await supabase
          .from('fitness_profile')
          .select(`
            goal, onboarding_completed, daily_steps_goal, trainer_daily_steps_goal,
            starting_weight_kg, goal_weight_kg, goal_target_date,
            activity_level, experience_level, goal_details, barriers, preferred_activities,
            cuisine_preference
          `)
          .eq('user_id', authSession.user.id)
          .maybeSingle();
        setCuisinePreference(fitnessProfileData?.cuisine_preference ?? null);
        if (!fitnessProfileData?.goal) { setGoalStatus('not_set'); setGoalSummary(null); setGoalBannerDismissed(false); }
        else if (!fitnessProfileData.onboarding_completed) { setGoalStatus('incomplete'); setGoalSummary(null); setGoalBannerDismissed(false); }
        else {
          const goalAnswers = {
            ...EMPTY_ANSWERS,
            goal: fitnessProfileData.goal,
            startingWeightKg: fitnessProfileData.starting_weight_kg,
            goalWeightKg: fitnessProfileData.goal_weight_kg,
            goalTargetDate: fitnessProfileData.goal_target_date,
            activityLevel: fitnessProfileData.activity_level,
            strengthExperience: fitnessProfileData.experience_level,
            goalDetails: fitnessProfileData.goal_details ?? {},
            barriers: fitnessProfileData.barriers ?? [],
            preferredActivities: fitnessProfileData.preferred_activities ?? [],
          };
          // onboarding_completed can be stale relative to the current goal
          // (e.g. it was changed later from the My Goals page, which doesn't
          // walk back through the weight/target-date/focus questions) — treat
          // that case the same as an incomplete goal so the "finish setting
          // up your goals" CTA shows instead of silently hiding both banners.
          if (isStep2Complete(goalAnswers)) {
            setGoalStatus('complete');
            const goalOpt = GOAL_OPTIONS.find(g => g.key === fitnessProfileData.goal);
            const { goalLine } = buildPlanSummary(goalAnswers);
            setGoalSummary({ goalLine, icon: goalOpt?.icon ?? 'flag-outline' });
            // stays dismissed only while the goal summary is unchanged
            try {
              const dismissedFor = await AsyncStorage.getItem(GOAL_BANNER_DISMISS_KEY);
              setGoalBannerDismissed(dismissedFor === goalLine);
            } catch { setGoalBannerDismissed(false); }
          } else {
            setGoalStatus('incomplete');
            setGoalSummary(null);
            setGoalBannerDismissed(false);
          }
        }
        // Trainer-set goal wins over the client's own, which wins over the default.
        setStepsGoal(fitnessProfileData?.trainer_daily_steps_goal ?? fitnessProfileData?.daily_steps_goal ?? STEPS_GOAL);

        // Today's meals — from the user's active meal plan (self-built or
        // nutritionist-assigned) if they have one, same query shape as
        // nutrition-hub.tsx; otherwise a handful of suggestions from the
        // curated meal library so the section isn't empty for new users.
        const { data: mealPlanData } = await supabase
          .from('meal_plans')
          .select('id')
          .eq('user_id', authSession.user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let planMeals: TodayMeal[] = [];
        if (mealPlanData) {
          const todayDow = new Date().getDay();
          const { data: planItemsData } = await supabase
            .from('meal_plan_items')
            .select('id, meal_slot, sort_order, meals(id, name, image_url, calories)')
            .eq('meal_plan_id', mealPlanData.id)
            .eq('day_of_week', todayDow)
            .order('sort_order');
          planMeals = ((planItemsData as any[]) ?? [])
            .filter(item => item.meals)
            .map(item => ({
              id: item.id,
              mealId: item.meals.id,
              name: item.meals.name,
              image_url: item.meals.image_url,
              calories: item.meals.calories,
              slotLabel: MEAL_SLOT_LABEL[item.meal_slot] ?? item.meal_slot,
            }));
        }

        if (planMeals.length > 0) {
          setTodayMeals(planMeals);
          setTodayMealsAreSuggested(false);
        } else {
          // One query per category (rather than a single shared limit) so a
          // category-skewed table can't crowd the others out of the results.
          const categories = ['breakfast', 'lunch', 'dinner'];
          const categoryResults = await Promise.all(
            categories.map(category =>
              supabase.from('meals')
                .select('id, name, image_url, calories, category')
                .eq('is_active', true)
                .eq('category', category)
                .limit(5),
            ),
          );
          // Stable daily selection (Home Nutrition Hardening, Problem B) —
          // deterministic from user + calendar date + slot, never
          // Math.random(). Same user opening Home twice today always sees
          // the same suggestions; they can only rotate on a new date.
          const mealsBySlot: DailyMealCandidates[] = categories.map((category, i) => ({
            category,
            foods: ((categoryResults[i].data ?? []) as any[]).map(m => ({
              id: m.id, name: m.name, image_url: m.image_url, calories: m.calories,
            })),
          }));
          const dailySelections = selectDailyMeals(authSession.user.id, today, mealsBySlot);
          const suggested: TodayMeal[] = dailySelections.map(sel => ({
            id: sel.food.id,
            mealId: sel.food.id,
            name: sel.food.name,
            image_url: sel.food.image_url,
            calories: sel.food.calories,
            slotLabel: MEAL_SLOT_LABEL[sel.category] ?? sel.category,
          }));
          setTodayMeals(suggested);
          setTodayMealsAreSuggested(true);
        }

        const { data: dailyStatsData } = await supabase
          .from('health_daily_stats')
          .select('steps, water_cups, sleep_hours')
          .eq('user_id', authSession.user.id)
          .eq('date', today)
          .maybeSingle();
        setTodayGoals({
          steps: dailyStatsData?.steps ?? 0,
          waterCups: dailyStatsData?.water_cups ?? 0,
          sleepHours: dailyStatsData?.sleep_hours ?? 0,
        });
        setStepsFromStrava(false);

        // Connection-status — the real signals, not proxies: Apple Health via
        // getRequestStatusForAuthorization (see lib/connected-fitness.ts),
        // Strava via its status endpoint. Both re-checked on every focus.
        // All four are best-effort background enhancements: a network failure
        // (offline, provider unreachable) must degrade silently and leave the
        // page's existing state as-is — never surface a red error box on
        // every launch. Hence the explicit .catch on each fire-and-forget.
        if (Platform.OS === 'ios') {
          checkAppleHealthConnection()
            .then(state => setAppleHealthConnected(state === 'connected'))
            .catch(() => { /* leave connection state unchanged */ });
        }
        getStravaStatus()
          .then(status => setStravaConnected(status.connected))
          .catch(() => { /* leave Strava state unchanged */ });

        // If there's no real HealthKit step count for today, fall back to a
        // rough estimate from today's Strava walk/run distance — better than
        // showing 0 for someone who tracks activity via Strava instead.
        if (!dailyStatsData?.steps) {
          estimateTodayStepsFromStrava(authSession.user.id, today)
            .then(estimated => {
              if (estimated != null) {
                setTodayGoals(g => ({ ...g, steps: estimated }));
                setStepsFromStrava(true);
              }
            })
            .catch(() => { /* keep the step count already shown */ });
        }

        // Opportunistic background refresh — if Apple Health access was
        // already granted, this quietly pulls in today's real step count
        // without blocking the rest of the page from rendering.
        syncHealthData(1).then(async synced => {
          if (!synced) return;
          const { data: freshStats } = await supabase
            .from('health_daily_stats')
            .select('steps')
            .eq('user_id', authSession.user.id)
            .eq('date', today)
            .maybeSingle();
          if (freshStats?.steps != null) {
            setTodayGoals(g => ({ ...g, steps: freshStats.steps }));
            setStepsFromStrava(false);
          }
        }).catch(() => { /* health sync is best-effort */ });

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
          .eq('status', 'completed')
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
        setMeasurementCheckin(null);
        setGoalStatus('complete');
        setGoalSummary(null);
        setGoalBannerDismissed(false);
        setActiveBooking(null);
        setWorkoutSchedules([]);
        setCompletedWorkoutKeys(new Set());
        setTasks([]);
        setFitnessStats({ totalWorkouts: 0, totalMinutes: 0, streakDays: 0, longestStreak: 0 });
        setTodayGoals({ steps: 0, waterCups: 0, sleepHours: 0 });
        setStepsGoal(STEPS_GOAL);
        setStepsFromStrava(false);
        setTodayMeals([]);
        setTodayMealsAreSuggested(false);
      }

      const todayStr = new Date().toISOString().split('T')[0];

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

  const homeNotifications: { key: string; icon: string; title: string; body: string; onPress: () => void }[] = [
    ...(Platform.OS === 'ios' && !appleHealthConnected ? [{
      key: 'watch', icon: 'watch-outline', title: 'Connect Apple Watch',
      body: 'Sync workouts and activity automatically from your Apple Watch.',
      onPress: () => router.push('/health-settings' as any),
    }] : []),
    ...(Platform.OS === 'ios' && !appleHealthConnected ? [{
      key: 'health', icon: 'heart-outline', title: 'Connect Apple Health',
      body: 'Bring in your steps, heart rate, and workouts from Apple Health.',
      onPress: () => router.push('/health-settings' as any),
    }] : []),
    ...(!stravaConnected ? [{
      key: 'strava', icon: 'bicycle-outline', title: 'Connect Strava',
      body: 'Automatically log your rides and runs from Strava.',
      onPress: () => router.push('/strava-settings' as any),
    }] : []),
  ];

  return (
    <>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[palette.blue100, 'rgba(208,224,255,0)']}
          style={styles.topFadeBg}
          pointerEvents="none"
        />

        {/* ─── Header greeting / guest hero ─── */}
        {isGuest ? (
          <GuestHero onSearch={() => setSearchVisible(true)} />
        ) : (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/profile' as any)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                {user?.avatarUrl ? (
                  <ExpoImage source={{ uri: user.avatarUrl }} style={styles.headerAvatar} />
                ) : (
                  <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                    <ThemedText style={styles.headerAvatarInitial}>
                      {(user?.name?.[0] || '?').toUpperCase()}
                    </ThemedText>
                  </View>
                )}
              </TouchableOpacity>
              <View>
                <ThemedText style={styles.headerGreeting}>{getGreeting()}</ThemedText>
                <ThemedText style={styles.headerName}>{user?.name?.split(' ')[0] || 'there'}</ThemedText>
              </View>
            </View>
            <View style={styles.headerRight}>
              {/* Check in — moved here off the bottom tab bar. */}
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/check-in' as any)}
                hitSlop={10}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Check in"
              >
                <Ionicons name="scan-outline" size={24} color={palette.ink900} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowNotifications(true)}
                hitSlop={10}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={24} color={palette.ink900} />
                {homeNotifications.length > 0 && <View style={styles.headerBellDot} />}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Goal status banner ─── */}
        {!isGuest && goalStatus !== 'complete' && (
          <TouchableOpacity
            style={styles.goalBanner}
            onPress={() => router.push('/onboarding/goal' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.goalBannerIcon}>
              <Ionicons name="flag-outline" size={18} color={palette.blue600} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.goalBannerTitle}>
                {goalStatus === 'not_set' ? 'Goals not set' : 'Incomplete set of goals'}
              </ThemedText>
              <ThemedText style={styles.goalBannerSub}>
                {goalStatus === 'not_set'
                  ? "Tell us what you're working toward so we can personalise your plan"
                  : 'Finish setting up your goals to get the most out of your plan'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.blue600} />
          </TouchableOpacity>
        )}

        {/* ─── Your goal (once set) — same slot as the status banner above.
              Dismissible; comes back only if the goal actually changes. ─── */}
        {!isGuest && goalStatus === 'complete' && goalSummary && !goalBannerDismissed && (
          <TouchableOpacity
            style={styles.goalBanner}
            onPress={() => router.push('/fitness-goals' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.goalBannerIcon}>
              <Ionicons name={goalSummary.icon as any} size={18} color={palette.blue600} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.goalBannerTitle}>Your goal</ThemedText>
              <ThemedText style={styles.goalBannerSub}>{goalSummary.goalLine}</ThemedText>
            </View>
            <TouchableOpacity
              onPress={() => {
                setGoalBannerDismissed(true);
                AsyncStorage.setItem(GOAL_BANNER_DISMISS_KEY, goalSummary.goalLine).catch(() => {});
              }}
              hitSlop={12}
              accessibilityLabel="Dismiss goal banner"
            >
              <Ionicons name="close" size={18} color={palette.blue600} />
            </TouchableOpacity>
          </TouchableOpacity>
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

        {/* ─── Beta #020 — weekly measurement check-in. Sits with the other
              check-in prompts, below the goal/account banners (critical
              state) and above Today's Focus. Renders only when due/overdue;
              disappears the moment a measurement is saved (Home reloads on
              focus). Independent of notification permission. ─── */}
        {!isGuest && measurementCheckin && (
          <MeasurementCheckinCard status={measurementCheckin} />
        )}

        {/* ─── Today's Focus (filtered by date strip above) ─── */}
        {!isGuest && (
          <View style={styles.section}>
            <View style={styles.todaysFocusCard}>
              <View style={{ marginBottom: 12 }}>
                <SectionHeader
                  title="Today's Focus"
                  onInfoPress={() => setShowIntelligenceInfo(true)}
                  onSeeAll={homeInsight ? () => router.push(homeInsight.ctaTarget as any) : undefined}
                  seeAllLabel={homeInsight?.ctaLabel}
                />

                {/* ─── ACP Intelligence™ — compact insight, presentation layer
                      only. Never calls OpenAI: reads the assessment/completions
                      Days 1-4 already produced. Hidden entirely while
                      goalStatus isn't 'complete' (the banners above already
                      cover that), and while still loading, to avoid a layout
                      shift. ─── */}
                {!isGuest && homeInsight && (
                  <TouchableOpacity
                    style={styles.intelligenceInline}
                    onPress={() => router.push(homeInsight.ctaTarget as any)}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={styles.intelligenceCardHeadline}>{homeInsight.headline}</ThemedText>
                    <ThemedText style={styles.intelligenceCardBody}>{homeInsight.body}</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              <CombinedGoalRingsCard
                rings={[
                  {
                    key: 'steps',
                    color: RING_COLOR.steps,
                    label: 'Steps',
                    value: todayGoals.steps,
                    goal: stepsGoal,
                    displayValue: `${todayGoals.steps}`,
                    displayGoal: ` /${stepsGoal}`,
                    subtitle: stepsFromStrava
                      ? 'Estimated · tap to connect Health'
                      : appleHealthConnected
                        ? 'From Apple Health'
                        : (Platform.OS === 'ios' ? 'Connect Apple Health' : 'Connect Health'),
                    onPress: () => router.push('/health-settings' as any),
                  },
                  {
                    key: 'water',
                    color: RING_COLOR.water,
                    label: 'Water',
                    value: todayGoals.waterCups,
                    goal: WATER_GOAL,
                    displayValue: `${todayGoals.waterCups}`,
                    displayGoal: ` /${WATER_GOAL} cups`,
                    subtitle: 'Tap to add · hold to remove',
                    onPress: () => adjustGoal('waterCups', 1),
                    onLongPress: () => adjustGoal('waterCups', -1),
                  },
                  {
                    key: 'exercises',
                    color: RING_COLOR.exercises,
                    label: 'Exercises',
                    value: todayIsStrength ? (homeTodayCompleted ? 1 : 0) : exercisesCompleted,
                    goal: todayIsStrength ? 1 : exercisesTotal,
                    displayValue: todayIsStrength ? (homeTodayCompleted ? '1' : '0') : `${exercisesCompleted}`,
                    displayGoal: todayIsStrength ? ' /1' : ` /${exercisesTotal}`,
                    subtitle: todayIsStrength
                      ? `${homeTodayActivity!.title} · ${homeTodayActivity!.duration_minutes} min`
                      : (!isGuest && nextUpItems.length > 0
                        ? `${nextUpItems[0].kind === 'booking'
                          ? nextUpItems[0].booking.sessions?.name
                          : (nextUpItems[0].schedule.workouts?.title ?? 'Workout')} · ${nextUpItems[0].at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                        : undefined),
                    onPress: todayIsStrength
                      ? () => router.push('/my-plan' as any)
                      : (!isGuest && nextUpItems.length > 0 ? () => (
                        nextUpItems[0].kind === 'booking'
                          ? router.push({ pathname: '/(tabs)/check-in', params: { sessionId: nextUpItems[0].booking.session_id ?? '' } } as any)
                          : router.push({ pathname: '/workout-detail', params: { workoutId: nextUpItems[0].schedule.workout_id } } as any)
                      ) : undefined),
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* ─── Today's Plan — the plan activity Home features for today.
              Beta #012: this is the still-unresolved activity dated today
              (which may be the 2nd of the day); once every actionable
              activity today is resolved it becomes a compact ✓/skipped
              acknowledgement and "UP NEXT" below takes over as primary. ─── */}
        {!isGuest && homeIntelLoaded && homePrimaryRef && (
          <View style={styles.section}>
            {!homePrimaryResolved && (
              <View style={[styles.sectionPad, { marginBottom: 0 }]}>
                <Eyebrow text="Suggested for today" />
              </View>
            )}
            <View style={styles.mealsList}>
              {(() => {
              const primary = homePrimaryRef.activity;
              const planFallbackMedia = CATEGORY_FALLBACK_MEDIA[primary.category];
              const hasPlanMedia = (!!todayPlanMediaUrl || !!planFallbackMedia) && !homePrimaryResolved;
              return (
              <View style={[styles.todayPlanCard, hasPlanMedia && styles.todayPlanCardMedia]}>
                {hasPlanMedia && (
                  <>
                    {todayPlanMediaUrl
                      ? <ExerciseMedia url={todayPlanMediaUrl} fit="cover" style={styles.todayPlanMedia} />
                      : <Image source={planFallbackMedia} style={styles.todayPlanMedia} resizeMode="cover" />}
                    <LinearGradient
                      colors={['rgba(9,11,20,0.42)', 'rgba(9,11,20,0.82)']}
                      style={styles.todayPlanScrim}
                      pointerEvents="none"
                    />
                  </>
                )}
                <View style={hasPlanMedia ? styles.todayPlanContentMedia : undefined}>
                  {homePrimaryResolved ? (
                    <View style={styles.todayPlanCompletedRow}>
                      <Ionicons
                        name={homePrimaryCompleted ? 'checkmark-circle' : 'remove-circle-outline'}
                        size={15}
                        color={homePrimaryCompleted ? palette.success700 : palette.gray300}
                      />
                      <ThemedText style={styles.todayPlanCompletedText}>
                        {CATEGORY_LABEL[primary.category]} {homePrimaryCompleted ? 'completed' : 'skipped'}
                        {homePrimarySyncLabel ? ` · ${homePrimarySyncLabel}` : ''}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={[styles.todayPlanCategory, hasPlanMedia && styles.todayPlanCategoryOnMedia]}>
                      {[
                        CATEGORY_LABEL[primary.category],
                        hasPlanMedia && todayWorkoutMeta?.exerciseCount != null ? `${todayWorkoutMeta.exerciseCount} exercises` : null,
                        hasPlanMedia && todayWorkoutMeta?.durationMinutes != null ? `${todayWorkoutMeta.durationMinutes} min` : null,
                      ].filter(Boolean).join(' · ')}
                    </ThemedText>
                  )}
                  <ThemedText style={[styles.mealRowTitle, hasPlanMedia && styles.todayPlanTitleOnMedia]}>{primary.title}</ThemedText>
                  {!homePrimaryResolved && (
                    <ThemedText style={[styles.mealRowMeta, hasPlanMedia && styles.todayPlanMetaOnMedia]}>
                      {primary.activity}
                      {hasPlanMedia && todayWorkoutMeta ? '' : ` · ${primary.duration_minutes} min`}
                    </ThemedText>
                  )}

                {!homePrimaryResolved && todayCandidate ? (
                  // Something the user already did (e.g. a Strava walk logged
                  // today) matches this activity — surface it instead of a
                  // blind "track activity" CTA. Still requires a tap to
                  // confirm, never auto-completed.
                  <View style={styles.candidateBanner}>
                    <ThemedText style={styles.candidateText}>
                      We found a {todayCandidate.label} from {
                        todayCandidate.source === 'strava' ? 'Strava' : todayCandidate.source === 'exercise_db' ? 'your workout history' : 'Lana'
                      } today. Count this toward today&apos;s {primary.activity.toLowerCase()}?
                    </ThemedText>
                    <View style={styles.candidateActions}>
                      <TouchableOpacity onPress={handleConfirmTodayCandidate} activeOpacity={0.85}>
                        <ThemedText style={styles.candidateConfirm}>Yes, count it</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleDismissTodayCandidate} activeOpacity={0.85}>
                        <ThemedText style={styles.candidateDismiss}>Not this one</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : !homePrimaryResolved ? (
                  <ActivityFulfilmentCard
                    userId={userId}
                    activity={primary}
                    fulfilment={todayFulfilmentGated ?? undefined}
                    onInfoPress={() => setShowIntelligenceInfo(true)}
                    onDark={hasPlanMedia}
                    gymAccessSlot="detached"
                    planContext={homePlanId ? {
                      planId: homePlanId,
                      activityIndex: homePrimaryRef.activityIndex,
                      plannedDate: primary.planned_date
                        ?? nextDateForWeekday(primary.day, new Date())
                        ?? new Date().toISOString().split('T')[0],
                    } : undefined}
                    onResolved={(r) => {
                      setTodayWorkoutId(r.sessionId);
                      setTodayWorkoutMeta(
                        r.exerciseCount != null || r.durationMinutes != null
                          ? { exerciseCount: r.exerciseCount, durationMinutes: r.durationMinutes }
                          : null,
                      );
                      setTodayGymAccess(r.gymAccess);
                    }}
                    emptyFallback={
                      <TouchableOpacity onPress={() => router.push('/weekly-plan' as any)} activeOpacity={0.7} style={{ marginTop: 10 }}>
                        <ThemedText style={[styles.todayPlanCta, hasPlanMedia && styles.todayPlanTextOnMedia]}>View this week&apos;s plan →</ThemedText>
                      </TouchableOpacity>
                    }
                  />
                ) : null}
                </View>
              </View>
              ); })()}
            </View>
          </View>
        )}

        {/* ─── Need a gym? — "where to do it", its own section, separate from
              the Today's Plan (workout) card. Same <GymAccessList> the
              fulfilment card uses inline, so the two look identical.
              Navigation only — never marks the activity done. ─── */}
        {!isGuest && homeIntelLoaded && marketAvailable && todayGymAccess.length > 0 && (
          <View style={styles.section}>
            <View style={styles.mealsList}>
              <GymAccessList matches={todayGymAccess} />
            </View>
          </View>
        )}

        {/* ─── Today's Meals ───
              nutrition focus and meal fulfilment are each gated
              independently — a meal-query failure (empty todayMeals) no
              longer hides a genuine nutrition_focus. */}
        {!isGuest && (!!homeAssessment?.nutrition_focus || todayMeals.length > 0) && (
          <View style={styles.section}>
            {/* ONE eyebrow for the whole nutrition area (Part 3/23) — never
                repeated per sub-block. "Today's plan" when these are the
                user's own/nutritionist-assigned meals, "Suggested"
                otherwise — same signal the old per-block eyebrow gave. */}
            <View style={styles.sectionPad}>
              <Eyebrow text={
                !todayMealsAreSuggested
                  ? "Today's plan"
                  : (homeTodayActivity && !homeTodayCompleted ? 'Also suggested' : 'Suggested')
              } />

              {/* Home Nutrition Integration — the WEEK's intent, independent
                  of which specific meals are listed below (plan-driven or
                  ranked). A compact, editorial block, not a card. */}
              {!!homeAssessment?.nutrition_focus && (
                <View style={{ marginTop: 10 }}>
                  <Eyebrow text="This week's nutrition focus" />
                  <ThemedText style={styles.sectionTitle}>{homeAssessment.nutrition_focus.title}</ThemedText>
                  <ThemedText style={styles.mealRowMeta}>{homeAssessment.nutrition_focus.reason}</ThemedText>
                </View>
              )}
            </View>

            {/* Today's Meals — a compact CTA rather than the full list; the
                meals themselves (with logging) live on /today-nutrition. */}
            {todayMeals.length > 0 && (
              <TouchableOpacity
                style={styles.todaysMealsCta}
                onPress={() => router.push('/today-nutrition' as any)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.todaysMealsTitle}>Today&apos;s Meals</ThemedText>
                  <ThemedText style={styles.mealRowMeta}>
                    {todayMeals.length} suggested {todayMeals.length === 1 ? 'meal' : 'meals'} for today
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.blue600} />
              </TouchableOpacity>
            )}

          </View>
        )}

        {/* ─── UP NEXT — Beta #012. Once today's actionable work is resolved,
              promote the chronologically next unresolved planned activity so
              the user can book / prepare. Placed after Today's Meals: today's
              plan + fuel come first, then "what to prepare for next".
              Presentation only — reuses the same ActivityFulfilmentCard with
              the activity's real future planned_date so supply/bookings are
              for the right day (§11/§12). A scheduled next-week plan (Beta
              #001) shows as a read-only preview linking to /next-week-plan
              (§17). ─── */}
        {!isGuest && homeIntelLoaded && homeUpcomingRef && (
          <View style={styles.section}>
            <View style={[styles.sectionPad, { marginBottom: 12 }]}>
              <Eyebrow text="Up next" />
              <SectionHeader
                title={homeUpcomingRef.dateLabel}
                onSeeAll={() => router.push((homeUpcomingRef.fromScheduled ? '/next-week-plan' : '/weekly-plan') as any)}
                seeAllLabel="View plan"
              />
              {homeUpcomingRef.restTomorrow && (
                <ThemedText style={styles.upNextRestNote}>
                  Tomorrow is a rest day — recovery is part of your plan.
                </ThemedText>
              )}
            </View>
            <View style={styles.mealsList}>
              {(() => {
              const next = homeUpcomingRef.activity;
              const upNextFallbackMedia = CATEGORY_FALLBACK_MEDIA[next.category];
              const hasUpNextMedia = (!!upNextMediaUrl || !!upNextFallbackMedia) && !homeUpcomingRef.fromScheduled;
              return (
              <View style={[styles.todayPlanCard, hasUpNextMedia && styles.todayPlanCardMedia]}>
                {hasUpNextMedia && (
                  <>
                    {upNextMediaUrl
                      ? <ExerciseMedia url={upNextMediaUrl} fit="cover" style={styles.todayPlanMedia} />
                      : <Image source={upNextFallbackMedia} style={styles.todayPlanMedia} resizeMode="cover" />}
                    <LinearGradient
                      colors={['rgba(9,11,20,0.42)', 'rgba(9,11,20,0.82)']}
                      style={styles.todayPlanScrim}
                      pointerEvents="none"
                    />
                  </>
                )}
                <View style={hasUpNextMedia ? styles.todayPlanContentMedia : undefined}>
                  <ThemedText style={[styles.todayPlanCategory, hasUpNextMedia && styles.todayPlanCategoryOnMedia]}>
                    {CATEGORY_LABEL[next.category]}
                  </ThemedText>
                  <ThemedText style={[styles.mealRowTitle, hasUpNextMedia && styles.todayPlanTitleOnMedia]}>{next.title}</ThemedText>
                  <ThemedText style={[styles.mealRowMeta, hasUpNextMedia && styles.todayPlanMetaOnMedia]}>
                    {next.activity} · {next.duration_minutes} min
                  </ThemedText>
                  {homeUpcomingRef.fromScheduled ? (
                    <TouchableOpacity onPress={() => router.push('/next-week-plan' as any)} activeOpacity={0.7} style={{ marginTop: 10 }}>
                      <ThemedText style={styles.todayPlanCta}>Review next week&apos;s plan →</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <ActivityFulfilmentCard
                      userId={userId}
                      activity={next}
                      fulfilment={upcomingFulfilmentGated ?? undefined}
                      onInfoPress={() => setShowIntelligenceInfo(true)}
                      onDark={hasUpNextMedia}
                      gymAccessSlot="detached"
                      onResolved={(r) => { setUpNextWorkoutId(r.sessionId); setUpNextGymAccess(r.gymAccess); }}
                      planContext={homeUpcomingRef.planId ? {
                        planId: homeUpcomingRef.planId,
                        activityIndex: homeUpcomingRef.activityIndex,
                        plannedDate: homeUpcomingRef.dateIso,
                      } : undefined}
                      emptyFallback={
                        <TouchableOpacity onPress={() => router.push('/weekly-plan' as any)} activeOpacity={0.7} style={{ marginTop: 10 }}>
                          <ThemedText style={[styles.todayPlanCta, hasUpNextMedia && styles.todayPlanTextOnMedia]}>View this week&apos;s plan →</ThemedText>
                        </TouchableOpacity>
                      }
                    />
                  )}
                </View>
              </View>
              ); })()}
            </View>
          </View>
        )}

        {/* ─── Up next · Need a gym? — the upcoming activity's gym-access
              matches, on white, below the video-backed card (never over it). ─── */}
        {!isGuest && homeIntelLoaded && marketAvailable && upNextGymAccess.length > 0 && (
          <View style={styles.section}>
            <View style={styles.mealsList}>
              <GymAccessList matches={upNextGymAccess} />
            </View>
          </View>
        )}

        {/* ─── Beta Feedback #001 — Plan ahead for next week. Its own card,
              placed under Today's Meals; only on the Sunday planning window.
              Routes to the dedicated /next-week-plan screen. ─── */}
        {!isGuest && homeSundayPlanning && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.nextWeekHomeCard}
              onPress={() => router.push('/next-week-plan' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Plan ahead for next week"
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.nextWeekHomeEyebrow}>YOUR NEXT WEEK</ThemedText>
                <ThemedText style={styles.nextWeekHomeTitle}>Plan ahead for next week</ThemedText>
                <ThemedText style={styles.nextWeekHomeBody}>
                  Review your upcoming training so you can organise your week and book any sessions you need.
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray450} />
            </TouchableOpacity>
          </View>
        )}

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

      {/* Reuses the exact ACP Intelligence™ tooltip copy from onboarding/plan.tsx and my-plan.tsx — one definition, not a competing one. */}
      <Modal visible={showIntelligenceInfo} transparent animationType="fade" onRequestClose={() => setShowIntelligenceInfo(false)}>
        <TouchableOpacity style={styles.intelligenceTooltipOverlay} activeOpacity={1} onPress={() => setShowIntelligenceInfo(false)}>
          <View style={styles.intelligenceTooltipCard}>
            <ThemedText style={styles.intelligenceTooltipTitle}>Lana</ThemedText>
            <ThemedText style={styles.intelligenceTooltipBody}>
              Lana is the coaching intelligence that personalises your fitness and nutrition plan,
              learns from your progress, and adapts what to do next based on what works for you.
            </ThemedText>
            <TouchableOpacity style={styles.intelligenceTooltipCloseBtn} onPress={() => setShowIntelligenceInfo(false)} activeOpacity={0.85}>
              <ThemedText style={styles.intelligenceTooltipCloseText}>Got it</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showNotifications} transparent animationType="fade" onRequestClose={() => setShowNotifications(false)}>
        <TouchableOpacity style={styles.intelligenceTooltipOverlay} activeOpacity={1} onPress={() => setShowNotifications(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.notificationsCard} onPress={() => {}}>
            <ThemedText style={styles.intelligenceTooltipTitle}>Notifications</ThemedText>
            {homeNotifications.length === 0 ? (
              <ThemedText style={styles.intelligenceTooltipBody}>You&apos;re all caught up.</ThemedText>
            ) : (
              <View style={{ marginTop: 8 }}>
                {homeNotifications.map(n => (
                  <TouchableOpacity
                    key={n.key}
                    style={styles.notificationRow}
                    activeOpacity={0.7}
                    onPress={() => { setShowNotifications(false); n.onPress(); }}
                  >
                    <View style={styles.notificationIconWrap}>
                      <Ionicons name={n.icon as any} size={18} color={palette.blue600} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.notificationRowTitle}>{n.title}</ThemedText>
                      <ThemedText style={styles.mealRowMeta}>{n.body}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.intelligenceTooltipCloseBtn} onPress={() => setShowNotifications(false)} activeOpacity={0.85}>
              <ThemedText style={styles.intelligenceTooltipCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  headerBellDot: {
    position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4,
    backgroundColor: palette.danger500, borderWidth: 1.5, borderColor: palette.white,
  },
  headerGreeting: { fontSize: fontSize.base, color: palette.gray450, fontWeight: '500' },
  headerName: { fontSize: 30, fontWeight: '800', paddingTop:10, color: palette.ink900, letterSpacing: -0.5 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  headerAvatarFallback: { backgroundColor: palette.blue500, alignItems: 'center', justifyContent: 'center' },
  headerAvatarInitial: { fontSize: fontSize.lg, fontWeight: '700', color: palette.white },

  // Goal status banner (right after header, before mood check-in)
  goalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 20, marginTop: 16, marginBottom: 0, backgroundColor: 'transparent',
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.blue100,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  goalBannerIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blue100,
    alignItems: 'center', justifyContent: 'center',
  },
  goalBannerTitle: { fontSize: 14, fontWeight: '800', color: palette.blue600 },
  goalBannerSub: { fontSize: 12, color: palette.blue500, marginTop: 2, lineHeight: 16 },

  // ACP Intelligence™ — sits directly under the "Today's Focus" title, no
  // card treatment at all (no background, no border) — reads as part of the
  // section rather than a separate boxed element.
  intelligenceInline: { marginTop: 12 },
  intelligenceCardHeadline: { fontSize: 15, fontWeight: '800', color: palette.ink900, letterSpacing: -0.2, marginBottom: 4 },
  intelligenceCardBody: { fontSize: 13, color: palette.ink600, lineHeight: 18 },

  intelligenceTooltipOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  intelligenceTooltipCard: { backgroundColor: palette.white, borderRadius: radii.xl, padding: 22, maxWidth: 340 },
  intelligenceTooltipTitle: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink700, marginBottom: 8 },
  intelligenceTooltipBody: { fontSize: fontSize.sm, color: palette.ink600, lineHeight: 20 },
  intelligenceTooltipCloseBtn: {
    marginTop: 18, alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radii.pill, backgroundColor: palette.surfaceMuted,
  },
  intelligenceTooltipCloseText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },

  // Notifications panel (bell icon)
  notificationsCard: { backgroundColor: palette.white, borderRadius: radii.xl, padding: 22, width: 320 },
  notificationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  notificationIconWrap: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: palette.blue50,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notificationRowTitle: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },

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

  // Guest hero
  guestHero: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 8 },
  guestHeadline: { fontSize: 30, fontWeight: '800', color: palette.ink900, lineHeight: 37, marginBottom: 12, letterSpacing: -0.5 },
  guestSub: { fontSize: fontSize.base, color: palette.gray450, lineHeight: 22 },

  // Section layout
  section: { marginTop: 20 },
  sectionPad: { paddingHorizontal: 20, marginBottom: 16, },
  todaysFocusCard: {
    backgroundColor: palette.white,
    borderRadius: radii['2xl'],
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  nextWeekHomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.white,
    borderRadius: radii['2xl'],
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  nextWeekHomeEyebrow: { fontSize: 10, fontWeight: '700', color: palette.blue600, letterSpacing: 0.5, marginBottom: 4 },
  nextWeekHomeTitle: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900, marginBottom: 4 },
  nextWeekHomeBody: { fontSize: fontSize.sm, color: palette.ink600, lineHeight: 19 },
  railPad: { paddingHorizontal: 20, gap: 14, paddingBottom: 4 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, textTransform: 'uppercase', marginBottom: 5 },
  sectionTitle: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, letterSpacing: -0.5 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seeAllText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue500 },
  todaysMealsTitle: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900, letterSpacing: -0.2 },
  todaysMealsCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    marginHorizontal: 20,
    padding: 16,
  },

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

  // Combined goal rings (Steps / Water / Exercises — "For this day")
  ringsCombinedRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 4, paddingBottom: 8 },
  ringsLegend: { flex: 1, gap: 10 },
  ringsLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ringsLegendDot: { width: 10, height: 10, borderRadius: 5 },
  ringsLegendLabel: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700, lineHeight: fontSize.sm },
  ringsLegendSubtitle: { fontSize: 11, color: palette.gray450, marginTop: 2, lineHeight: 12 },
  ringsLegendValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  ringsLegendValue: { fontSize: fontSize.xl, fontWeight: '800', color: palette.ink900 },
  ringsLegendGoal: { fontSize: fontSize.xs, color: palette.gray450, marginLeft: 2 },

  // Today's Meals
  mealsList: { paddingHorizontal: 20, gap: 8 },
  mealRowTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  mealRowMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  // Today's Plan — same white-card language as the (now CTA-only) meals
  // section, just laid out vertically since it has no thumbnail image.
  todayPlanCard: {
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline, padding: 14,
  },
  // With an exercise-media background the whole card is the media surface:
  // video + scrim fill it edge-to-edge, and every row (title, "YOUR WORKOUT
  // · N min", "NEED A GYM?") sits on top in light text.
  todayPlanCardMedia: { padding: 0, overflow: 'hidden', position: 'relative' },
  todayPlanMedia: { ...StyleSheet.absoluteFillObject },
  todayPlanScrim: { ...StyleSheet.absoluteFillObject },
  todayPlanContentMedia: { padding: 14, minHeight: 148 },
  todayPlanCategoryOnMedia: { color: 'rgba(255,255,255,0.82)', marginBottom: 100 },
  todayPlanTitleOnMedia: { color: '#fff', fontSize: 16 },
  todayPlanMetaOnMedia: { color: 'rgba(255,255,255,0.82)' },
  todayPlanTextOnMedia: { color: '#fff' },
  todayPlanCategory: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  todayPlanCompletedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  todayPlanCompletedText: { fontSize: 11, fontWeight: '800', color: palette.success700, letterSpacing: 0.5, textTransform: 'uppercase' },
  todayPlanCta: { fontSize: 13, fontWeight: '700', color: palette.blue600 },
  upNextRestNote: { fontSize: 12.5, color: palette.gray450, marginTop: 6, lineHeight: 17 },
  // Fulfilment blocks — identical shape/copy conventions to My Plan's, so
  // "do it yourself" / "do it with ACP" read the same on both screens.
  fulfilmentBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline },
  fulfilmentHeader: {
    fontSize: 10, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  fulfilmentHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  fulfilmentLink: { fontSize: fontSize.xs, fontWeight: '700', color: palette.ink700 },
  aiBody: { fontSize: fontSize.sm, color: palette.ink600, marginTop: 6, lineHeight: 20 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline },
  marketplaceMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 8 },
  marketplaceMatchRowBorder: { borderBottomWidth: 1, borderBottomColor: palette.hairline },
  marketplaceMatchImage: { width: 56, height: 56, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  // Candidate-confirmation banner — identical shape/copy conventions to
  // My Plan's, so a synced signal reads the same on both screens.
  candidateBanner: { marginTop: 10, padding: 12, borderRadius: radii.lg, backgroundColor: palette.blue100 },
  candidateText: { fontSize: fontSize.xs, color: palette.ink700, lineHeight: 17 },
  candidateActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  candidateConfirm: { fontSize: fontSize.xs, fontWeight: '700', color: palette.blue600 },
  candidateDismiss: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray450 },
  mealImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  // Stacked-style body (shared with OverlayCard)
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

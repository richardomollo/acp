import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - 48) / 7);

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Gym {
  id: string;
  name: string;
  location: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  image_url: string | null;
  rating: number | null;
  deposit_pct: number | null;
}

interface Session {
  id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  drop_in_price: number | null;
  max_capacity: number;
  spots_left: number;
  image_url: string | null;
  category: string | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  yoga: 'leaf-outline', pilates: 'body-outline', hiit: 'flame-outline',
  cardio: 'heart-outline', strength: 'barbell-outline', weights: 'barbell-outline',
  weightlifting: 'barbell-outline', boxing: 'hand-left-outline', kickboxing: 'hand-left-outline',
  spinning: 'bicycle-outline', cycling: 'bicycle-outline', dance: 'musical-notes-outline',
  zumba: 'musical-notes-outline', swimming: 'water-outline', aqua: 'water-outline',
  crossfit: 'barbell-outline', bootcamp: 'flag-outline', meditation: 'flower-outline',
  mobility: 'body-outline', stretching: 'body-outline', barre: 'body-outline',
  martial: 'shield-outline', kids: 'happy-outline',
};
const categoryIcon = (cat: string | null) =>
  cat ? (CATEGORY_ICONS[cat.toLowerCase()] ?? 'apps-outline') : 'apps-outline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (t: string) => {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return t; }
};

const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return d; }
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function GymDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const gymId = params.gymId as string;

  const [gym, setGym] = useState<Gym | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calSelected, setCalSelected] = useState(today.toISOString().split('T')[0]);
  const [calVisible, setCalVisible] = useState(false);

  const gymImages = useMemo(() => {
    if (!gym?.image_url) return [];
    return gym.image_url.includes(',')
      ? gym.image_url.split(',').map(u => u.trim()).filter(Boolean)
      : [gym.image_url];
  }, [gym]);

  const sessionDates = useMemo(() => new Set(sessions.map(s => s.date)), [sessions]);

  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const offset = (firstDay + 6) % 7;
    return { offset, daysInMonth };
  }, [calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const filteredSessions = useMemo(() =>
    sessions.filter(s => s.date === calSelected),
    [sessions, calSelected],
  );

  useEffect(() => {
    if (!gymId) { setError('No gym ID provided'); setLoading(false); return; }
    loadData();
  }, [gymId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: gymData, error: gymError } = await supabase
        .from('gyms').select('*').eq('id', gymId).single();
      if (gymError) throw gymError;
      setGym(gymData);

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions').select('*').eq('gym_id', gymId)
        .order('date', { ascending: true }).order('time', { ascending: true });
      if (sessionsError) console.error('Sessions error:', sessionsError);
      setSessions(sessionsData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load gym details');
      Alert.alert('Error', err.message || 'Failed to load gym details');
    } finally {
      setLoading(false);
    }
  };

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (error || !gym) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={56} color={palette.gray200} />
        <ThemedText style={styles.errorText}>{error || 'Gym not found'}</ThemedText>
        <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
          <ThemedText style={styles.errorBtnText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const sessionDeposit = (s: Session) => {
    const total = Number(s.drop_in_price) || 0;
    const pct     = gym?.deposit_pct ?? 30;
    const deposit = total ? Math.round(total * pct / 100) : null;
    const balance = total && deposit ? total - deposit : null;
    return { deposit, balance };
  };

  const spotsChip = (s: Session): { label: string; variant: 'open' | 'ok' | 'low' } => {
    const left = s.spots_left;
    const label = left === 0 ? 'Full' : left <= 5 ? `${left} left` : `${left} spots`;
    const variant = left === 0 || left <= 5 ? 'low' : left === s.max_capacity ? 'open' : 'ok';
    return { label, variant };
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Gallery hero ── */}
        <View style={styles.hero}>
          {gymImages.length > 0 ? (
            <>
              <Image
                source={{ uri: gymImages[currentImageIndex] }}
                style={styles.heroImage}
                contentFit="cover"
              />
              <View style={styles.heroOverlay} />

              {/* Prev / Next */}
              {gymImages.length > 1 && (
                <>
                  <TouchableOpacity
                    style={[styles.navBtn, styles.navLeft]}
                    onPress={() => setCurrentImageIndex(i => (i === 0 ? gymImages.length - 1 : i - 1))}
                  >
                    <Ionicons name="chevron-back" size={22} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navBtn, styles.navRight]}
                    onPress={() => setCurrentImageIndex(i => (i === gymImages.length - 1 ? 0 : i + 1))}
                  >
                    <Ionicons name="chevron-forward" size={22} color={palette.white} />
                  </TouchableOpacity>

                  {/* Dot indicators */}
                  <View style={styles.dots}>
                    {gymImages.map((_, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.dot, i === currentImageIndex && styles.dotActive]}
                        onPress={() => setCurrentImageIndex(i)}
                      />
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="fitness" size={64} color="rgba(255,255,255,0.4)" />
            </View>
          )}

          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={palette.white} />
          </TouchableOpacity>
        </View>

        {/* ── Content card ── */}
        <View style={styles.card}>

          {/* Name + rating */}
          <View style={styles.nameRow}>
            <ThemedText style={styles.gymName}>{gym.name}</ThemedText>
            {gym.rating !== null && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={13} color={palette.warning500} />
                <ThemedText style={styles.ratingText}>{gym.rating.toFixed(1)}</ThemedText>
              </View>
            )}
          </View>

          {/* Location */}
          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color={palette.blue500} />
            <ThemedText style={styles.locationText}>{gym.location}</ThemedText>
          </View>

          {/* Description */}
          {gym.description ? (
            <ThemedText style={styles.description}>{gym.description}</ThemedText>
          ) : null}


          {/* ── Sessions section ── */}
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Classes offered</ThemedText>
            <View style={styles.sectionActions}>
              <ThemedText style={styles.sessionCount}>
                {filteredSessions.length} {filteredSessions.length === 1 ? 'class' : 'classes'}
              </ThemedText>
              <TouchableOpacity
                style={[styles.calToggleBtn, calVisible && styles.calToggleBtnActive]}
                onPress={() => setCalVisible(v => !v)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={16} color={calVisible ? palette.white : palette.gray450} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Calendar */}
          {calVisible && (() => {
            const todayStr = today.toISOString().split('T')[0];
            const { offset, daysInMonth } = calDays;
            const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
            while (cells.length % 7 !== 0) cells.push(null);
            return (
              <View style={styles.calendarWrapper}>
                <View style={styles.calHeader}>
                  <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
                    <Ionicons name="chevron-back" size={20} color={palette.ink900} />
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
                    const isSelected = dateStr === calSelected;
                    const isToday = dateStr === todayStr;
                    const hasSession = sessionDates.has(dateStr);
                    return (
                      <TouchableOpacity
                        key={dateStr}
                        style={[styles.calCell, isSelected && styles.calCellSelected, isToday && !isSelected && styles.calCellToday]}
                        onPress={() => setCalSelected(dateStr)}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={[styles.calDayText, isSelected && styles.calDayTextSelected, isToday && !isSelected && styles.calDayTextToday]}>
                          {day}
                        </ThemedText>
                        {hasSession && <View style={[styles.calDot, isSelected && styles.calDotSelected]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.calDivider} />
              </View>
            );
          })()}

          {/* Session list */}
          {filteredSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={palette.gray200} />
              <ThemedText style={styles.emptyText}>No classes for this day</ThemedText>
              <ThemedText style={styles.emptySubText}>Try a different date or clear the filter</ThemedText>
            </View>
          ) : (
            filteredSessions.map(session => {
              const { deposit, balance } = sessionDeposit(session);
              const spots = spotsChip(session);
              const spotsBg   = spots.variant === 'open' ? palette.blue25  : spots.variant === 'ok' ? palette.success50  : palette.danger50;
              const spotsColor = spots.variant === 'open' ? palette.blue500 : spots.variant === 'ok' ? palette.success700 : palette.danger600;
              const spotsIcon  = spots.variant === 'open' ? 'radio-button-on-outline' : spots.variant === 'ok' ? 'checkmark-circle-outline' : 'time-outline';

              return (
                <TouchableOpacity
                  key={session.id}
                  style={styles.sessionRow}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/session-details', params: { sessionId: session.id } })}
                >
                  {/* Thumbnail */}
                  <View style={styles.sessionThumb}>
                    {session.image_url ? (
                      <Image source={{ uri: session.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFillObject, styles.sessionThumbFallback]}>
                        <Ionicons name={categoryIcon(session.category) as any} size={22} color="rgba(255,255,255,0.9)" />
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.sessionInfo}>
                    <View style={styles.sessionBadges}>
                      <View style={styles.catChip}>
                        <Ionicons name={categoryIcon(session.category) as any} size={11} color={palette.gray450} />
                        <ThemedText style={styles.catChipText}>{session.category || 'Class'}</ThemedText>
                      </View>
                      <View style={[styles.spotsChip, { backgroundColor: spotsBg }]}>
                        <Ionicons name={spotsIcon as any} size={11} color={spotsColor} />
                        <ThemedText style={[styles.spotsChipText, { color: spotsColor }]}>{spots.label}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.sessionName} numberOfLines={1}>{session.name}</ThemedText>
                    <View style={styles.sessionMeta}>
                      <Ionicons name="time-outline" size={12} color={palette.gray450} />
                      <ThemedText style={styles.metaText}>
                        {formatTime(session.time)} · {session.duration_minutes}m
                      </ThemedText>
                    </View>
                  </View>

                  {/* Price */}
                  {deposit != null && (
                    <View style={styles.sessionPrice}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <ThemedText style={styles.depositAmount}>KES {deposit.toLocaleString()}</ThemedText>
                        <ThemedText style={styles.depositLabel}>dep.</ThemedText>
                      </View>
                      {balance != null && balance > 0 && (
                        <ThemedText style={styles.depositBalance}>+{balance.toLocaleString()} at venue</ThemedText>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 20 },

  errorText: { fontSize: fontSize.lg, color: palette.gray450, textAlign: 'center', marginTop: 8 },
  errorBtn: { backgroundColor: palette.ink900, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 25, marginTop: 4 },
  errorBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '600' },

  // Hero
  hero: { height: 320, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { backgroundColor: palette.blue500, justifyContent: 'center', alignItems: 'center' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },

  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },

  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  navLeft: { left: 12 },
  navRight: { right: 12 },

  dots: {
    position: 'absolute',
    bottom: 36,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 18, backgroundColor: palette.white },

  // Content card
  card: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    marginTop: -24,
    padding: 24,
  },

  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  gymName: { fontSize: fontSize['2xl'], fontWeight: 'bold', color: palette.ink900, flex: 1, marginRight: 12 },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fef9c3', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.xl,
  },
  ratingText: { fontSize: fontSize.sm, fontWeight: '700', color: '#92400e' }, // amber - no palette match

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  locationText: { fontSize: fontSize.base, color: palette.gray450 },

  description: { fontSize: fontSize.base, color: palette.gray450, lineHeight: 22, marginBottom: 16 },

  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  contactPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue50, borderRadius: radii.xl,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  contactText: { fontSize: fontSize.sm, color: palette.blue500, fontWeight: '500' },

  // Sessions section
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
    borderTopWidth: 1, borderTopColor: palette.hairline, paddingTop: 24,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionCount: { fontSize: fontSize.sm, color: palette.gray300 },
  calToggleBtn: {
    width: 32, height: 32, borderRadius: radii.sm,
    backgroundColor: palette.hairline, alignItems: 'center', justifyContent: 'center',
  },
  calToggleBtnActive: { backgroundColor: palette.ink900 },

  // Calendar
  calendarWrapper: { marginBottom: 4 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
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
  calDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.blue500, marginTop: 2 },
  calDotSelected: { backgroundColor: palette.white },
  calDivider: { height: 1, backgroundColor: palette.hairline, marginTop: 16, marginBottom: 20 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '600', color: palette.gray450 },
  emptySubText: { fontSize: fontSize.sm, color: palette.gray300, textAlign: 'center' },

  // Session row (RowCard style)
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  sessionThumb: {
    width: 84, height: 84, borderRadius: radii.md, overflow: 'hidden',
    flexShrink: 0,
  },
  sessionThumbFallback: {
    backgroundColor: palette.blue500, justifyContent: 'center', alignItems: 'center',
  },

  sessionInfo: { flex: 1, gap: 4 },
  sessionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.surfaceMuted, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
    flexShrink: 1,
  },
  catChipText: { fontSize: 11, fontWeight: '500', color: palette.gray450, textTransform: 'capitalize', flexShrink: 1 },
  spotsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
  },
  spotsChipText: { fontSize: 11, fontWeight: '600' },
  sessionName: { fontSize: 15.5, fontWeight: '700', color: palette.ink900 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: fontSize.xs, color: palette.gray450 },

  sessionPrice: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  depositAmount: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900 },
  depositLabel: { fontSize: 10, color: palette.gray300, fontWeight: '500' },
  depositBalance: { fontSize: 10, color: palette.gray300 },
});

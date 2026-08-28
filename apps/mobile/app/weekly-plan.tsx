// This Week's Plan — a lighter, calendar-first view of the same ACP
// Intelligence™ weekly plan My Plan already shows (fitness_profile.ai_assessment
// .starting_plan.activities). Reached from Home's "Today's Plan" card.
// Fulfilment suggestions (DO IT YOURSELF / "Recommended for you" marketplace
// matches) are shown here too, same as My Plan — only synced-activity
// candidate banners (Strava/ExerciseDB/ACP-booking auto-match confirmation)
// are left out; mark done/undo stays the only completion action here.
import { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { getStravaStatus } from '@/services/strava';
import {
  isValidAssessment, deriveCategoryCounts, CATEGORY_LABEL,
  type AIAssessment, type ActivityCategory, type StartingPlanActivity,
} from '@/lib/ai-assessment';
import {
  nextDateForWeekday, getFulfilmentForActivity,
  type PlanActivityFulfilment, type MarketplaceInventoryItem,
} from '@/lib/fulfilment';
import { getCompletionProgress, type PlanActivityCompletion } from '@/lib/completion';
import { palette, radii, fontSize } from '@/constants/theme';

// A calendar week always has all 7 days, even when the plan itself only
// lists a handful of planned activities — days with nothing planned render
// as a "Rest day" rather than being omitted from the strip/list entirely.
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// Monday of the calendar week containing `anchor` — only ever used as a
// fallback for a legacy plan with no starting_plan.week_start_date; same
// local-Date convention as nextDateForWeekday (lib/fulfilment.ts).
function mondayOfWeek(anchor: Date): string {
  const day = anchor.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

// Same fixed values Home uses for its own Steps/Water goal rings
// (`app/(tabs)/index.tsx`) — Sleep is deliberately not included here: ACP
// tracks health_daily_stats.sleep_hours but has no goal/threshold defined
// anywhere in the app today (Home's own Sleep ring doesn't even render).
const STEPS_GOAL = 8000;
const WATER_GOAL = 8;

const WEEKDAY_SHORT: Record<string, string> = {
  monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su',
};

const CATEGORY_ICON: Record<ActivityCategory, string> = {
  strength: 'barbell-outline',
  cardio: 'walk-outline',
  recovery: 'leaf-outline',
  mobility: 'body-outline',
  sport: 'football-outline',
};

interface DailyStat { date: string; steps: number; waterCups: number }
interface WeekDay {
  date: string;
  dayName: string;
  shortLabel: string;
  dateNum: number;
  activity: StartingPlanActivity | null;
  activityIndex: number | null;
}

/** Same "DO IT YOURSELF" / "RECOMMENDED FOR YOU" blocks as My Plan/Home, reused here for every planned day, not just today. */
function FulfilmentSuggestions({
  fulfilment, onInfoPress,
}: { fulfilment: PlanActivityFulfilment | undefined; onInfoPress: () => void }) {
  const router = useRouter();
  if (!fulfilment) return null;
  return (
    <>
      {fulfilment.selfDirected && (
        <View style={s.fulfilmentBlock}>
          <ThemedText style={s.fulfilmentHeader}>
            {fulfilment.selfDirected.source === 'exercise_db' ? 'DO IT YOURSELF' : 'TRACK YOUR ACTIVITY'}
          </ThemedText>
          <TouchableOpacity onPress={() => router.push(fulfilment.selfDirected!.navigationTarget as any)} activeOpacity={0.7}>
            <ThemedText style={s.fulfilmentLink}>{fulfilment.selfDirected.title} →</ThemedText>
          </TouchableOpacity>
        </View>
      )}
      {fulfilment.marketplaceMatches.length > 0 && (
        <View style={s.fulfilmentBlock}>
          <View style={s.fulfilmentHeaderRow}>
            <ThemedText style={[s.fulfilmentHeader, { marginBottom: 0 }]}>DO IT WITH ACP</ThemedText>
            <TouchableOpacity onPress={onInfoPress} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="information-circle-outline" size={12} color={palette.gray300} />
            </TouchableOpacity>
          </View>
          {fulfilment.marketplaceMatches.map(m => (
            <TouchableOpacity key={m.id} style={s.marketplaceMatchRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
              {m.imageUrl ? (
                <Image source={{ uri: m.imageUrl }} style={s.marketplaceMatchImage} />
              ) : (
                <View style={[s.marketplaceMatchImage, s.marketplaceMatchImageFallback]}>
                  <Ionicons name={m.type === 'experience' ? 'sparkles-outline' : 'barbell-outline'} size={20} color={palette.gray300} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={s.dayTitle}>{m.title}</ThemedText>
                <ThemedText style={s.dayMeta}>
                  {m.isAlternateDay ? 'Available on ACP · ' : ''}
                  {new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}
                  {m.startTime ? ` · ${m.startTime.slice(0, 5)}` : ''}
                  {m.priceKes != null ? ` · KES ${m.priceKes.toLocaleString()}` : ''}
                </ThemedText>
              </View>
              <ThemedText style={s.fulfilmentLink}>View activity →</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

function StreakRow({
  icon, label, days, values, goal, first,
}: { icon: string; label: string; days: WeekDay[]; values: number[]; goal: number; first?: boolean }) {
  return (
    <View style={[s.streakRow, first && { borderTopWidth: 0 }]}>
      <View style={s.streakLabelCol}>
        <Ionicons name={icon as any} size={16} color={palette.gray450} />
        <ThemedText style={s.streakLabel}>{label}</ThemedText>
      </View>
      <View style={s.streakDots}>
        {days.map((d, i) => {
          const met = (values[i] ?? 0) >= goal;
          return (
            <View key={d.date} style={s.streakDotCol}>
              <View style={[s.streakDot, met && s.streakDotDone]}>
                {met && <Ionicons name="checkmark" size={11} color={palette.white} />}
              </View>
              <ThemedText style={s.streakDayLabel}>{d.shortLabel.toLowerCase()}</ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function WeeklyPlanScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  const [completions, setCompletions] = useState<PlanActivityCompletion[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [stepsGoal, setStepsGoal] = useState(STEPS_GOAL);
  // Same fulfilment matching as My Plan/Home — deterministic, no AI call —
  // just self-directed (ExerciseDB/Strava) + real ACP marketplace matches
  // for each planned activity. No candidate-confirmation banners here.
  const [fulfilments, setFulfilments] = useState<PlanActivityFulfilment[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  // Week mode's day list is an accordion — at most one day's details open
  // at a time. Defaults to today, same as selectedDayIndex, but kept as its
  // own state so expanding a day in the list never changes what Day mode
  // (a separate view) is showing.
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(null);
  const [showIntelligenceInfo, setShowIntelligenceInfo] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user.id) {
        if (active) { setUserId(null); setAssessment(null); setLoading(false); }
        return;
      }
      if (active) setUserId(session.user.id);

      const { data } = await supabase
        .from('fitness_profile')
        .select('ai_assessment, ai_assessment_generated_at, trainer_daily_steps_goal, daily_steps_goal')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!active) return;

      // Old, pre-Day-2-shaped or otherwise invalid rows are treated as "no
      // plan yet" — same safety rule Home/My Plan already apply.
      if (!data?.ai_assessment || !isValidAssessment(data.ai_assessment) || !data.ai_assessment_generated_at) {
        setAssessment(null);
        setLoading(false);
        return;
      }

      const validAssessment = data.ai_assessment;
      const currentPlanId = data.ai_assessment_generated_at as string;
      setAssessment(validAssessment);
      setPlanId(currentPlanId);
      setStepsGoal(data.trainer_daily_steps_goal ?? data.daily_steps_goal ?? STEPS_GOAL);

      const anchor = new Date();
      const weekStartDate = validAssessment.starting_plan.week_start_date ?? mondayOfWeek(anchor);
      const weekDates = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStartDate, i));

      const todayIsoForInventory = anchor.toISOString().split('T')[0];
      const [{ data: completionsData }, { data: statsData }, { data: sessionsData }, { data: experiencesData }, stravaStatus] = await Promise.all([
        supabase
          .from('plan_activity_completions')
          .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
          .eq('user_id', session.user.id)
          .eq('plan_id', currentPlanId),
        supabase
          .from('health_daily_stats')
          .select('date, steps, water_cups')
          .eq('user_id', session.user.id)
          .in('date', weekDates),
        supabase
          .from('sessions')
          .select('id, name, category, date, time, duration_minutes, is_active, spots_left, image_url, drop_in_price, gyms(name)')
          .gte('date', todayIsoForInventory)
          .eq('is_active', true),
        supabase
          .from('experiences')
          .select('id, name, category, date, start_time, price_kes, is_active, spots_left, image_url, gyms(name)')
          .gte('date', todayIsoForInventory)
          .eq('is_active', true),
        getStravaStatus(), // never throws — resolves { connected: false } on failure
      ]);
      if (!active) return;

      setCompletions(((completionsData ?? []) as any[]).map(c => ({
        id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
        completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
      })));

      const statsByDate = new Map(((statsData ?? []) as any[]).map(row => [row.date, row]));
      setDailyStats(weekDates.map(date => ({
        date,
        steps: statsByDate.get(date)?.steps ?? 0,
        waterCups: statsByDate.get(date)?.water_cups ?? 0,
      })));

      const inventory: MarketplaceInventoryItem[] = [
        ...((sessionsData ?? []) as any[]).map(sRow => ({
          id: sRow.id, type: 'session' as const, name: sRow.name, category: sRow.category ?? null,
          date: sRow.date ?? null, startTime: sRow.time ?? null, durationMinutes: sRow.duration_minutes ?? null,
          gymName: sRow.gyms?.name ?? null, isActive: !!sRow.is_active, spotsLeft: sRow.spots_left ?? null,
          imageUrl: sRow.image_url ?? null, priceKes: sRow.drop_in_price ?? null,
        })),
        ...((experiencesData ?? []) as any[]).map(eRow => ({
          id: eRow.id, type: 'experience' as const, name: eRow.name, category: eRow.category ?? null,
          date: eRow.date ?? null, startTime: eRow.start_time ?? null, durationMinutes: null,
          gymName: eRow.gyms?.name ?? null, isActive: !!eRow.is_active, spotsLeft: eRow.spots_left ?? null,
          imageUrl: eRow.image_url ?? null, priceKes: eRow.price_kes ?? null,
        })),
      ];
      setFulfilments(
        validAssessment.starting_plan.activities.map((a, i) => getFulfilmentForActivity(a, i, inventory, stravaStatus.connected, anchor)),
      );

      const todayIso = todayIsoForInventory;
      const todayIndex = weekDates.indexOf(todayIso);
      setSelectedDayIndex(todayIndex >= 0 ? todayIndex : 0);

      // Default the Week-mode accordion open on today's day, but only if
      // today actually has a planned activity — a rest day has nothing to expand.
      const todayDayName = todayIndex >= 0 ? WEEKDAY_NAMES[todayIndex] : null;
      const todayHasActivity = !!todayDayName
        && validAssessment.starting_plan.activities.some(a => a.day.trim().toLowerCase() === todayDayName.toLowerCase());
      setExpandedDayIndex(todayHasActivity ? todayIndex : null);

      setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  // Same manual-completion shape as My Plan's recordCompletion/handleMarkDone
  // (`app/my-plan.tsx`) — no candidate matching here, this page never fetches
  // Strava/ExerciseDB/HealthKit/ACP-booking signals.
  const recordCompletion = async (activityIndex: number) => {
    if (!userId || !planId || !assessment) return;
    const activity = assessment.starting_plan.activities[activityIndex];
    const plannedDate = activity?.planned_date
      ?? (activity ? nextDateForWeekday(activity.day, new Date()) : null)
      ?? new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('plan_activity_completions')
      .insert({
        user_id: userId, plan_id: planId, activity_index: activityIndex,
        planned_date: plannedDate, completion_source: 'manual', source_entity_id: null,
      })
      .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
      .single();
    if (error || !data) return;
    setCompletions(prev => [...prev, {
      id: data.id, planId: data.plan_id, activityIndex: data.activity_index, plannedDate: data.planned_date,
      completedAt: data.completed_at, completionSource: data.completion_source, sourceEntityId: data.source_entity_id,
    }]);
  };

  const handleUndo = async (activityIndex: number) => {
    const existing = completions.find(c => c.activityIndex === activityIndex);
    if (!existing) return;
    const { error } = await supabase.from('plan_activity_completions').delete().eq('id', existing.id);
    if (error) return;
    setCompletions(prev => prev.filter(c => c.id !== existing.id));
  };

  const activities = assessment?.starting_plan.activities ?? [];
  const weekStartDate = assessment?.starting_plan.week_start_date ?? mondayOfWeek(new Date());
  const weekDays: WeekDay[] = WEEKDAY_NAMES.map((dayName, i) => {
    const date = addDaysIso(weekStartDate, i);
    const activityIndex = activities.findIndex(a => a.day.trim().toLowerCase() === dayName.toLowerCase());
    return {
      date,
      dayName,
      shortLabel: WEEKDAY_SHORT[dayName.toLowerCase()],
      dateNum: Number(date.split('-')[2]),
      activity: activityIndex >= 0 ? activities[activityIndex] : null,
      activityIndex: activityIndex >= 0 ? activityIndex : null,
    };
  });
  const todayIso = new Date().toISOString().split('T')[0];
  const categoryCounts = assessment ? deriveCategoryCounts(activities) : [];
  const progress = assessment ? getCompletionProgress(activities.length, completions) : { completed: 0, total: 0, percent: 0 };
  const completedIndexes = new Set(completions.map(c => c.activityIndex));
  const stepsByDay = dailyStats.map(d => d.steps);
  const waterByDay = dailyStats.map(d => d.waterCups);
  const selectedWeekDay = weekDays[selectedDayIndex];

  return (
    <View style={s.root}>
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={s.topFadeBg}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>This Week&apos;s Plan</ThemedText>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : !assessment ? (
        <View style={s.content}>
          <ThemedText style={s.emptyText}>No active plan yet.</ThemedText>
          <TouchableOpacity onPress={() => router.push('/my-plan' as any)} activeOpacity={0.7} style={{ alignSelf: 'center', marginTop: 12 }}>
            <ThemedText style={s.fulfilmentLink}>Go to My Plan →</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.toggleWrap}>
            <TouchableOpacity
              style={[s.toggleBtn, viewMode === 'day' && s.toggleBtnActive]}
              onPress={() => setViewMode('day')}
              activeOpacity={0.8}
            >
              <ThemedText style={[s.toggleText, viewMode === 'day' && s.toggleTextActive]}>Day</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, viewMode === 'week' && s.toggleBtnActive]}
              onPress={() => setViewMode('week')}
              activeOpacity={0.8}
            >
              <ThemedText style={[s.toggleText, viewMode === 'week' && s.toggleTextActive]}>Week</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={s.weekStrip}>
            {weekDays.map((d, i) => {
              const isToday = d.date === todayIso;
              const isSelected = i === selectedDayIndex && viewMode === 'day';
              const isDone = d.activityIndex !== null && completedIndexes.has(d.activityIndex);
              return (
                <TouchableOpacity
                  key={d.date}
                  style={[s.stripDay, isSelected && s.stripDaySelected]}
                  onPress={() => { setSelectedDayIndex(i); setViewMode('day'); }}
                  activeOpacity={0.7}
                >
                  <ThemedText style={[s.stripDayLabel, isToday && s.stripDayLabelToday]}>{d.shortLabel}</ThemedText>
                  <ThemedText style={[s.stripDayNum, isToday && s.stripDayNumToday]}>{d.dateNum}</ThemedText>
                  <View style={[s.stripDot, isDone && s.stripDotDone]} />
                </TouchableOpacity>
              );
            })}
          </View>

          {viewMode === 'week' ? (
            <>
              <View style={s.card}>
                <ThemedText style={s.cardEyebrow}>Week</ThemedText>
                <View style={s.progressBlock}>
                  <ThemedText style={s.progressLabel}>{progress.completed} of {progress.total} completed</ThemedText>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${progress.percent}%` }]} />
                  </View>
                </View>
                {categoryCounts.length > 0 && (
                  <View style={s.categoryRow}>
                    {categoryCounts.map(c => (
                      <View key={c.category} style={s.categoryItem}>
                        <View style={s.categoryIconWrap}>
                          <Ionicons name={(CATEGORY_ICON[c.category] ?? 'ellipse-outline') as any} size={18} color={palette.ink700} />
                        </View>
                        <ThemedText style={s.categoryCount}>{c.count}</ThemedText>
                        <ThemedText style={s.categoryLabel}>{c.label}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={s.card}>
                <ThemedText style={s.cardEyebrow}>Day</ThemedText>
                {weekDays.map((d, i) => {
                  const done = d.activityIndex !== null && completedIndexes.has(d.activityIndex);
                  const isExpanded = expandedDayIndex === i;
                  return (
                    <View key={d.date} style={[s.dayRow, i === weekDays.length - 1 && s.dayRowLast]}>
                      <TouchableOpacity
                        style={s.dayAccordionHeader}
                        onPress={() => d.activity && setExpandedDayIndex(isExpanded ? null : i)}
                        activeOpacity={d.activity ? 0.7 : 1}
                        disabled={!d.activity}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={s.dayAccordionTopRow}>
                            <ThemedText style={s.dayName}>{d.dayName}</ThemedText>
                            {!d.activity && <ThemedText style={s.restDayText}>Rest day</ThemedText>}
                            {d.activity && done && <Ionicons name="checkmark-circle" size={14} color={palette.success700} />}
                          </View>
                          {d.activity && (
                            <View style={s.dayAccordionSubRow}>
                              <View style={s.dayCategoryPill}>
                                <ThemedText style={s.dayCategoryText}>{CATEGORY_LABEL[d.activity.category]}</ThemedText>
                              </View>
                              <ThemedText style={[s.dayTitle, { flex: 1 }, done && !isExpanded && { color: palette.gray300 }]} numberOfLines={1}>
                                {d.activity.title}
                              </ThemedText>
                            </View>
                          )}
                        </View>
                        {d.activity && (
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={palette.gray300} />
                        )}
                      </TouchableOpacity>

                      {isExpanded && d.activity && (
                        <View style={{ marginTop: 10 }}>
                          {done && (
                            <View style={s.completedRow}>
                              <Ionicons name="checkmark-circle" size={14} color={palette.success700} />
                              <ThemedText style={s.completedText}>COMPLETED</ThemedText>
                            </View>
                          )}
                          <ThemedText style={s.dayMeta}>{d.activity.activity} · {d.activity.duration_minutes} min</ThemedText>
                          {done ? (
                            <TouchableOpacity onPress={() => handleUndo(d.activityIndex!)} activeOpacity={0.7} style={{ marginTop: 8 }}>
                              <ThemedText style={s.undoLink}>Undo</ThemedText>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={s.markDoneBtn} onPress={() => recordCompletion(d.activityIndex!)} activeOpacity={0.85}>
                              <ThemedText style={s.markDoneBtnText}>Mark as done</ThemedText>
                            </TouchableOpacity>
                          )}
                          <FulfilmentSuggestions fulfilment={fulfilments[d.activityIndex!]} onInfoPress={() => setShowIntelligenceInfo(true)} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={s.card}>
              <ThemedText style={s.cardEyebrow}>{selectedWeekDay.dayName}</ThemedText>
              {selectedWeekDay.activity ? (
                <>
                  {selectedWeekDay.activityIndex !== null && completedIndexes.has(selectedWeekDay.activityIndex) ? (
                    <View style={s.completedRow}>
                      <Ionicons name="checkmark-circle" size={15} color={palette.success700} />
                      <ThemedText style={s.completedText}>{CATEGORY_LABEL[selectedWeekDay.activity.category]} completed</ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={s.dayCategoryLarge}>{CATEGORY_LABEL[selectedWeekDay.activity.category]}</ThemedText>
                  )}
                  <ThemedText style={s.dayTitleLarge}>{selectedWeekDay.activity.title}</ThemedText>
                  <ThemedText style={s.dayMeta}>{selectedWeekDay.activity.activity} · {selectedWeekDay.activity.duration_minutes} min</ThemedText>
                  <ThemedText style={s.dayDesc}>{selectedWeekDay.activity.description}</ThemedText>
                  {selectedWeekDay.activityIndex !== null && completedIndexes.has(selectedWeekDay.activityIndex) ? (
                    <TouchableOpacity onPress={() => handleUndo(selectedWeekDay.activityIndex!)} activeOpacity={0.7} style={{ marginTop: 12 }}>
                      <ThemedText style={s.undoLink}>Undo</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={s.markDoneBtn} onPress={() => recordCompletion(selectedWeekDay.activityIndex!)} activeOpacity={0.85}>
                      <ThemedText style={s.markDoneBtnText}>Mark as done</ThemedText>
                    </TouchableOpacity>
                  )}
                  <FulfilmentSuggestions fulfilment={fulfilments[selectedWeekDay.activityIndex!]} onInfoPress={() => setShowIntelligenceInfo(true)} />
                </>
              ) : (
                <ThemedText style={s.restDayBody}>Nothing planned for this day — rest is part of the plan.</ThemedText>
              )}
            </View>
          )}

          <View style={s.card}>
            <ThemedText style={s.cardEyebrow}>Daily goals</ThemedText>
            <StreakRow icon="walk-outline" label="Steps" days={weekDays} values={stepsByDay} goal={stepsGoal} first />
            <StreakRow icon="water-outline" label="Water" days={weekDays} values={waterByDay} goal={WATER_GOAL} />
          </View>

          <TouchableOpacity onPress={() => router.push('/my-plan' as any)} activeOpacity={0.7} style={{ alignSelf: 'center', marginTop: 4 }}>
            <ThemedText style={s.fulfilmentLink}>View full plan on My Plan →</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal
        visible={showIntelligenceInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIntelligenceInfo(false)}
      >
        <TouchableOpacity
          style={s.intelligenceTooltipOverlay}
          activeOpacity={1}
          onPress={() => setShowIntelligenceInfo(false)}
        >
          <View style={s.intelligenceTooltipCard}>
            <ThemedText style={s.intelligenceTooltipTitle}>ACP Intelligence™</ThemedText>
            <ThemedText style={s.intelligenceTooltipBody}>
              ACP Intelligence™ is AI that personalises your fitness and nutrition plan, learns from
              your progress, and adapts what to do next based on what works for you.
            </ThemedText>
            <TouchableOpacity style={s.intelligenceTooltipCloseBtn} onPress={() => setShowIntelligenceInfo(false)} activeOpacity={0.85}>
              <ThemedText style={s.intelligenceTooltipCloseText}>Got it</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  emptyText: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center', marginTop: 40 },
  fulfilmentLink: { fontSize: fontSize.xs, fontWeight: '700', color: palette.ink700 },
  fulfilmentBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline },
  fulfilmentHeader: {
    fontSize: 10, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  fulfilmentHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  marketplaceMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  marketplaceMatchImage: { width: 56, height: 56, borderRadius: radii.lg, flexShrink: 0 },
  marketplaceMatchImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },

  toggleWrap: {
    flexDirection: 'row', alignSelf: 'flex-end', marginBottom: 16,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.pill, padding: 3,
  },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radii.pill },
  toggleBtnActive: { backgroundColor: palette.white },
  toggleText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray450 },
  toggleTextActive: { color: palette.ink900 },

  weekStrip: {
    flexDirection: 'row', backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'], padding: 12, marginBottom: 16,
  },
  stripDay: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 6, borderRadius: radii.lg },
  stripDaySelected: { backgroundColor: palette.white },
  stripDayLabel: { fontSize: 11, fontWeight: '600', color: palette.gray450, textTransform: 'uppercase' },
  stripDayLabelToday: { color: palette.blue600 },
  stripDayNum: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },
  stripDayNumToday: { color: palette.blue600 },
  stripDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.border, marginTop: 2 },
  stripDotDone: { backgroundColor: palette.success700 },

  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginBottom: 16,
  },
  cardEyebrow: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },

  progressBlock: { marginBottom: 18 },
  progressLabel: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700, marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: palette.white, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: palette.success700 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryItem: { flex: 1, minWidth: 70, alignItems: 'center', backgroundColor: palette.white, borderRadius: radii.xl, paddingVertical: 14 },
  categoryIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  categoryCount: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink700 },
  categoryLabel: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 2 },

  dayRow: {
    paddingBottom: 8, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  dayRowLast: { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
  dayAccordionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  dayAccordionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayAccordionSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  dayName: { fontSize: fontSize.sm, fontWeight: '800', color: palette.ink700 },
  dayCategoryPill: {
    alignSelf: 'flex-start', backgroundColor: palette.white, borderRadius: radii.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  dayCategoryText: { fontSize: 10, fontWeight: '700', color: palette.gray450, textTransform: 'uppercase', letterSpacing: 0.3 },
  dayCategoryLarge: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  dayTitle: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },
  dayTitleLarge: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink900 },
  dayMeta: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 2 },
  dayDesc: { fontSize: fontSize.xs, color: palette.ink600, marginTop: 6, lineHeight: 17 },
  restDayText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray300 },
  restDayBody: { fontSize: fontSize.sm, color: palette.ink600, lineHeight: 20 },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  completedText: { fontSize: 10, fontWeight: '800', color: palette.success700, letterSpacing: 0.5 },
  markDoneBtn: {
    alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.pill, backgroundColor: palette.ink900,
  },
  markDoneBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.white },
  undoLink: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray450, textDecorationLine: 'underline' },

  streakRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  streakLabelCol: { width: 64, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  streakLabel: { fontSize: fontSize.xs, fontWeight: '700', color: palette.ink700 },
  streakDots: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  streakDotCol: { alignItems: 'center', gap: 4 },
  streakDot: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },
  streakDotDone: { backgroundColor: palette.success700, borderColor: palette.success700 },
  streakDayLabel: { fontSize: 10, fontWeight: '600', color: palette.gray300, textTransform: 'uppercase' },

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
});

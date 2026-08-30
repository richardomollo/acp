// ACP Intelligence™ — the single shared rendering of "what should ACP
// recommend for this activity?" (My Plan, This Week's Plan, and Home
// previously each copy-pasted this card; this component replaces all three
// copies, per the generalisation task's section 26/27). Self-contained
// styling so all three surfaces render it identically without threading
// each screen's own stylesheet through.
//
// Behaviour: fetches getActivityRecommendation(userId, activity) once per
// mount. Whenever it resolves a real session (mode !== GENERIC_FALLBACK —
// gym/mobility/running/walking, or a trainer-owned session for any other
// activity), the card reads as a prescribed session: an activity-specific
// header (YOUR WORKOUT/YOUR RUN/YOUR WALK/YOUR MOBILITY SESSION), real
// exerciseCount/duration metadata, and a single "View <activity> →" CTA —
// no generic browse link competes with it (Chunk 3/4). Only on
// GENERIC_FALLBACK does it fall back to the original DO IT YOURSELF/TRACK
// YOUR ACTIVITY + DO IT WITH ACP rendering, driven by the existing
// `fulfilment` (lib/fulfilment.ts) prop. "GET PROFESSIONAL SUPPORT" is
// parallel to both branches (section 20) since human-support signals aren't
// scoped to only ACP-generatable activities.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';
import type { StartingPlanActivity } from '@/lib/ai-assessment';
import type { PlanActivityFulfilment } from '@/lib/fulfilment';
import type { ActivityRecommendation } from '@/lib/activity-recommendation-types';
import { getActivityRecommendation } from '@/services/activity-recommendation-service';
import { normalizeActivity, isGymAccessListing } from '@/lib/fulfilment';

const LOADING_COPY: Record<string, string> = {
  gym: 'Preparing your workout…',
  mobility: 'Preparing your mobility session…',
  running: 'Preparing your run…',
  walking: 'Preparing your walk…',
};

// Chunk 4 (section 18) — the same "concrete prescribed session" copy Chunk 3
// proved for Strength, generalized per activity type. Keyed defensively
// (falls back to a generic "session" reading) because an EXISTING_PROGRAMME_
// SESSION can in principle resolve for an activity outside this table too —
// a trainer-created session for an otherwise-unsupported activity still
// takes precedence (section 13/23) and still deserves the "concrete
// session" treatment, just with generic wording since ACP itself has no
// specific copy for that activity.
const PRESCRIPTION_HEADER: Record<string, string> = {
  gym: 'YOUR WORKOUT', mobility: 'YOUR MOBILITY SESSION', running: 'YOUR RUN', walking: 'YOUR WALK',
};
const PRESCRIPTION_CTA_VERB: Record<string, string> = {
  gym: 'View workout', mobility: 'View session', running: 'View run', walking: 'View walk',
};
// Unit used only for exercise_workout sessions (exerciseCount is never set
// for activity_block sessions, so this never applies to running/walking).
const PRESCRIPTION_UNIT: Record<string, string> = {
  gym: 'exercises', mobility: 'movements',
};

export function ActivityFulfilmentCard({
  userId, activity, fulfilment, onInfoPress, emptyFallback,
}: {
  userId: string | null;
  activity: StartingPlanActivity;
  fulfilment: PlanActivityFulfilment | undefined;
  onInfoPress: () => void;
  /** Rendered only when there is truly nothing else to show (no ACP recommendation, no self-directed capability, no marketplace matches) — e.g. Home's "View this week's plan →" link. */
  emptyFallback?: ReactNode;
}) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<ActivityRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  // Debounces the primary CTA (section 5) — reset whenever this screen
  // regains focus, so coming back from workout-detail re-enables it rather
  // than leaving it permanently disabled after one tap.
  const [navigating, setNavigating] = useState(false);
  useFocusEffect(useCallback(() => { setNavigating(false); }, []));

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setRecommendation(null); // clear any stale recommendation from a previous activity identity before the new fetch resolves
    getActivityRecommendation(userId, activity)
      .then(rec => { if (active) setRecommendation(rec); })
      .catch(() => { /* failure behaviour (section 25): stay null, fall through to the existing fulfilment route below */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // activity.day + activity.activity is a stable identity for one plan slot
    // across re-renders of the same assessment — intentionally narrower than
    // the whole `activity` object, which is a fresh reference every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activity.day, activity.activity]);

  if (!fulfilment) return null;

  const acpRecommended = !!recommendation && recommendation.selfGuided.mode !== 'GENERIC_FALLBACK';
  const key = normalizeActivity(activity.activity || activity.title, activity.category);

  // Primary CTA (section 4/5/6) — the ACP recommendation must resolve to a
  // real persisted workoutId before navigating. EXISTING_PROGRAMME_SESSION
  // and GENERATED_PERSONALISED_SESSION are both guaranteed a real sessionId
  // by services/activity-recommendation-service.ts (Chunk 1); this guard
  // exists only for the defensive case where that guarantee somehow doesn't
  // hold, so a tap can never open a broken /workout-detail with no id. In
  // that case it falls back to the existing self-directed capability
  // (browse/Strava) rather than doing nothing.
  function handlePrimaryCta() {
    if (navigating) return;
    const sessionId = recommendation?.selfGuided.sessionId;
    if (sessionId) {
      setNavigating(true);
      router.push({ pathname: '/workout-detail', params: { workoutId: sessionId } } as any);
      return;
    }
    if (fulfilment?.selfDirected) {
      router.push(fulfilment.selfDirected.navigationTarget as any);
    }
  }

  // Chunk 4 — generalizes Chunk 3's "concrete prescribed session" card
  // (previously Strength/'gym' only) to every activity for which
  // getActivityRecommendation resolved a real session (mode !==
  // GENERIC_FALLBACK) — this now covers gym/mobility/running/walking, and
  // defensively any trainer-owned EXISTING_PROGRAMME_SESSION for an
  // activity outside that set too (section 13/23 — trainer precedence is
  // never limited to ACP-generatable types). No per-activity branch here:
  // one presentation path, driven entirely by real recommendation data.
  const header = PRESCRIPTION_HEADER[key] ?? 'YOUR SESSION';
  const ctaVerb = PRESCRIPTION_CTA_VERB[key] ?? 'View session';
  // A count only ever applies to an exercise_workout session — derived from
  // sessionType (real data), not from `key` alone, so a trainer-created
  // exercise-based session for an otherwise-unsupported activity still gets
  // a sensible unit instead of silently dropping its real exerciseCount.
  const unit = recommendation?.selfGuided.sessionType === 'exercise_workout' ? (PRESCRIPTION_UNIT[key] ?? 'exercises') : undefined;

  // Beta Feedback #005 — "what to do" (the workout) and "where to do it"
  // (gym access) are complementary, not mutually exclusive. When ACP has
  // prescribed a self-directed GYM workout, also surface any Open Gym / gym-
  // access listings already present in fulfilment.marketplaceMatches (they
  // were previously computed but never rendered in this branch). Deterministic:
  // only gym-access listings (never a competing coached class), only for a
  // 'gym' activity, and only where the access window is long enough for the
  // planned workout (section 12). Reuses the existing marketplace-match row.
  const gymAccessMatches = key === 'gym'
    ? fulfilment.marketplaceMatches
        .filter(m =>
          isGymAccessListing(m.title, m.activityType)
          && (m.durationMinutes == null || m.durationMinutes >= activity.duration_minutes),
        )
        .slice(0, 2)
    : [];

  return (
    <>
      {loading && !recommendation ? (
        <View style={s.block}>
          <ThemedText style={s.header}>{header}</ThemedText>
          <ThemedText style={s.meta}>{LOADING_COPY[key] ?? 'Preparing your session…'}</ThemedText>
        </View>
      ) : acpRecommended ? (
        <>
          <View style={s.block}>
            <ThemedText style={s.header}>{header}</ThemedText>
            <ThemedText style={s.meta}>
              {recommendation!.selfGuided.exerciseCount != null && unit
                ? `${recommendation!.selfGuided.exerciseCount} ${unit} · ${recommendation!.durationMinutes ?? 0} min`
                : `${recommendation!.durationMinutes ?? 0} min`}
            </ThemedText>
            <TouchableOpacity onPress={handlePrimaryCta} disabled={navigating} activeOpacity={0.7} style={{ marginTop: 6 }}>
              <ThemedText style={s.link}>{ctaVerb} →</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Beta Feedback #005 — gym access alongside the workout. Additive:
              the workout above is the coaching recommendation; this is just
              where to do it. Navigation only — viewing/booking never marks
              the activity done (section 20). */}
          {gymAccessMatches.length > 0 && (
            <View style={s.block}>
              <ThemedText style={s.header}>NEED A GYM?</ThemedText>
              {gymAccessMatches.map(m => (
                <TouchableOpacity key={m.id} style={s.matchRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                  {m.imageUrl ? (
                    <Image source={{ uri: m.imageUrl }} style={s.matchImage} />
                  ) : (
                    <View style={[s.matchImage, s.matchImageFallback]}>
                      <Ionicons name="barbell-outline" size={20} color={palette.gray300} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.title}>{m.title}</ThemedText>
                    <ThemedText style={s.meta}>
                      {m.partnerName ? `${m.partnerName} · ` : ''}
                      {m.isAlternateDay ? 'Available on ACP · ' : ''}
                      {new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}
                      {m.startTime ? ` · ${m.startTime.slice(0, 5)}` : ''}
                      {m.priceKes != null ? ` · KES ${m.priceKes.toLocaleString()}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText style={s.link}>View →</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          {fulfilment.selfDirected && (
            <View style={s.block}>
              <ThemedText style={s.header}>
                {fulfilment.selfDirected.source === 'exercise_db' ? 'DO IT YOURSELF' : 'TRACK YOUR ACTIVITY'}
              </ThemedText>
              <TouchableOpacity onPress={() => router.push(fulfilment.selfDirected!.navigationTarget as any)} activeOpacity={0.7}>
                <ThemedText style={s.link}>{fulfilment.selfDirected.title} →</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {fulfilment.marketplaceMatches.length > 0 && (
            <View style={s.block}>
              <View style={s.headerRow}>
                <ThemedText style={[s.header, { marginBottom: 0 }]}>DO IT WITH ACP</ThemedText>
                <TouchableOpacity onPress={onInfoPress} hitSlop={8} activeOpacity={0.7}>
                  <Ionicons name="information-circle-outline" size={12} color={palette.gray300} />
                </TouchableOpacity>
              </View>
              {fulfilment.marketplaceMatches.map(m => (
                <TouchableOpacity key={m.id} style={s.matchRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                  {m.imageUrl ? (
                    <Image source={{ uri: m.imageUrl }} style={s.matchImage} />
                  ) : (
                    <View style={[s.matchImage, s.matchImageFallback]}>
                      <Ionicons name={m.type === 'experience' ? 'sparkles-outline' : 'barbell-outline'} size={20} color={palette.gray300} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.title}>{m.title}</ThemedText>
                    <ThemedText style={s.meta}>
                      {m.isAlternateDay ? 'Available on ACP · ' : ''}
                      {new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}
                      {m.startTime ? ` · ${m.startTime.slice(0, 5)}` : ''}
                      {m.priceKes != null ? ` · KES ${m.priceKes.toLocaleString()}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText style={s.link}>View activity →</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!fulfilment.selfDirected && fulfilment.marketplaceMatches.length === 0 && emptyFallback}
        </>
      )}

      {recommendation?.professionalSupport && (
        <View style={s.block}>
          <ThemedText style={s.header}>GET PROFESSIONAL SUPPORT</ThemedText>
          <ThemedText style={s.title}>{recommendation.professionalSupport.headline}</ThemedText>
          <ThemedText style={s.body}>{recommendation.professionalSupport.reason}</ThemedText>
          {recommendation.professionalSupport.trainers && recommendation.professionalSupport.trainers.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {recommendation.professionalSupport.trainers.map(m => (
                <TouchableOpacity key={m.id} style={s.providerRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                  {m.photoUrl ? (
                    <Image source={{ uri: m.photoUrl }} style={s.trainerImage} />
                  ) : (
                    <View style={[s.trainerImage, s.trainerImageFallback]}>
                      <Ionicons name="person-outline" size={20} color={palette.gray300} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.title}>{m.name}</ThemedText>
                    {m.matchReasons.length > 0 && (
                      <ThemedText style={s.meta}>Good match for: {m.matchReasons.join(' · ')}</ThemedText>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  block: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  header: { fontSize: 10, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  link: { fontSize: fontSize.xs, fontWeight: '700', color: palette.ink700 },
  title: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },
  meta: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 2 },
  body: { fontSize: fontSize.sm, color: palette.ink600, marginTop: 6, lineHeight: 20 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  matchImage: { width: 90, height: 90, borderRadius: radii.lg, flexShrink: 0 },
  matchImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  trainerImage: { width: 90, height: 90, borderRadius: radii.lg, flexShrink: 0 },
  trainerImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});

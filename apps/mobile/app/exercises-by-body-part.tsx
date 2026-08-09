import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchExercisesByBodyPart,
  type ExerciseDBExercise,
} from '@/services/exercisedb';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';

const SCREEN_W = Dimensions.get('window').width;
const GIF_SIZE = SCREEN_W - 64; // 16px outer + 16px card padding each side
const LIMIT = 15;

// ── GIF URL construction ───────────────────────────────────────────────────────
// Source: JahelCuadrado/ExerciseGymGifsDB served via jsDelivr CDN

const GIF_BASE = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main';

const TARGET_TO_FOLDER: Record<string, string> = {
  pectorals:               'pectorals',
  lats:                    'lats',
  'upper back':            'upper-back',
  delts:                   'delts',
  biceps:                  'biceps',
  triceps:                 'triceps',
  abs:                     'abs',
  abdominals:              'abs',
  glutes:                  'glutes',
  quads:                   'quads',
  quadriceps:              'quads',
  hamstrings:              'hamstrings',
  calves:                  'calves',
  gastrocnemius:           'calves',
  forearms:                'forearms',
  traps:                   'traps',
  'cardiovascular system': 'cardio',
  spine:                   'spine',
  adductors:               'adductors',
  abductors:               'abductors',
  'serratus anterior':     'serratus-anterior',
};

function getGifUrl(name: string, target: string): string | null {
  const folder = TARGET_TO_FOLDER[target.toLowerCase()];
  if (!folder) return null;
  const slug = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')   // strip "(kneeling)", "(with band)", etc.
    .replace(/[^a-z0-9\s]/g, '') // remove special chars
    .trim()
    .replace(/\s+/g, '-');
  return `${GIF_BASE}/${folder}/${slug}.gif`;
}

// ── GifImage — silently hides if the CDN 404s ─────────────────────────────────

function GifImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri: url }}
      style={{ width: GIF_SIZE, height: GIF_SIZE }}
      contentFit="contain"
      onError={() => setFailed(true)}
      transition={200}
    />
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: palette.success50,  text: palette.success700 },
  intermediate: { bg: palette.warning50,  text: palette.warning800 },
  advanced:     { bg: palette.danger50,   text: palette.danger600  },
};

const EQUIPMENT_ICON: Record<string, string> = {
  'body weight':      'body-outline',
  'dumbbell':         'barbell-outline',
  'barbell':          'barbell-outline',
  'cable':            'git-branch-outline',
  'leverage machine': 'cog-outline',
  'band':             'link-outline',
  'kettlebell':       'barbell-outline',
  'smith machine':    'barbell-outline',
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ExercisesByBodyPartScreen() {
  const { bodyPart } = useLocalSearchParams<{ bodyPart: string }>();
  const router = useRouter();

  const [exercises, setExercises]     = useState<ExerciseDBExercise[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({});
  const [error, setError]             = useState<string | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [ratings, setRatings]         = useState<Record<string, number>>({});

  useEffect(() => {
    if (bodyPart) load(0);
    (async () => {
      const session = await authService.getSession();
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const [favRes, ratingRes] = await Promise.all([
        supabase.from('exercise_favorites').select('external_id').eq('user_id', uid).eq('source', 'exercisedb'),
        supabase.from('exercise_ratings').select('external_id, rating').eq('user_id', uid).eq('source', 'exercisedb'),
      ]);
      setFavoriteIds(new Set(((favRes.data as any[]) ?? []).map(r => r.external_id)));
      setRatings(Object.fromEntries(((ratingRes.data as any[]) ?? []).map(r => [r.external_id, r.rating])));
    })();
  }, [bodyPart]);

  const toggleFavorite = async (exerciseId: string) => {
    if (!userId) return;
    const isFav = favoriteIds.has(exerciseId);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      isFav ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
    if (isFav) {
      await supabase.from('exercise_favorites').delete()
        .eq('user_id', userId).eq('source', 'exercisedb').eq('external_id', exerciseId);
    } else {
      await supabase.from('exercise_favorites').insert({ user_id: userId, source: 'exercisedb', external_id: exerciseId });
    }
  };

  const rateExercise = async (exerciseId: string, rating: number) => {
    if (!userId) return;
    setRatings(prev => ({ ...prev, [exerciseId]: rating }));
    await supabase.from('exercise_ratings')
      .upsert({ user_id: userId, source: 'exercisedb', external_id: exerciseId, rating, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,source,external_id' });
  };

  const load = async (nextOffset: number) => {
    if (nextOffset === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchExercisesByBodyPart(bodyPart!, LIMIT, nextOffset);
      setExercises(prev => nextOffset === 0 ? data : [...prev, ...data]);
      setHasMore(data.length === LIMIT);
      setOffset(nextOffset + data.length);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load exercises');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const label = bodyPart ? bodyPart.replace(/\b\w/g, c => c.toUpperCase()) : '';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>

        {/* ── Header ── */}
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>{label}</ThemedText>
            <ThemedText style={s.headerSub}>Exercises · ExerciseDB</ThemedText>
          </View>
        </SafeAreaView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={s.errorWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={palette.danger500} />
            <ThemedText style={s.errorTitle}>Could not load exercises</ThemedText>
            <ThemedText style={s.errorSub}>{error}</ThemedText>
            <TouchableOpacity style={s.retryBtn} onPress={() => load(0)} activeOpacity={0.8}>
              <ThemedText style={s.retryText}>Try again</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            <ThemedText style={s.resultCount}>
              {exercises.length}{hasMore ? '+' : ''} exercises
            </ThemedText>

            {exercises.map(ex => {
              const isOpen = !!expanded[ex.id];
              const diff = DIFFICULTY_COLORS[ex.difficulty] ?? DIFFICULTY_COLORS.beginner;
              const equipIcon = (EQUIPMENT_ICON[ex.equipment] ?? 'barbell-outline') as any;
              const gifUrl = getGifUrl(ex.name, ex.target);

              return (
                <TouchableOpacity
                  key={ex.id}
                  style={s.card}
                  onPress={() => toggle(ex.id)}
                  activeOpacity={0.88}
                >
                  {/* ── Top row ── */}
                  <View style={s.cardTopRow}>
                    <View style={s.exIconWrap}>
                      <Ionicons name={equipIcon} size={18} color={palette.ink900} />
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <ThemedText style={s.exName} numberOfLines={2}>{ex.name}</ThemedText>
                      <ThemedText style={s.exTarget}>{ex.target}</ThemedText>
                    </View>
                    <TouchableOpacity hitSlop={10} onPress={() => toggleFavorite(ex.id)} disabled={!userId}>
                      <Ionicons
                        name={favoriteIds.has(ex.id) ? 'heart' : 'heart-outline'}
                        size={19}
                        color={favoriteIds.has(ex.id) ? palette.danger500 : palette.gray300}
                      />
                    </TouchableOpacity>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18} color={palette.gray300}
                    />
                  </View>

                  {/* ── Chips ── */}
                  <View style={s.chipsRow}>
                    <View style={[s.chip, { backgroundColor: diff.bg }]}>
                      <ThemedText style={[s.chipText, { color: diff.text }]}>
                        {ex.difficulty.charAt(0).toUpperCase() + ex.difficulty.slice(1)}
                      </ThemedText>
                    </View>
                    <View style={s.chip}>
                      <ThemedText style={s.chipText}>{ex.equipment}</ThemedText>
                    </View>
                    {ex.category ? (
                      <View style={[s.chip, s.chipBlue]}>
                        <ThemedText style={[s.chipText, { color: palette.blue500 }]}>{ex.category}</ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {/* ── Expanded: GIF + description + secondary muscles ── */}
                  {isOpen && (
                    <>
                      <View style={s.rateRow}>
                        <ThemedText style={s.rateLabel}>Your rating</ThemedText>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <TouchableOpacity key={n} hitSlop={6} onPress={() => rateExercise(ex.id, n)} disabled={!userId}>
                              <Ionicons
                                name={(ratings[ex.id] ?? 0) >= n ? 'star' : 'star-outline'}
                                size={18}
                                color={palette.warning500}
                              />
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      {gifUrl && (
                        <View style={s.gifWrap}>
                          <GifImage url={gifUrl} />
                        </View>
                      )}
                      {ex.description ? (
                        <ThemedText style={s.desc}>{ex.description}</ThemedText>
                      ) : null}
                      {ex.secondaryMuscles?.length > 0 && (
                        <ThemedText style={s.secondary}>
                          Also: {ex.secondaryMuscles.join(', ')}
                        </ThemedText>
                      )}
                    </>
                  )}

                  {/* ── Step-by-step instructions ── */}
                  {isOpen && ex.instructions?.length > 0 && (
                    <View style={s.instructions}>
                      <ThemedText style={s.instructionsLabel}>How to do it</ThemedText>
                      {ex.instructions.map((step, i) => (
                        <View key={i} style={s.instructionRow}>
                          <View style={s.instructionNum}>
                            <ThemedText style={s.instructionNumText}>{i + 1}</ThemedText>
                          </View>
                          <ThemedText style={s.instructionText}>{step}</ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {hasMore && (
              <TouchableOpacity
                style={s.loadMoreBtn}
                onPress={() => load(offset)}
                disabled={loadingMore}
                activeOpacity={0.75}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={palette.blue500} />
                ) : (
                  <>
                    <ThemedText style={s.loadMoreText}>Load more</ThemedText>
                    <Ionicons name="chevron-down" size={15} color={palette.blue500} />
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={{ height: 80 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  list: { paddingHorizontal: 16, paddingTop: 16 },

  resultCount: {
    fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  // Card
  card: {
    marginBottom: 14, borderRadius: radii.xl,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    padding: 16,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  exIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  exName: { fontSize: 14, fontWeight: '800', color: palette.ink900, letterSpacing: -0.1, lineHeight: 19 },
  exTarget: { fontSize: 12, fontWeight: '600', color: palette.gray300, marginTop: 2 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.pill,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  chipBlue: { backgroundColor: palette.blue25 },
  chipText: { fontSize: 11, fontWeight: '600', color: palette.gray450 },

  rateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  rateLabel: { fontSize: 12.5, fontWeight: '600', color: palette.gray450 },

  gifWrap: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md,
    alignItems: 'center', overflow: 'hidden', marginBottom: 10,
    minHeight: 4, // collapse to nothing if GifImage returns null
  },

  desc: { fontSize: 13, color: palette.gray450, lineHeight: 18, marginBottom: 8 },
  secondary: { fontSize: 11, color: palette.gray300, marginBottom: 4 },

  instructions: {
    marginTop: 10, padding: 12,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md, gap: 8,
  },
  instructionsLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  instructionRow: { flexDirection: 'row', gap: 10 },
  instructionNum: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  instructionNumText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  instructionText: { flex: 1, fontSize: 13, color: palette.ink700, lineHeight: 18 },

  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.xl, marginBottom: 8,
  },
  loadMoreText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue500 },

  errorWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 10 },
  errorTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  errorSub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: palette.blue500, borderRadius: radii.pill,
  },
  retryText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
});

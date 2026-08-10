import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchExercisesByBodyPart,
  type ExerciseDBExercise,
} from '@/services/exercisedb';

// ── GIF URL helper (same mapping as exercises-by-body-part.tsx) ─────────────────

const GIF_BASE = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main';

const TARGET_TO_FOLDER: Record<string, string> = {
  pectorals: 'pectorals', lats: 'lats', 'upper back': 'upper-back',
  delts: 'delts', biceps: 'biceps', triceps: 'triceps',
  abs: 'abs', abdominals: 'abs', glutes: 'glutes',
  quads: 'quads', quadriceps: 'quads', hamstrings: 'hamstrings',
  calves: 'calves', gastrocnemius: 'calves', forearms: 'forearms',
  traps: 'traps', 'cardiovascular system': 'cardio',
  spine: 'spine', adductors: 'adductors', abductors: 'abductors',
  'serratus anterior': 'serratus-anterior',
};

function getGifUrl(name: string, target: string): string | null {
  const folder = TARGET_TO_FOLDER[target.toLowerCase()];
  if (!folder) return null;
  const slug = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${GIF_BASE}/${folder}/${slug}.gif`;
}

const thumbStyles = StyleSheet.create({
  fallback: {
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});

// ── Exercise thumbnail — gif with graceful icon fallback ─────────────────────────

function ExerciseThumb({
  gifUrl, icon, size = 38,
}: {
  gifUrl: string | null;
  icon: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!gifUrl || failed) {
    return (
      <View style={[thumbStyles.fallback, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Ionicons name={icon as any} size={size * 0.45} color={palette.ink900} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: gifUrl }}
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: palette.surfaceMuted }}
      contentFit="cover"
      onError={() => setFailed(true)}
      transition={150}
    />
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BODY_PARTS = [
  { key: 'chest',      label: 'Chest',    icon: 'fitness-outline'   },
  { key: 'back',       label: 'Back',     icon: 'body-outline'      },
  { key: 'shoulders',  label: 'Shoulders',icon: 'barbell-outline'   },
  { key: 'upper arms', label: 'Arms',     icon: 'barbell-outline'   },
  { key: 'upper legs', label: 'Quads',    icon: 'walk-outline'      },
  { key: 'lower legs', label: 'Calves',   icon: 'footsteps-outline' },
  { key: 'waist',      label: 'Core',     icon: 'shield-outline'    },
  { key: 'cardio',     label: 'Cardio',   icon: 'heart-outline'     },
  { key: 'lower arms', label: 'Forearms', icon: 'hand-left-outline' },
] as const;

const LOCATION_OPTIONS = [
  { key: 'gym',  label: 'Gym',  icon: 'barbell-outline' },
  { key: 'home', label: 'Home', icon: 'home-outline'    },
  { key: 'both', label: 'Both', icon: 'globe-outline'   },
] as const;

const DIFFICULTIES = [
  { key: 'beginner',     label: 'Beginner'     },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced',     label: 'Advanced'     },
] as const;

const EQUIPMENT_ICON: Record<string, string> = {
  'body weight': 'body-outline', dumbbell: 'barbell-outline',
  barbell: 'barbell-outline', cable: 'git-branch-outline',
  'leverage machine': 'cog-outline', band: 'link-outline',
  kettlebell: 'barbell-outline', 'smith machine': 'barbell-outline',
};

function goalToCategory(goal: string | null): string {
  switch (goal) {
    case 'build_muscle':     return 'strength';
    case 'lose_weight':      return 'hiit';
    case 'improve_mobility': return 'mobility';
    default:                 return 'full_body';
  }
}

// fitness_profile.goal now also allows nutrition-only values (maintain_weight,
// eat_healthier) since goals are shared across the Fitness and Nutrition
// Hubs — but workouts.goal's own CHECK constraint only recognizes the
// original 4 workout-relevant goals, so anything else falls back safely.
function toWorkoutGoal(goal: string | null): 'lose_weight' | 'build_muscle' | 'improve_mobility' | 'general_fitness' {
  if (goal === 'lose_weight' || goal === 'build_muscle' || goal === 'improve_mobility') return goal;
  return 'general_fitness';
}

// ── Workout generator ──────────────────────────────────────────────────────────
// Rules-based: ExerciseDB covers strength/cardio types by body part; yoga and
// stretching have no ExerciseDB content at all (confirmed while migrating the
// exercise library), so those two types draw from a small curated list using
// real gifs from the same CDN the rest of the app already uses.

interface CuratedExercise {
  id: string; name: string; bodyPart: string; target: string;
  equipment: string; difficulty: string; instructions: string[]; gifUrl: string;
}

const YOGA_POSES: CuratedExercise[] = [
  { id: 'curated-childs-pose', name: "Child's Pose", bodyPart: 'waist', target: 'spine', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Kneel and sit back on your heels.', 'Fold forward, extending your arms out, and breathe deeply.'],
    gifUrl: `${GIF_BASE}/spine/spine-stretch.gif` },
  { id: 'curated-cat-cow', name: 'Cat-Cow Stretch', bodyPart: 'waist', target: 'spine', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['On hands and knees, arch your back and look up (cow).', 'Round your spine and tuck your chin (cat). Repeat slowly.'],
    gifUrl: `${GIF_BASE}/spine/lower-back-curl.gif` },
  { id: 'curated-cobra-pose', name: 'Cobra Pose', bodyPart: 'waist', target: 'spine', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Lie face down, hands under your shoulders.', 'Press up, lifting your chest while keeping your hips on the floor.'],
    gifUrl: `${GIF_BASE}/spine/upward-facing-dog.gif` },
  { id: 'curated-sphinx-pose', name: 'Sphinx Pose', bodyPart: 'waist', target: 'spine', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Lie face down propped on your forearms, elbows under shoulders.', 'Lift your chest gently and hold, keeping hips grounded.'],
    gifUrl: `${GIF_BASE}/spine/sphinx.gif` },
  { id: 'curated-butterfly-pose', name: 'Butterfly Pose', bodyPart: 'upper legs', target: 'adductors', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Sit with the soles of your feet together, knees out to the sides.', 'Hold your feet and gently press your knees toward the floor.'],
    gifUrl: `${GIF_BASE}/adductors/butterfly-yoga-pose.gif` },
  { id: 'curated-seated-wide-angle', name: 'Seated Wide-Angle Pose', bodyPart: 'upper legs', target: 'hamstrings', equipment: 'body weight', difficulty: 'intermediate',
    instructions: ['Sit with legs spread wide, spine tall.', 'Hinge forward from the hips and reach toward your feet.'],
    gifUrl: `${GIF_BASE}/hamstrings/seated-wide-angle-pose-sequence.gif` },
  { id: 'curated-reclining-big-toe', name: 'Reclining Hand-to-Big-Toe Pose', bodyPart: 'upper legs', target: 'hamstrings', equipment: 'band', difficulty: 'intermediate',
    instructions: ['Lie on your back and loop a strap or towel around one foot.', 'Extend that leg upward, keeping the other leg flat on the floor.'],
    gifUrl: `${GIF_BASE}/hamstrings/reclining-big-toe-pose-with-rope.gif` },
  { id: 'curated-downdog-flow', name: 'Downward Dog to Cobra Flow', bodyPart: 'back', target: 'glutes', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['From a plank, push your hips up into Downward Dog.', 'Flow forward and down into Cobra, then repeat.'],
    gifUrl: `${GIF_BASE}/glutes/pike-to-cobra-push-up.gif` },
];

const STRETCHES: CuratedExercise[] = [
  { id: 'curated-hamstring-calf-stretch', name: 'Standing Hamstring & Calf Stretch', bodyPart: 'lower legs', target: 'hamstrings', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Loop a strap around your foot and extend the leg.', 'Gently pull toward you, keeping the knee straight.'],
    gifUrl: `${GIF_BASE}/hamstrings/standing-hamstring-and-calf-stretch-with-strap.gif` },
  { id: 'curated-worlds-greatest-stretch', name: "World's Greatest Stretch", bodyPart: 'upper legs', target: 'hamstrings', equipment: 'body weight', difficulty: 'intermediate',
    instructions: ['Step into a deep lunge and place both hands down.', 'Rotate your torso, reaching one arm to the sky.'],
    gifUrl: `${GIF_BASE}/hamstrings/world-greatest-stretch.gif` },
  { id: 'curated-hip-flexor-quad-stretch', name: 'Hip Flexor & Quad Stretch', bodyPart: 'upper legs', target: 'quads', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Kneel in a half-lunge position.', 'Push your hips forward until you feel a stretch in the front hip/thigh.'],
    gifUrl: `${GIF_BASE}/quads/intermediate-hip-flexor-and-quad-stretch.gif` },
  { id: 'curated-calf-wall-stretch', name: 'Calf Stretch Against Wall', bodyPart: 'lower legs', target: 'calves', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Place your hands on a wall, step one foot back.', 'Keep the back heel down and lean forward gently.'],
    gifUrl: `${GIF_BASE}/calves/calf-stretch-with-hands-against-wall.gif` },
  { id: 'curated-chest-shoulder-stretch', name: 'Chest & Shoulder Stretch', bodyPart: 'chest', target: 'pectorals', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Clasp your hands behind your back.', 'Lift your arms slightly and open your chest.'],
    gifUrl: `${GIF_BASE}/pectorals/chest-and-front-of-shoulder-stretch.gif` },
  { id: 'curated-triceps-stretch', name: 'Triceps Stretch', bodyPart: 'upper arms', target: 'triceps', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Reach one arm overhead and bend the elbow.', 'Use the other hand to gently press the elbow back.'],
    gifUrl: `${GIF_BASE}/triceps/triceps-stretch.gif` },
  { id: 'curated-lat-stretch', name: 'Standing Lat Stretch', bodyPart: 'back', target: 'lats', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Reach one arm overhead and lean to the opposite side.', 'Hold and feel the stretch down your side.'],
    gifUrl: `${GIF_BASE}/lats/standing-lateral-stretch.gif` },
  { id: 'curated-glute-stretch', name: 'Seated Glute Stretch', bodyPart: 'upper legs', target: 'glutes', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Sit and cross one ankle over the opposite knee.', 'Lean forward gently until you feel a stretch in the glute.'],
    gifUrl: `${GIF_BASE}/glutes/seated-glute-stretch.gif` },
  { id: 'curated-piriformis-stretch', name: 'Seated Piriformis Stretch', bodyPart: 'upper legs', target: 'glutes', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Sit tall and cross one leg over the other.', 'Twist gently toward the crossed leg to feel the stretch.'],
    gifUrl: `${GIF_BASE}/glutes/seated-piriformis-stretch.gif` },
  { id: 'curated-neck-stretch', name: 'Neck Side Stretch', bodyPart: 'neck', target: 'neck', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Tilt your head gently to one side.', 'Use your hand for light overpressure, then switch sides.'],
    gifUrl: `${GIF_BASE}/levator-scapulae/neck-side-stretch.gif` },
  { id: 'curated-upper-back-stretch', name: 'Upper Back Stretch', bodyPart: 'back', target: 'upper back', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Clasp your hands in front and round your upper back.', 'Push your hands away from you and hold the stretch.'],
    gifUrl: `${GIF_BASE}/upper-back/upper-back-stretch.gif` },
  { id: 'curated-wrist-stretch', name: 'Wrist Flexor Stretch', bodyPart: 'lower arms', target: 'forearms', equipment: 'body weight', difficulty: 'beginner',
    instructions: ['Extend one arm out, palm up.', 'Use the other hand to gently pull the fingers back.'],
    gifUrl: `${GIF_BASE}/forearms/side-wrist-pull-stretch.gif` },
];

const GENERATOR_TYPES = [
  { key: 'push',      label: 'Push',      icon: 'barbell-outline'    },
  { key: 'pull',      label: 'Pull',      icon: 'fitness-outline'    },
  { key: 'legs',      label: 'Legs',      icon: 'walk-outline'       },
  { key: 'core',      label: 'Core',      icon: 'shield-outline'     },
  { key: 'full_body', label: 'Full Body', icon: 'body-outline'       },
  { key: 'cardio',    label: 'Cardio',    icon: 'heart-outline'      },
  { key: 'chest',     label: 'Chest',     icon: 'fitness-outline'    },
  { key: 'back',      label: 'Back',      icon: 'body-outline'       },
  { key: 'shoulders', label: 'Shoulders', icon: 'barbell-outline'    },
  { key: 'arms',      label: 'Arms',      icon: 'barbell-outline'    },
  { key: 'quads',     label: 'Quads',     icon: 'walk-outline'       },
  { key: 'calves',    label: 'Calves',    icon: 'footsteps-outline'  },
  { key: 'forearms',  label: 'Forearms',  icon: 'hand-left-outline'  },
  { key: 'neck',      label: 'Neck',      icon: 'body-outline'       },
  { key: 'yoga',      label: 'Yoga',      icon: 'flower-outline'     },
  { key: 'stretch',   label: 'Stretching',icon: 'leaf-outline'       },
] as const;

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120] as const;

const TYPE_BODY_PARTS: Record<string, string[]> = {
  push:      ['chest', 'shoulders', 'upper arms'],
  pull:      ['back', 'upper arms'],
  legs:      ['upper legs', 'lower legs'],
  core:      ['waist'],
  full_body: ['chest', 'back', 'upper legs', 'waist'],
  cardio:    ['cardio'],
  chest:     ['chest'],
  back:      ['back'],
  shoulders: ['shoulders'],
  arms:      ['upper arms'],
  quads:     ['upper legs'],
  calves:    ['lower legs'],
  forearms:  ['lower arms'],
  neck:      ['neck'],
};

const HOME_EQUIPMENT = new Set(['body weight', 'dumbbell', 'band', 'kettlebell']);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function matchesLocation(location: 'gym' | 'home' | 'both', equipment: string): boolean {
  if (location === 'gym') return true;
  return HOME_EQUIPMENT.has((equipment ?? '').toLowerCase());
}

// "upper arms" mixes biceps (pull) and triceps (push) exercises — narrow it
// down so a "Push" day doesn't surface bicep curls and vice versa.
function matchesPushPull(type: string, ex: ExerciseDBExercise): boolean {
  if (ex.bodyPart !== 'upper arms') return true;
  if (type === 'push') return ex.target === 'triceps';
  if (type === 'pull') return ex.target === 'biceps';
  return true;
}

function filterByDifficulty<T extends { difficulty: string }>(list: T[], difficulty: string): T[] {
  const matched = list.filter(e => e.difficulty?.toLowerCase() === difficulty);
  return matched.length >= 3 ? matched : list;
}

function defaultsForType(type: string): { sets: number; reps: number; restSeconds: number } {
  if (type === 'cardio') return { sets: 3, reps: 15, restSeconds: 30 };
  if (type === 'yoga' || type === 'stretch') return { sets: 3, reps: 1, restSeconds: 30 };
  return { sets: 3, reps: 10, restSeconds: 60 };
}

function secondsPerExercise(type: string): number {
  return type === 'cardio' || type === 'yoga' || type === 'stretch' ? 225 : 315;
}

interface GeneratorInput {
  location: 'gym' | 'home' | 'both';
  types: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes: number;
}

interface GeneratedItem {
  ex: ExerciseDBExercise | CuratedExercise;
  type: string;
}

// ExerciseDB's plan caps each request at 10 results regardless of the `limit`
// param — confirmed live (limit=30 still returned 10). Equipment mix is also
// front-loaded unevenly (chest/back/shoulders' first page of 10 had zero
// bodyweight/dumbbell/band exercises even though ~40-60% of their full ~100-item
// lists are home-friendly), so a single page isn't enough to serve "home"
// workouts — page through a few offsets per body part instead. Requests are
// sequenced (not parallel) because this plan's rate limit trips easily on
// bursts — confirmed live: firing ~15-20 requests at once returned 403s that
// an immediate single retry succeeded at.
async function fetchBodyPartPool(bodyPart: string, pages = 5): Promise<ExerciseDBExercise[]> {
  const out: ExerciseDBExercise[] = [];
  for (let i = 0; i < pages; i++) {
    let page: ExerciseDBExercise[];
    try {
      page = await fetchExercisesByBodyPart(bodyPart, 10, i * 10);
    } catch {
      break;
    }
    if (page.length === 0) break;
    out.push(...page);
    if (i < pages - 1) await new Promise(r => setTimeout(r, 150));
  }
  return out;
}

// Selecting several types (e.g. Push + Yoga) splits the requested duration
// evenly across them and generates each type's slice independently, then
// concatenates in the order selected — keeps a "Push" block together rather
// than interleaving with stretches. Sequenced (not parallel) across types for
// the same rate-limit reason fetchBodyPartPool is sequenced internally.
async function generateExercisePool(input: GeneratorInput): Promise<GeneratedItem[]> {
  const types = input.types.length > 0 ? input.types : ['full_body'];
  const perTypeDuration = input.durationMinutes / types.length;

  const out: GeneratedItem[] = [];
  for (const type of types) {
    const count = Math.min(
      20,
      Math.max(2, Math.round((perTypeDuration * 60) / secondsPerExercise(type))),
    );

    if (type === 'yoga' || type === 'stretch') {
      const pool = filterByDifficulty(type === 'yoga' ? YOGA_POSES : STRETCHES, input.difficulty);
      out.push(...shuffle(pool).slice(0, Math.min(count, pool.length)).map(ex => ({ ex, type })));
      continue;
    }

    const bodyParts = TYPE_BODY_PARTS[type] ?? ['chest'];
    let pool: ExerciseDBExercise[] = [];
    for (const bp of bodyParts) {
      pool.push(...await fetchBodyPartPool(bp));
    }
    pool = pool.filter(ex => matchesLocation(input.location, ex.equipment));
    pool = pool.filter(ex => matchesPushPull(type, ex));
    pool = filterByDifficulty(pool, input.difficulty);
    out.push(...shuffle(pool).slice(0, Math.min(count, pool.length)).map(ex => ({ ex, type })));
  }

  return out;
}

function toGeneratedEntry(item: GeneratedItem): WorkoutEntry {
  const { ex, type } = item;
  const isCurated = type === 'yoga' || type === 'stretch';
  const defaults = defaultsForType(type);
  const gifUrl = isCurated ? (ex as CuratedExercise).gifUrl : getGifUrl(ex.name, (ex as ExerciseDBExercise).target);
  return {
    tempId:       `${Date.now()}-${Math.random()}`,
    externalId:   ex.id,
    exerciseId:   null,
    name:         ex.name,
    target:       (ex as any).target,
    bodyPart:     (ex as any).bodyPart,
    equipment:    ex.equipment,
    difficulty:   ex.difficulty,
    instructions: ex.instructions ?? [],
    gifUrl,
    ...defaults,
    notes: '',
  };
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkoutEntry {
  tempId: string;
  externalId: string;       // ExerciseDB ID
  exerciseId: string | null; // Our DB UUID (set after upsert on save)
  name: string;
  target: string;
  bodyPart: string;
  equipment: string;
  difficulty: string;
  instructions: string[];
  gifUrl: string | null;
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string;
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function Stepper({
  value, min, max,
  onDecrement, onIncrement, suffix = '',
}: {
  value: number; min: number; max: number;
  onDecrement: () => void; onIncrement: () => void;
  suffix?: string;
}) {
  return (
    <View style={s.stepper}>
      <TouchableOpacity
        style={[s.stepBtn, value <= min && s.stepBtnDisabled]}
        onPress={onDecrement} disabled={value <= min} hitSlop={10}
      >
        <Ionicons name="remove" size={15} color={value <= min ? palette.gray300 : palette.ink900} />
      </TouchableOpacity>
      <ThemedText style={s.stepVal}>{value}{suffix}</ThemedText>
      <TouchableOpacity
        style={[s.stepBtn, value >= max && s.stepBtnDisabled]}
        onPress={onIncrement} disabled={value >= max} hitSlop={10}
      >
        <Ionicons name="add" size={15} color={value >= max ? palette.gray300 : palette.ink900} />
      </TouchableOpacity>
    </View>
  );
}

// ── Exercise entry card ────────────────────────────────────────────────────────

function EntryCard({
  entry, idx, onChange, onRemove,
}: {
  entry: WorkoutEntry; idx: number;
  onChange: (u: WorkoutEntry) => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<WorkoutEntry>) => onChange({ ...entry, ...patch });
  return (
    <View style={s.entryCard}>
      <View style={s.entryTop}>
        <View style={s.entryThumbWrap}>
          <ExerciseThumb
            gifUrl={entry.gifUrl}
            icon={EQUIPMENT_ICON[entry.equipment] ?? 'barbell-outline'}
            size={48}
          />
          <View style={s.entryNumBadge}>
            <ThemedText style={s.entryNumText}>{idx + 1}</ThemedText>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.entryName} numberOfLines={2}>{entry.name}</ThemedText>
          <ThemedText style={s.entryTarget}>{entry.target} · {entry.equipment}</ThemedText>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={8} style={s.removeBtn}>
          <Ionicons name="trash-outline" size={15} color={palette.danger500} />
        </TouchableOpacity>
      </View>

      <View style={s.entryControls}>
        <View style={s.controlItem}>
          <ThemedText style={s.controlLabel}>Sets</ThemedText>
          <Stepper value={entry.sets} min={1} max={10}
            onDecrement={() => upd({ sets: Math.max(1, entry.sets - 1) })}
            onIncrement={() => upd({ sets: Math.min(10, entry.sets + 1) })} />
        </View>
        <View style={s.controlDivider} />
        <View style={s.controlItem}>
          <ThemedText style={s.controlLabel}>Reps</ThemedText>
          <Stepper value={entry.reps} min={1} max={50}
            onDecrement={() => upd({ reps: Math.max(1, entry.reps - 1) })}
            onIncrement={() => upd({ reps: Math.min(50, entry.reps + 1) })} />
        </View>
        <View style={s.controlDivider} />
        <View style={s.controlItem}>
          <ThemedText style={s.controlLabel}>Rest</ThemedText>
          <Stepper value={entry.restSeconds} min={15} max={300} suffix="s"
            onDecrement={() => upd({ restSeconds: Math.max(15, entry.restSeconds - 15) })}
            onIncrement={() => upd({ restSeconds: Math.min(300, entry.restSeconds + 15) })} />
        </View>
      </View>

      <TextInput
        style={s.entryNoteInput}
        placeholder="Add a note (e.g. grip, form cue, weight target)..."
        placeholderTextColor={palette.gray300}
        value={entry.notes}
        onChangeText={text => upd({ notes: text })}
        maxLength={140}
        multiline
      />
    </View>
  );
}

// ── Exercise picker modal ──────────────────────────────────────────────────────

function ExercisePicker({
  visible, addedIds, onClose, onAdd,
}: {
  visible: boolean;
  addedIds: Set<string>;
  onClose: () => void;
  onAdd: (ex: ExerciseDBExercise) => void;
}) {
  const [bodyPart, setBodyPart]       = useState<string>('chest');
  const [exercises, setExercises]     = useState<ExerciseDBExercise[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async (bp: string) => {
    setLoading(true);
    setError(null);
    setExercises([]);
    try {
      const data = await fetchExercisesByBodyPart(bp, 20, 0);
      setExercises(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not load exercises');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load(bodyPart);
  }, [visible, bodyPart]);

  const handleBodyPartChange = (bp: string) => {
    setBodyPart(bp);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ps.root}>
        {/* ── Header ── */}
        <SafeAreaView edges={['top']} style={ps.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={ps.closeBtn}>
            <Ionicons name="close" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={ps.headerTitle}>Add Exercise</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {/* ── Body part chips ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={ps.bpRail}
          style={ps.bpScroll}
        >
          {BODY_PARTS.map(bp => (
            <TouchableOpacity
              key={bp.key}
              style={[ps.bpChip, bodyPart === bp.key && ps.bpChipActive]}
              onPress={() => handleBodyPartChange(bp.key)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={bp.icon as any}
                size={14}
                color={bodyPart === bp.key ? '#fff' : palette.gray450}
              />
              <ThemedText style={[ps.bpChipText, bodyPart === bp.key && ps.bpChipTextActive]}>
                {bp.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Exercise list ── */}
        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={ps.errorWrap}>
            <ThemedText style={ps.errorText}>{error}</ThemedText>
            <TouchableOpacity style={ps.retryBtn} onPress={() => load(bodyPart)}>
              <ThemedText style={ps.retryText}>Try again</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={ex => ex.id}
            contentContainerStyle={ps.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <ThemedText style={ps.resultLabel}>
                {exercises.length} exercises · tap to add
              </ThemedText>
            }
            renderItem={({ item: ex }) => {
              const already = addedIds.has(ex.id);
              const equipIcon = EQUIPMENT_ICON[ex.equipment] ?? 'barbell-outline';
              const gifUrl = getGifUrl(ex.name, ex.target);
              return (
                <TouchableOpacity
                  style={[ps.exRow, already && ps.exRowAdded]}
                  onPress={() => { if (!already) onAdd(ex); }}
                  activeOpacity={already ? 1 : 0.75}
                >
                  <ExerciseThumb gifUrl={gifUrl} icon={equipIcon} size={44} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={ps.exName} numberOfLines={2}>{ex.name}</ThemedText>
                    <ThemedText style={ps.exTarget}>{ex.target} · {ex.equipment}</ThemedText>
                  </View>
                  {already ? (
                    <View style={ps.addedBadge}>
                      <Ionicons name="checkmark" size={14} color={palette.success700} />
                      <ThemedText style={ps.addedText}>Added</ThemedText>
                    </View>
                  ) : (
                    <View style={ps.addBtn}>
                      <Ionicons name="add" size={18} color={palette.blue500} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={<View style={{ height: 60 }} />}
          />
        )}

        {addedIds.size > 0 && (
          <SafeAreaView edges={['bottom']} style={ps.ctaBar}>
            <TouchableOpacity style={ps.ctaBtn} onPress={onClose} activeOpacity={0.85}>
              <ThemedText style={ps.ctaBtnText}>
                Add {addedIds.size} {addedIds.size === 1 ? 'Exercise' : 'Exercises'} to Workout
              </ThemedText>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

// Wrapper forces a full remount whenever the target workout changes (including
// switching from "editing X" to "creating new"), so state from a previous
// session can never leak into a new one — see incident: an edit session's
// leftover state caused a "new" workout save to silently overwrite the
// previously-edited workout instead of inserting a fresh row.
export default function CreateWorkoutScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  return <CreateWorkoutForm key={workoutId ?? 'new'} />;
}

function CreateWorkoutForm() {
  const router = useRouter();
  const { workoutId: editWorkoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const isEditing = !!editWorkoutId;

  const [name, setName]               = useState('');
  const [location, setLocation]       = useState<'gym' | 'home' | 'both'>('gym');
  const [goal, setGoal]               = useState<string | null>(null);
  const [difficulty, setDifficulty]   = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [entries, setEntries]         = useState<WorkoutEntry[]>([]);
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  const [types, setTypes]             = useState<string[]>(['full_body']);
  const [duration, setDuration]       = useState(30);
  const [generating, setGenerating]   = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (editWorkoutId) return;
    (async () => {
      const session = await authService.getSession();
      if (!session?.user.id) return;
      const { data } = await supabase
        .from('fitness_profile')
        .select('goal')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (data?.goal) setGoal(data.goal);
    })();
  }, [editWorkoutId]);

  useEffect(() => {
    if (!editWorkoutId) return;
    (async () => {
      const [workoutRes, exRes] = await Promise.all([
        supabase.from('workouts').select('*').eq('id', editWorkoutId).single(),
        supabase
          .from('workout_exercises')
          .select(`
            sets, reps, rest_seconds, notes,
            exercises ( id, external_id, name, body_part, target_muscle, equipment, difficulty, instructions, gif_url )
          `)
          .eq('workout_id', editWorkoutId)
          .order('sort_order'),
      ]);

      if (workoutRes.data) {
        const w = workoutRes.data;
        setName(w.title);
        setLocation(w.location_type);
        setGoal(w.goal);
        setDifficulty(w.difficulty);
      }

      if (exRes.data) {
        const loaded: WorkoutEntry[] = (exRes.data as any[]).map((we, i) => {
          const ex = we.exercises;
          return {
            tempId:       `existing-${ex.id}-${i}`,
            externalId:   ex.external_id ?? ex.id,
            exerciseId:   ex.id,
            name:         ex.name,
            target:       ex.target_muscle,
            bodyPart:     ex.body_part,
            equipment:    ex.equipment,
            difficulty:   ex.difficulty,
            instructions: ex.instructions ?? [],
            gifUrl:       ex.gif_url,
            sets:         we.sets ?? 3,
            reps:         we.reps ?? 10,
            restSeconds:  we.rest_seconds ?? 60,
            notes:        we.notes ?? '',
          };
        });
        setEntries(loaded);
      }

      setLoadingExisting(false);
    })();
  }, [editWorkoutId]);

  const addedIds = new Set(entries.map(e => e.externalId));

  const handleAddExercise = (ex: ExerciseDBExercise) => {
    const gifUrl = getGifUrl(ex.name, ex.target);
    const entry: WorkoutEntry = {
      tempId:      `${Date.now()}-${Math.random()}`,
      externalId:  ex.id,
      exerciseId:  null,
      name:        ex.name,
      target:      ex.target,
      bodyPart:    ex.bodyPart,
      equipment:   ex.equipment,
      difficulty:  ex.difficulty,
      instructions: ex.instructions ?? [],
      gifUrl,
      sets:        3,
      reps:        10,
      restSeconds: 60,
      notes:       '',
    };
    setEntries(prev => [...prev, entry]);
  };

  const updateEntry = (tempId: string, updated: WorkoutEntry) =>
    setEntries(prev => prev.map(e => e.tempId === tempId ? updated : e));

  const removeEntry = (tempId: string) =>
    setEntries(prev => prev.filter(e => e.tempId !== tempId));

  const toggleType = (key: string) => {
    setTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleGenerateExercises = () => {
    if (types.length === 0) {
      setGenerateError('Select at least one type.');
      return;
    }
    const run = async () => {
      setGenerating(true);
      setGenerateError(null);
      try {
        const pool = await generateExercisePool({ location, types, difficulty, durationMinutes: duration });
        if (pool.length === 0) {
          setGenerateError('Could not find matching exercises. Try a different combination.');
          setGenerating(false);
          return;
        }
        const genEntries = pool.map(toGeneratedEntry);
        setEntries(genEntries);
        if (!name.trim()) {
          const labels = types.map(t => GENERATOR_TYPES.find(g => g.key === t)?.label ?? t);
          const typeLabel = labels.length <= 2 ? labels.join(' + ') : 'Custom';
          setName(`${typeLabel} Workout`);
        }
        setGenerating(false);
      } catch (e: any) {
        setGenerateError(e.message ?? 'Something went wrong.');
        setGenerating(false);
      }
    };
    if (entries.length > 0) {
      Alert.alert(
        'Replace exercises?',
        'This will replace the exercises you already added.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: run },
        ],
      );
    } else {
      run();
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please give your workout a name.');
      return;
    }
    if (entries.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise to your workout.');
      return;
    }

    setSaving(true);
    try {
      const session = await authService.getSession();
      if (!session?.user) {
        Alert.alert('Sign in required', 'Please sign in to save workouts.');
        setSaving(false);
        return;
      }

      const durationMinutes = Math.max(
        10,
        Math.round(entries.reduce((sum, e) => sum + e.sets * (e.restSeconds + 45), 0) / 60),
      );

      const equipmentList = [...new Set(
        entries
          .map(e => e.equipment?.trim())
          .filter((eq): eq is string => !!eq && eq.toLowerCase() !== 'body weight'),
      )].join(',');

      let workoutId: string;

      if (isEditing) {
        const { error: wErr } = await supabase
          .from('workouts')
          .update({
            title:            trimmedName,
            category:         goalToCategory(goal),
            location_type:    location,
            difficulty,
            goal:             toWorkoutGoal(goal),
            duration_minutes: durationMinutes,
            equipment:        equipmentList || null,
          })
          .eq('id', editWorkoutId);

        if (wErr) {
          Alert.alert('Error', wErr.message ?? 'Failed to update workout.');
          setSaving(false);
          return;
        }

        workoutId = editWorkoutId as string;

        // Reconcile exercises: drop existing links, then re-insert current entries below
        await supabase.from('workout_exercises').delete().eq('workout_id', workoutId);
      } else {
        const { data: workout, error: wErr } = await supabase
          .from('workouts')
          .insert({
            title:            trimmedName,
            category:         goalToCategory(goal),
            location_type:    location,
            difficulty,
            goal:             toWorkoutGoal(goal),
            duration_minutes: durationMinutes,
            equipment:        equipmentList || null,
            is_active:        true,
            user_id:          session.user.id,
          })
          .select('id')
          .single();

        if (wErr || !workout) {
          Alert.alert('Error', wErr?.message ?? 'Failed to create workout.');
          setSaving(false);
          return;
        }

        workoutId = workout.id;
      }

      // Upsert exercises and link them
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Upsert exercise into our exercises table (idempotent via external_id)
        const { data: ex, error: exErr } = await supabase
          .from('exercises')
          .upsert(
            {
              name:         entry.name,
              body_part:    entry.bodyPart,
              target_muscle: entry.target,
              equipment:    entry.equipment,
              difficulty:   entry.difficulty,
              instructions: entry.instructions,
              gif_url:      entry.gifUrl,
              external_id:  entry.externalId,
              source:       'ExerciseDB',
            },
            { onConflict: 'external_id' },
          )
          .select('id')
          .single();

        if (exErr || !ex) continue;

        await supabase.from('workout_exercises').insert({
          workout_id:   workoutId,
          exercise_id:  ex.id,
          sort_order:   i + 1,
          sets:         entry.sets,
          reps:         entry.reps,
          rest_seconds: entry.restSeconds,
          notes:        entry.notes.trim() || null,
        });
      }

      router.replace({
        pathname: '/workout-detail',
        params: { workoutId },
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length > 0 && entries.length > 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ExercisePicker
        visible={pickerOpen}
        addedIds={new Set(addedIds)}
        onClose={() => setPickerOpen(false)}
        onAdd={ex => handleAddExercise(ex)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.root}>
          {/* ── Header ── */}
          <SafeAreaView edges={['top']} style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={palette.ink900} />
            </TouchableOpacity>
            <ThemedText style={s.headerTitle}>{isEditing ? 'Edit Workout' : 'Create Workout'}</ThemedText>
            <TouchableOpacity
              style={[s.saveBtn, (!canSave || saving) && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <ThemedText style={s.saveBtnText}>Save</ThemedText>
              }
            </TouchableOpacity>
          </SafeAreaView>

          {loadingExisting ? (
            <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
          ) : (
          <ScrollView
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Name ── */}
            <TextInput
              style={s.nameInput}
              placeholder="Workout name..."
              placeholderTextColor={palette.gray300}
              value={name}
              onChangeText={setName}
              maxLength={60}
              returnKeyType="done"
            />

            {/* ── Location ── */}
            <View style={s.sectionHeader}>
              <ThemedText style={s.sectionEyebrow}>WORKOUT SETUP</ThemedText>
              <ThemedText style={s.sectionTitle}>Location</ThemedText>
            </View>
            <View style={s.toggleRow}>
              {LOCATION_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.togglePill, location === opt.key && s.togglePillActive]}
                  onPress={() => setLocation(opt.key)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={15}
                    color={location === opt.key ? '#fff' : palette.gray450}
                  />
                  <ThemedText style={[s.toggleText, location === opt.key && s.toggleTextActive]}>
                    {opt.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Difficulty ── */}
            <View style={s.sectionHeader}>
              <ThemedText style={s.sectionEyebrow}>WORKOUT SETUP</ThemedText>
              <ThemedText style={s.sectionTitle}>Difficulty</ThemedText>
            </View>
            <View style={s.diffRow}>
              {DIFFICULTIES.map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[s.diffChip, difficulty === d.key && s.diffChipActive]}
                  onPress={() => setDifficulty(d.key)}
                  activeOpacity={0.75}
                >
                  <ThemedText style={[s.diffText, difficulty === d.key && s.diffTextActive]}>
                    {d.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Type (for generating exercises) ── */}
            <View style={s.sectionHeader}>
              <ThemedText style={s.sectionEyebrow}>SELECT</ThemedText>
              <ThemedText style={s.sectionTitle}>Type (select one or more)</ThemedText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.typeGrid}
              style={s.typeScroll}
            >
              {GENERATOR_TYPES.map(t => {
                const active = types.includes(t.key);
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[s.typeChip, active && s.typeChipActive]}
                    onPress={() => toggleType(t.key)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.typeIconWrap, active && s.typeIconWrapActive]}>
                      <Ionicons name={t.icon as any} size={22} color={active ? '#fff' : palette.ink900} />
                    </View>
                    <ThemedText style={[s.typeLabel, active && s.typeLabelActive]}>{t.label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {types.includes('cardio') && (
              <View style={s.stravaHint}>
                <Ionicons name="information-circle-outline" size={14} color={palette.gray300} />
                <ThemedText style={s.stravaHintText}>
                  "Cardio" here means machine-based exercises (treadmill, jump rope, etc). Tracking an
                  outdoor run, walk or ride? Connect Strava from your Fitness Journey instead.
                </ThemedText>
              </View>
            )}

            {/* ── Duration (for generating exercises) ── */}
            <View style={s.sectionHeader}>
              <ThemedText style={s.sectionEyebrow}>SELECT</ThemedText>
              <ThemedText style={s.sectionTitle}>Duration</ThemedText>
            </View>
            <View style={s.durationRow}>
              {DURATION_OPTIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.durationPill, duration === d && s.togglePillActive]}
                  onPress={() => setDuration(d)}
                  activeOpacity={0.75}
                >
                  <ThemedText style={[s.toggleText, duration === d && s.toggleTextActive]}>{d} min</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.sectionDivider} />

            <TouchableOpacity
              style={[s.generateBtn, (generating || types.length === 0) && s.generateBtnDisabled]}
              onPress={handleGenerateExercises}
              disabled={generating || types.length === 0}
              activeOpacity={0.85}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <ThemedText style={s.generateBtnText}>Generate Exercises</ThemedText>
                </>
              )}
            </TouchableOpacity>
            {generateError && <ThemedText style={s.generateErrorText}>{generateError}</ThemedText>}

            {/* ── Exercise list ── */}
            <View style={s.sectionHeader}>
              <View style={s.exercisesHeader}>
                {entries.length > 0 && (
                  <ThemedText style={s.exerciseCount}>{entries.length} added</ThemedText>
                )}
              </View>
            </View>

            {entries.map((entry, idx) => (
              <EntryCard
                key={entry.tempId}
                entry={entry}
                idx={idx}
                onChange={updated => updateEntry(entry.tempId, updated)}
                onRemove={() => removeEntry(entry.tempId)}
              />
            ))}

            {/* ── Add exercise CTA ── */}
            <TouchableOpacity
              style={s.addExRow}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.7}
            >
              <ThemedText style={s.addExRowText}>
                Prefer to add exercises yourself? <ThemedText style={s.addExRowLink}>Add Exercise</ThemedText>
              </ThemedText>
            </TouchableOpacity>

            {/* ── Duration estimate ── */}
            {entries.length > 0 && (
              <View style={s.estimateRow}>
                <Ionicons name="time-outline" size={14} color={palette.gray300} />
                <ThemedText style={s.estimateText}>
                  Estimated duration:{' '}
                  {Math.max(10, Math.round(
                    entries.reduce((sum, e) => sum + e.sets * (e.restSeconds + 45), 0) / 60,
                  ))} min
                </ThemedText>
              </View>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white, paddingTop: 15 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },

  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 20, fontWeight: '800',
    letterSpacing: -0.4, color: palette.ink900,
  },
  saveBtn: {
    backgroundColor: palette.blue500, borderRadius: radii.pill,
    paddingHorizontal: 20, paddingVertical: 10, minWidth: 68, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: palette.gray300 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },

  content: { paddingHorizontal: 16, paddingTop: 20 },

  nameInput: {
    fontSize: 22, fontWeight: '800', color: palette.ink900,
    letterSpacing: -0.4, marginBottom: 28,
    borderBottomWidth: 2, borderBottomColor: palette.hairline,
    paddingBottom: 10,
  },

  // Section header (eyebrow + title, mirrors (tabs)/fitness.tsx's bodyPartHeader)
  sectionHeader: { marginBottom: 14 },
  sectionEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, color: palette.gray300, textTransform: 'uppercase', marginBottom: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },

  // Location toggle
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  togglePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: palette.border,
    backgroundColor: palette.white,
  },
  togglePillActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  toggleText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray450 },
  toggleTextActive: { color: '#fff' },

  // Difficulty
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  diffChip: {
    flex: 1, paddingVertical: 10, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: palette.border,
    alignItems: 'center',
  },
  diffChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  diffText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  diffTextActive: { color: '#fff' },

  // Type (for generating exercises) — mirrors browse-exercises.tsx's bpCard
  typeScroll: { marginBottom: 14 },
  typeGrid: { gap: 10, paddingBottom: 4, paddingRight: 4 },
  typeChip: {
    width: 88, alignItems: 'center', gap: 8,
    backgroundColor: palette.white,
    borderWidth: 1, borderColor: palette.hairline,
    borderRadius: radii.xl, paddingVertical: 16,
  },
  typeChipActive: { borderColor: palette.blue500, borderWidth: 1.5 },
  typeIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIconWrapActive: { backgroundColor: palette.blue500 },
  typeLabel: { fontSize: 11.5, fontWeight: '700', color: palette.ink700, textAlign: 'center' },
  typeLabelActive: { color: palette.blue500 },
  stravaHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4,
  },
  stravaHintText: { flex: 1, fontSize: fontSize.xs, color: palette.gray300, lineHeight: 16 },

  // Duration (for generating exercises)
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  durationPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: palette.border,
    backgroundColor: palette.white,
  },

  sectionDivider: { height: 1, backgroundColor: palette.hairline, marginBottom: 20 },

  // Generate button
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.blue500, borderRadius: radii.pill,
    paddingVertical: 14, marginBottom: 8,
  },
  generateBtnDisabled: { backgroundColor: palette.gray300 },
  generateBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  generateErrorText: { fontSize: fontSize.sm, color: palette.danger600, textAlign: 'center', marginBottom: 16 },

  // Exercises section
  exercisesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  exerciseCount: { fontSize: fontSize.sm, fontWeight: '600', color: palette.blue500 },

  // Entry card
  entryCard: {
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    backgroundColor: palette.white, marginBottom: 10, overflow: 'hidden',
  },
  entryTop: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, paddingBottom: 10,
  },
  entryThumbWrap: { position: 'relative', flexShrink: 0 },
  entryNumBadge: {
    position: 'absolute', top: -6, left: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: palette.white,
  },
  entryNumText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  entryName: { fontSize: 14, fontWeight: '800', color: palette.ink900, lineHeight: 18 },
  entryTarget: { fontSize: 11.5, color: palette.gray300, marginTop: 2, fontWeight: '500' },
  removeBtn: { padding: 4 },

  entryControls: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: palette.hairline,
    backgroundColor: palette.surfaceMuted,
  },
  controlItem: {
    flex: 1, alignItems: 'center', paddingVertical: 12, gap: 6,
  },
  controlLabel: {
    fontSize: 10, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  controlDivider: { width: 1, height: 40, backgroundColor: palette.hairline },
  entryNoteInput: {
    fontSize: 13, color: palette.ink700, lineHeight: 17,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: palette.hairline,
    minHeight: 38,
  },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: palette.white,
    borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { borderColor: palette.hairline },
  stepVal: { fontSize: 14, fontWeight: '800', color: palette.ink900, minWidth: 28, textAlign: 'center' },

  // Add exercise (secondary — Generate Exercises is the main CTA)
  addExRow: { alignItems: 'center', paddingVertical: 4, marginTop: 4, marginBottom: 16 },
  addExRowText: { fontSize: 13, color: palette.gray300, textAlign: 'center' },
  addExRowLink: { fontSize: 13, fontWeight: '700', color: palette.blue500 },

  // Duration estimate
  estimateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', paddingVertical: 8,
  },
  estimateText: { fontSize: fontSize.sm, color: palette.gray300, fontWeight: '500' },
});

// ── Picker styles ──────────────────────────────────────────────────────────────

const ps = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white, paddingTop: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },

  bpScroll: {
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
    maxHeight: 56,
  },
  bpRail: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  bpChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.white,
  },
  bpChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  bpChipText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  bpChipTextActive: { color: '#fff' },

  list: { paddingHorizontal: 16, paddingTop: 12 },
  resultLabel: {
    fontSize: 11, fontWeight: '600', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },

  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  exRowAdded: { opacity: 0.55 },
  exName: { fontSize: 14, fontWeight: '700', color: palette.ink900, lineHeight: 18 },
  exTarget: { fontSize: 12, color: palette.gray300, marginTop: 2, fontWeight: '500' },

  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  addedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.success50, borderRadius: radii.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  addedText: { fontSize: 11, fontWeight: '700', color: palette.success700 },

  errorWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  errorText: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: palette.blue500, borderRadius: radii.pill,
  },
  retryText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  ctaBar: {
    borderTopWidth: 1, borderTopColor: palette.hairline,
    backgroundColor: palette.white,
    paddingHorizontal: 16, paddingTop: 12,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.blue500, borderRadius: radii.pill,
    paddingVertical: 14,
  },
  ctaBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
});

import { fetchExercisesByBodyPart, type ExerciseDBExercise } from "./exercisedb";

export const GIF_BASE = "https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main";

const TARGET_TO_FOLDER: Record<string, string> = {
  pectorals: "pectorals", lats: "lats", "upper back": "upper-back",
  delts: "delts", biceps: "biceps", triceps: "triceps",
  abs: "abs", abdominals: "abs", glutes: "glutes",
  quads: "quads", quadriceps: "quads", hamstrings: "hamstrings",
  calves: "calves", gastrocnemius: "calves", forearms: "forearms",
  traps: "traps", "cardiovascular system": "cardio",
  spine: "spine", adductors: "adductors", abductors: "abductors",
  "serratus anterior": "serratus-anterior",
};

export function getGifUrl(name: string, target: string): string | null {
  const folder = TARGET_TO_FOLDER[target.toLowerCase()];
  if (!folder) return null;
  const slug = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${GIF_BASE}/${folder}/${slug}.gif`;
}

export const BODY_PARTS = [
  { key: "chest", label: "Chest" },
  { key: "back", label: "Back" },
  { key: "shoulders", label: "Shoulders" },
  { key: "upper arms", label: "Arms" },
  { key: "upper legs", label: "Quads" },
  { key: "lower legs", label: "Calves" },
  { key: "waist", label: "Core" },
  { key: "cardio", label: "Cardio" },
  { key: "lower arms", label: "Forearms" },
] as const;

export const DIFFICULTIES = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
] as const;

export const LOCATION_OPTIONS = [
  { key: "gym", label: "Gym" },
  { key: "home", label: "Home" },
  { key: "both", label: "Both" },
] as const;

export interface CuratedExercise {
  id: string; name: string; bodyPart: string; target: string;
  equipment: string; difficulty: string; instructions: string[]; gifUrl: string;
}

export const YOGA_POSES: CuratedExercise[] = [
  { id: "curated-childs-pose", name: "Child's Pose", bodyPart: "waist", target: "spine", equipment: "body weight", difficulty: "beginner",
    instructions: ["Kneel and sit back on your heels.", "Fold forward, extending your arms out, and breathe deeply."],
    gifUrl: `${GIF_BASE}/spine/spine-stretch.gif` },
  { id: "curated-cat-cow", name: "Cat-Cow Stretch", bodyPart: "waist", target: "spine", equipment: "body weight", difficulty: "beginner",
    instructions: ["On hands and knees, arch your back and look up (cow).", "Round your spine and tuck your chin (cat). Repeat slowly."],
    gifUrl: `${GIF_BASE}/spine/lower-back-curl.gif` },
  { id: "curated-cobra-pose", name: "Cobra Pose", bodyPart: "waist", target: "spine", equipment: "body weight", difficulty: "beginner",
    instructions: ["Lie face down, hands under your shoulders.", "Press up, lifting your chest while keeping your hips on the floor."],
    gifUrl: `${GIF_BASE}/spine/upward-facing-dog.gif` },
  { id: "curated-sphinx-pose", name: "Sphinx Pose", bodyPart: "waist", target: "spine", equipment: "body weight", difficulty: "beginner",
    instructions: ["Lie face down propped on your forearms, elbows under shoulders.", "Lift your chest gently and hold, keeping hips grounded."],
    gifUrl: `${GIF_BASE}/spine/sphinx.gif` },
  { id: "curated-butterfly-pose", name: "Butterfly Pose", bodyPart: "upper legs", target: "adductors", equipment: "body weight", difficulty: "beginner",
    instructions: ["Sit with the soles of your feet together, knees out to the sides.", "Hold your feet and gently press your knees toward the floor."],
    gifUrl: `${GIF_BASE}/adductors/butterfly-yoga-pose.gif` },
  { id: "curated-seated-wide-angle", name: "Seated Wide-Angle Pose", bodyPart: "upper legs", target: "hamstrings", equipment: "body weight", difficulty: "intermediate",
    instructions: ["Sit with legs spread wide, spine tall.", "Hinge forward from the hips and reach toward your feet."],
    gifUrl: `${GIF_BASE}/hamstrings/seated-wide-angle-pose-sequence.gif` },
  { id: "curated-reclining-big-toe", name: "Reclining Hand-to-Big-Toe Pose", bodyPart: "upper legs", target: "hamstrings", equipment: "band", difficulty: "intermediate",
    instructions: ["Lie on your back and loop a strap or towel around one foot.", "Extend that leg upward, keeping the other leg flat on the floor."],
    gifUrl: `${GIF_BASE}/hamstrings/reclining-big-toe-pose-with-rope.gif` },
  { id: "curated-downdog-flow", name: "Downward Dog to Cobra Flow", bodyPart: "back", target: "glutes", equipment: "body weight", difficulty: "beginner",
    instructions: ["From a plank, push your hips up into Downward Dog.", "Flow forward and down into Cobra, then repeat."],
    gifUrl: `${GIF_BASE}/glutes/pike-to-cobra-push-up.gif` },
];

export const STRETCHES: CuratedExercise[] = [
  { id: "curated-hamstring-calf-stretch", name: "Standing Hamstring & Calf Stretch", bodyPart: "lower legs", target: "hamstrings", equipment: "body weight", difficulty: "beginner",
    instructions: ["Loop a strap around your foot and extend the leg.", "Gently pull toward you, keeping the knee straight."],
    gifUrl: `${GIF_BASE}/hamstrings/standing-hamstring-and-calf-stretch-with-strap.gif` },
  { id: "curated-worlds-greatest-stretch", name: "World's Greatest Stretch", bodyPart: "upper legs", target: "hamstrings", equipment: "body weight", difficulty: "intermediate",
    instructions: ["Step into a deep lunge and place both hands down.", "Rotate your torso, reaching one arm to the sky."],
    gifUrl: `${GIF_BASE}/hamstrings/world-greatest-stretch.gif` },
  { id: "curated-hip-flexor-quad-stretch", name: "Hip Flexor & Quad Stretch", bodyPart: "upper legs", target: "quads", equipment: "body weight", difficulty: "beginner",
    instructions: ["Kneel in a half-lunge position.", "Push your hips forward until you feel a stretch in the front hip/thigh."],
    gifUrl: `${GIF_BASE}/quads/intermediate-hip-flexor-and-quad-stretch.gif` },
  { id: "curated-calf-wall-stretch", name: "Calf Stretch Against Wall", bodyPart: "lower legs", target: "calves", equipment: "body weight", difficulty: "beginner",
    instructions: ["Place your hands on a wall, step one foot back.", "Keep the back heel down and lean forward gently."],
    gifUrl: `${GIF_BASE}/calves/calf-stretch-with-hands-against-wall.gif` },
  { id: "curated-chest-shoulder-stretch", name: "Chest & Shoulder Stretch", bodyPart: "chest", target: "pectorals", equipment: "body weight", difficulty: "beginner",
    instructions: ["Clasp your hands behind your back.", "Lift your arms slightly and open your chest."],
    gifUrl: `${GIF_BASE}/pectorals/chest-and-front-of-shoulder-stretch.gif` },
  { id: "curated-triceps-stretch", name: "Triceps Stretch", bodyPart: "upper arms", target: "triceps", equipment: "body weight", difficulty: "beginner",
    instructions: ["Reach one arm overhead and bend the elbow.", "Use the other hand to gently press the elbow back."],
    gifUrl: `${GIF_BASE}/triceps/triceps-stretch.gif` },
  { id: "curated-lat-stretch", name: "Standing Lat Stretch", bodyPart: "back", target: "lats", equipment: "body weight", difficulty: "beginner",
    instructions: ["Reach one arm overhead and lean to the opposite side.", "Hold and feel the stretch down your side."],
    gifUrl: `${GIF_BASE}/lats/standing-lateral-stretch.gif` },
  { id: "curated-glute-stretch", name: "Seated Glute Stretch", bodyPart: "upper legs", target: "glutes", equipment: "body weight", difficulty: "beginner",
    instructions: ["Sit and cross one ankle over the opposite knee.", "Lean forward gently until you feel a stretch in the glute."],
    gifUrl: `${GIF_BASE}/glutes/seated-glute-stretch.gif` },
  { id: "curated-piriformis-stretch", name: "Seated Piriformis Stretch", bodyPart: "upper legs", target: "glutes", equipment: "body weight", difficulty: "beginner",
    instructions: ["Sit tall and cross one leg over the other.", "Twist gently toward the crossed leg to feel the stretch."],
    gifUrl: `${GIF_BASE}/glutes/seated-piriformis-stretch.gif` },
  { id: "curated-neck-stretch", name: "Neck Side Stretch", bodyPart: "neck", target: "neck", equipment: "body weight", difficulty: "beginner",
    instructions: ["Tilt your head gently to one side.", "Use your hand for light overpressure, then switch sides."],
    gifUrl: `${GIF_BASE}/levator-scapulae/neck-side-stretch.gif` },
  { id: "curated-upper-back-stretch", name: "Upper Back Stretch", bodyPart: "back", target: "upper back", equipment: "body weight", difficulty: "beginner",
    instructions: ["Clasp your hands in front and round your upper back.", "Push your hands away from you and hold the stretch."],
    gifUrl: `${GIF_BASE}/upper-back/upper-back-stretch.gif` },
  { id: "curated-wrist-stretch", name: "Wrist Flexor Stretch", bodyPart: "lower arms", target: "forearms", equipment: "body weight", difficulty: "beginner",
    instructions: ["Extend one arm out, palm up.", "Use the other hand to gently pull the fingers back."],
    gifUrl: `${GIF_BASE}/forearms/side-wrist-pull-stretch.gif` },
];

export const GENERATOR_TYPES = [
  { key: "push", label: "Push" },
  { key: "pull", label: "Pull" },
  { key: "legs", label: "Legs" },
  { key: "core", label: "Core" },
  { key: "full_body", label: "Full Body" },
  { key: "cardio", label: "Cardio" },
  { key: "chest", label: "Chest" },
  { key: "back", label: "Back" },
  { key: "shoulders", label: "Shoulders" },
  { key: "arms", label: "Arms" },
  { key: "quads", label: "Quads" },
  { key: "calves", label: "Calves" },
  { key: "forearms", label: "Forearms" },
  { key: "neck", label: "Neck" },
  { key: "yoga", label: "Yoga" },
  { key: "stretch", label: "Stretching" },
] as const;

export const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120] as const;

const TYPE_BODY_PARTS: Record<string, string[]> = {
  push: ["chest", "shoulders", "upper arms"],
  pull: ["back", "upper arms"],
  legs: ["upper legs", "lower legs"],
  core: ["waist"],
  full_body: ["chest", "back", "upper legs", "waist"],
  cardio: ["cardio"],
  chest: ["chest"],
  back: ["back"],
  shoulders: ["shoulders"],
  arms: ["upper arms"],
  quads: ["upper legs"],
  calves: ["lower legs"],
  forearms: ["lower arms"],
  neck: ["neck"],
};

const HOME_EQUIPMENT = new Set(["body weight", "dumbbell", "band", "kettlebell"]);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function matchesLocation(location: "gym" | "home" | "both", equipment: string): boolean {
  if (location === "gym") return true;
  return HOME_EQUIPMENT.has((equipment ?? "").toLowerCase());
}

function matchesPushPull(type: string, ex: ExerciseDBExercise): boolean {
  if (ex.bodyPart !== "upper arms") return true;
  if (type === "push") return ex.target === "triceps";
  if (type === "pull") return ex.target === "biceps";
  return true;
}

function filterByDifficulty<T extends { difficulty: string }>(list: T[], difficulty: string): T[] {
  const matched = list.filter((e) => e.difficulty?.toLowerCase() === difficulty);
  return matched.length >= 3 ? matched : list;
}

function defaultsForType(type: string): { sets: number; reps: number; restSeconds: number } {
  if (type === "cardio") return { sets: 3, reps: 15, restSeconds: 30 };
  if (type === "yoga" || type === "stretch") return { sets: 3, reps: 1, restSeconds: 30 };
  return { sets: 3, reps: 10, restSeconds: 60 };
}

function secondsPerExercise(type: string): number {
  return type === "cardio" || type === "yoga" || type === "stretch" ? 225 : 315;
}

export interface GeneratorInput {
  location: "gym" | "home" | "both";
  types: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  durationMinutes: number;
}

export interface GeneratedItem {
  ex: ExerciseDBExercise | CuratedExercise;
  type: string;
}

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
    if (i < pages - 1) await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

export async function generateExercisePool(input: GeneratorInput): Promise<GeneratedItem[]> {
  const types = input.types.length > 0 ? input.types : ["full_body"];
  const perTypeDuration = input.durationMinutes / types.length;

  const out: GeneratedItem[] = [];
  for (const type of types) {
    const count = Math.min(20, Math.max(2, Math.round((perTypeDuration * 60) / secondsPerExercise(type))));

    if (type === "yoga" || type === "stretch") {
      const pool = filterByDifficulty(type === "yoga" ? YOGA_POSES : STRETCHES, input.difficulty);
      out.push(...shuffle(pool).slice(0, Math.min(count, pool.length)).map((ex) => ({ ex, type })));
      continue;
    }

    const bodyParts = TYPE_BODY_PARTS[type] ?? ["chest"];
    let pool: ExerciseDBExercise[] = [];
    for (const bp of bodyParts) {
      pool.push(...(await fetchBodyPartPool(bp)));
    }
    pool = pool.filter((ex) => matchesLocation(input.location, ex.equipment));
    pool = pool.filter((ex) => matchesPushPull(type, ex));
    pool = filterByDifficulty(pool, input.difficulty);
    out.push(...shuffle(pool).slice(0, Math.min(count, pool.length)).map((ex) => ({ ex, type })));
  }

  return out;
}

export interface WorkoutEntry {
  tempId: string;
  externalId: string;
  exerciseId: string | null;
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

export function toGeneratedEntry(item: GeneratedItem): WorkoutEntry {
  const { ex, type } = item;
  const isCurated = type === "yoga" || type === "stretch";
  const defaults = defaultsForType(type);
  const gifUrl = isCurated ? (ex as CuratedExercise).gifUrl : getGifUrl(ex.name, (ex as ExerciseDBExercise).target);
  return {
    tempId: `${Date.now()}-${Math.random()}`,
    externalId: ex.id,
    exerciseId: null,
    name: ex.name,
    target: (ex as any).target,
    bodyPart: (ex as any).bodyPart,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    instructions: ex.instructions ?? [],
    gifUrl,
    ...defaults,
    notes: "",
  };
}

export function entryFromExercise(ex: ExerciseDBExercise): WorkoutEntry {
  return {
    tempId: `${Date.now()}-${Math.random()}`,
    externalId: ex.id,
    exerciseId: null,
    name: ex.name,
    target: ex.target,
    bodyPart: ex.bodyPart,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    instructions: ex.instructions ?? [],
    gifUrl: getGifUrl(ex.name, ex.target),
    sets: 3,
    reps: 10,
    restSeconds: 60,
    notes: "",
  };
}

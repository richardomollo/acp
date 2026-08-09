const BASE = 'https://exercisedb.p.rapidapi.com';

function headers() {
  return {
    'X-RapidAPI-Key': process.env.EXPO_PUBLIC_EXERCISEDB_KEY ?? '',
    'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
  };
}

export interface ExerciseDBExercise {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  category: string;
  difficulty: string;
  description: string;
  secondaryMuscles: string[];
  instructions: string[];
}

export async function fetchExercisesByBodyPart(
  bodyPart: string,
  limit = 15,
  offset = 0,
): Promise<ExerciseDBExercise[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `${BASE}/exercises/bodyPart/${encodeURIComponent(bodyPart)}?limit=${limit}&offset=${offset}`,
      { headers: headers() },
    );
    if (res.ok) return res.json();
    // The RapidAPI plan this app uses has a tight per-second rate limit —
    // bursts of parallel requests (e.g. the workout generator paging through
    // several body parts at once) can trip 429/403 even with valid quota.
    if ((res.status === 429 || res.status === 403) && attempt === 0) {
      await new Promise(r => setTimeout(r, 800));
      continue;
    }
    throw new Error(`ExerciseDB error ${res.status}`);
  }
}

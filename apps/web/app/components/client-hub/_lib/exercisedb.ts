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
  offset = 0
): Promise<ExerciseDBExercise[]> {
  const res = await fetch(
    `/api/exercisedb?bodyPart=${encodeURIComponent(bodyPart)}&limit=${limit}&offset=${offset}`
  );
  if (!res.ok) throw new Error(`ExerciseDB error ${res.status}`);
  return res.json();
}

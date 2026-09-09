import { supabase } from "@/app/lib/supabase/client";
import type { PickableExercise } from "./types";

/**
 * Every `workout_template_exercises.exercise_id` must be a real
 * `public.exercises` row. An ExerciseDB search hit isn't one yet — normalise it
 * in by `external_id` (idempotent; `"Authenticated users can insert exercises"`
 * RLS allows this, exactly as the legacy assign flow does). A pick that is
 * already a local uuid is returned as-is.
 */
export async function resolveExerciseId(ex: PickableExercise): Promise<string> {
  // already a public.exercises uuid (36-char)?
  if (!ex.externalId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ex.id)) {
    return ex.id;
  }
  const externalId = ex.externalId ?? ex.id;
  const { data, error } = await supabase
    .from("exercises")
    .upsert(
      {
        name: ex.name,
        body_part: ex.bodyPart || null,
        target_muscle: ex.target || null,
        equipment: ex.equipment || null,
        instructions: ex.instructions ?? [],
        gif_url: ex.gifUrl,
        external_id: externalId,
        source: "ExerciseDB",
      },
      { onConflict: "external_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save exercise");
  return data.id as string;
}

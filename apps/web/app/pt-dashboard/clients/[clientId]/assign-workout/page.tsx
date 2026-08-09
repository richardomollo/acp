"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { WorkoutBuilder, type WorkoutEntry, type WorkoutMeta } from "../../../../components/client-hub/WorkoutBuilder";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AssignWorkoutPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const handleSave = async (entries: WorkoutEntry[], meta: WorkoutMeta) => {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/partner-login"); return; }
      const { data: pt } = await supabase
        .from("personal_trainers").select("id").eq("user_id", user.id).single();
      if (!pt) {
        setError("Could not find your trainer profile.");
        setSaving(false);
        return;
      }

      const { data: workout, error: wErr } = await supabase
        .from("workouts")
        .insert({
          title: meta.name,
          category: "full_body",
          location_type: meta.location,
          difficulty: meta.difficulty,
          duration_minutes: meta.durationMinutes,
          equipment: meta.equipment,
          is_active: true,
          user_id: clientId,
          assigned_by: pt.id,
        })
        .select("id")
        .single();

      if (wErr || !workout) {
        setError(wErr?.message ?? "Failed to assign workout.");
        setSaving(false);
        return;
      }

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const { data: ex, error: exErr } = await supabase
          .from("exercises")
          .upsert({
            name: entry.name,
            body_part: entry.bodyPart,
            target_muscle: entry.target,
            equipment: entry.equipment,
            difficulty: entry.difficulty,
            instructions: entry.instructions,
            gif_url: entry.gifUrl,
            external_id: entry.externalId,
            source: "ExerciseDB",
          }, { onConflict: "external_id" })
          .select("id")
          .single();

        if (exErr || !ex) continue;

        await supabase.from("workout_exercises").insert({
          workout_id: workout.id,
          exercise_id: ex.id,
          sort_order: i + 1,
          sets: entry.sets,
          reps: entry.reps,
          rest_seconds: entry.restSeconds,
          notes: entry.notes.trim() || null,
        });
      }

      router.push(`/pt-dashboard/clients/${clientId}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
      setSaving(false);
    }
  };

  if (!clientId) return null;

  return (
    <WorkoutBuilder
      backHref={`/pt-dashboard/clients/${clientId}`}
      saving={saving}
      error={error}
      onSave={handleSave}
    />
  );
}

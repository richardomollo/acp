"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { ExercisePicker, ExerciseThumb } from "../../../../components/client-hub/_lib/ExercisePicker";
import { getGifUrl } from "../../../../components/client-hub/_lib/workoutGenerator";
import type { ExerciseDBExercise } from "../../../../components/client-hub/_lib/exercisedb";
import { Button } from "../../../../components/ui/Button";
import { Chip } from "../../../../components/ui/Chip";
import { Stepper } from "../../../../components/ui/Stepper";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SetEntry { setNumber: number; weightKg: number | null; reps: number; }

interface SessionExercise {
  key: string;
  exerciseId: string | null;
  externalId: string;
  name: string; target: string; bodyPart: string; equipment: string;
  difficulty: string; instructions: string[]; gifUrl: string | null;
  sets: SetEntry[];
}

interface AssignedWorkout { id: string; title: string; }

function SessionExerciseCard({
  exercise, onAddSet, onRemoveSet, onRemoveExercise,
}: {
  exercise: SessionExercise;
  onAddSet: (weightKg: number | null, reps: number) => void;
  onRemoveSet: (setNumber: number) => void;
  onRemoveExercise: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(10);

  return (
    <div className="border-[1.5px] border-[--border-faint] rounded-2xl overflow-hidden mb-2.5">
      <div className="flex items-start gap-2.5 p-3.5 pb-2.5">
        <ExerciseThumb gifUrl={exercise.gifUrl} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-ink-900 leading-snug">{exercise.name}</p>
          <p className="text-xs text-[--text-muted] mt-0.5">{exercise.target} · {exercise.equipment}</p>
        </div>
        <button onClick={onRemoveExercise} className="p-1 text-danger flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>

      {exercise.sets.length > 0 && (
        <div className="px-3.5 pb-2 flex flex-col gap-1.5">
          {exercise.sets.map(set => (
            <div key={set.setNumber} className="flex items-center gap-2.5 bg-surface-muted rounded-lg px-2.5 py-2">
              <span className="text-xs font-bold text-[--text-secondary] w-12">Set {set.setNumber}</span>
              <span className="text-sm font-bold text-ink-900 flex-1">
                {set.weightKg != null ? `${set.weightKg}kg × ` : ""}{set.reps} reps
              </span>
              <button onClick={() => onRemoveSet(set.setNumber)}>
                <svg className="w-3.5 h-3.5 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center border-t border-[--border-faint] bg-surface-muted">
          <div className="flex-1 flex flex-col items-center gap-1.5 py-3">
            <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wide">Weight</span>
            <Stepper value={weight} min={0} max={500} step={2.5} suffix="kg" onChange={setWeight} />
          </div>
          <div className="w-px h-10 bg-[--border-faint]" />
          <div className="flex-1 flex flex-col items-center gap-1.5 py-3">
            <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wide">Reps</span>
            <Stepper value={reps} min={1} max={50} onChange={setReps} />
          </div>
          <button
            onClick={() => { onAddSet(weight > 0 ? weight : null, reps); setAdding(false); setWeight(0); setReps(10); }}
            className="w-10 h-10 rounded-full bg-success flex items-center justify-center mr-3"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 py-3 border-t border-[--border-faint] text-sm font-bold text-blue-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Set
        </button>
      )}
    </div>
  );
}

export default function LogSessionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);

  const [mode, setMode] = useState<"assigned" | "new">("assigned");
  const [name, setName] = useState(`Session — ${new Date().toLocaleDateString("en-KE", { day: "numeric", month: "short" })}`);

  const [assignedWorkouts, setAssignedWorkouts] = useState<AssignedWorkout[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [loadingExercises, setLoadingExercises] = useState(false);

  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const addedIds = useMemo(() => new Set(exercises.map(e => e.externalId)), [exercises]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoadingWorkouts(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/partner-login"); return; }
      const { data: pt } = await supabase.from("personal_trainers").select("id").eq("user_id", user.id).single();
      if (!pt) { setLoadingWorkouts(false); return; }
      const { data } = await supabase
        .from("workouts")
        .select("id, title")
        .eq("user_id", clientId)
        .eq("assigned_by", pt.id)
        .order("created_at", { ascending: false });
      setAssignedWorkouts((data as any) ?? []);
      setLoadingWorkouts(false);
    })();
  }, [clientId, router]);

  const selectAssignedWorkout = async (workoutId: string) => {
    setSelectedWorkoutId(workoutId);
    setLoadingExercises(true);
    const { data } = await supabase
      .from("workout_exercises")
      .select("sets, reps, exercises(id, name, target_muscle, body_part, equipment, difficulty, instructions, gif_url, external_id)")
      .eq("workout_id", workoutId)
      .order("sort_order", { ascending: true });

    const mapped: SessionExercise[] = ((data as any) ?? []).map((row: any, idx: number) => ({
      key: `${row.exercises.id}-${idx}`,
      exerciseId: row.exercises.id,
      externalId: row.exercises.external_id,
      name: row.exercises.name,
      target: row.exercises.target_muscle,
      bodyPart: row.exercises.body_part,
      equipment: row.exercises.equipment,
      difficulty: row.exercises.difficulty,
      instructions: row.exercises.instructions ?? [],
      gifUrl: row.exercises.gif_url,
      sets: [],
    }));
    setExercises(mapped);
    setLoadingExercises(false);
  };

  const handleAddExercise = (ex: ExerciseDBExercise) => {
    const entry: SessionExercise = {
      key: `${Date.now()}-${Math.random()}`,
      exerciseId: null,
      externalId: ex.id,
      name: ex.name, target: ex.target, bodyPart: ex.bodyPart,
      equipment: ex.equipment, difficulty: ex.difficulty,
      instructions: ex.instructions ?? [],
      gifUrl: getGifUrl(ex.name, ex.target),
      sets: [],
    };
    setExercises(prev => [...prev, entry]);
  };

  const addSet = (key: string, weightKg: number | null, reps: number) => {
    setExercises(prev => prev.map(e => e.key === key
      ? { ...e, sets: [...e.sets, { setNumber: e.sets.length + 1, weightKg, reps }] }
      : e));
  };
  const removeSet = (key: string, setNumber: number) => {
    setExercises(prev => prev.map(e => e.key === key
      ? { ...e, sets: e.sets.filter(s => s.setNumber !== setNumber).map((s, i) => ({ ...s, setNumber: i + 1 })) }
      : e));
  };
  const removeExercise = (key: string) => setExercises(prev => prev.filter(e => e.key !== key));

  const totalSetsLogged = exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const canSave = totalSetsLogged > 0 && (mode === "assigned" ? !!selectedWorkoutId : name.trim().length > 0);

  const handleFinish = async () => {
    if (!canSave || !clientId) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/partner-login"); return; }
      const { data: pt } = await supabase.from("personal_trainers").select("id").eq("user_id", user.id).single();
      if (!pt) { setError("Trainer profile not found."); setSaving(false); return; }

      let workoutId = selectedWorkoutId;

      if (mode === "new") {
        const { data: workout, error: wErr } = await supabase
          .from("workouts")
          .insert({
            title: name.trim(), category: "full_body", location_type: "gym",
            difficulty: "intermediate", duration_minutes: Math.max(10, totalSetsLogged * 3),
            is_active: true, user_id: clientId, assigned_by: pt.id,
          })
          .select("id").single();
        if (wErr || !workout) { setError(wErr?.message ?? "Failed to save session."); setSaving(false); return; }
        workoutId = workout.id;

        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          const { data: exRow } = await supabase
            .from("exercises")
            .upsert({
              name: ex.name, body_part: ex.bodyPart, target_muscle: ex.target,
              equipment: ex.equipment, difficulty: ex.difficulty,
              instructions: ex.instructions, gif_url: ex.gifUrl,
              external_id: ex.externalId, source: "ExerciseDB",
            }, { onConflict: "external_id" })
            .select("id").single();
          if (!exRow) continue;
          ex.exerciseId = exRow.id;
          await supabase.from("workout_exercises").insert({
            workout_id: workoutId, exercise_id: exRow.id, sort_order: i + 1,
            sets: ex.sets.length || 1, reps: ex.sets[0]?.reps ?? 10, rest_seconds: 60,
          });
        }
      }

      const durationMinutes = Math.max(10, Math.round(totalSetsLogged * 2.5));
      const { data: history, error: hErr } = await supabase
        .from("workout_history")
        .insert({
          user_id: clientId, workout_id: workoutId, duration_minutes: durationMinutes,
          rating: rating > 0 ? rating : null, notes: note.trim() || null,
          logged_by_pt_id: pt.id,
        })
        .select("id").single();
      if (hErr || !history) { setError(hErr?.message ?? "Failed to log session."); setSaving(false); return; }

      const setLogRows = exercises.flatMap(ex => ex.sets.map(set => ({
        user_id: clientId, workout_history_id: history.id,
        exercise_id: ex.exerciseId, set_number: set.setNumber,
        weight_kg: set.weightKg, reps: set.reps, logged_by_pt_id: pt.id,
      })));
      if (setLogRows.length > 0) await supabase.from("workout_set_logs").insert(setLogRows);

      router.push(`/pt-dashboard/clients/${clientId}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
      setSaving(false);
    }
  };

  if (!clientId) return null;

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto pb-32">
      <ExercisePicker
        open={pickerOpen}
        addedIds={addedIds}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercise}
      />

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-[--text-secondary] hover:underline">← Back</button>
        <h1 className="text-lg font-bold text-ink-900 flex-1">Log Session</h1>
        <Button size="sm" onClick={handleFinish} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Finish"}
        </Button>
      </div>

      {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      <div className="flex gap-2 mb-5">
        <Chip selected={mode === "assigned"} onClick={() => setMode("assigned")} className="flex-1 text-center justify-center">
          Assigned Workout
        </Chip>
        <Chip selected={mode === "new"} onClick={() => setMode("new")} className="flex-1 text-center justify-center">
          New Session
        </Chip>
      </div>

      {mode === "assigned" ? (
        loadingWorkouts ? (
          <p className="text-[--text-muted] mt-4">Loading…</p>
        ) : assignedWorkouts.length === 0 ? (
          <p className="text-sm text-[--text-muted] mb-5">No workouts assigned to this client yet.</p>
        ) : (
          <div className="mb-5 space-y-2">
            {assignedWorkouts.map(w => (
              <button
                key={w.id}
                onClick={() => selectAssignedWorkout(w.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-xl border-[1.5px] text-left transition ${selectedWorkoutId === w.id ? "border-blue-500 bg-blue-50" : "border-[--border-faint]"}`}
              >
                <span className={`text-sm font-bold ${selectedWorkoutId === w.id ? "text-blue-500" : "text-ink-900"}`}>{w.title}</span>
                {selectedWorkoutId === w.id && (
                  <svg className="w-[18px] h-[18px] text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                )}
              </button>
            ))}
          </div>
        )
      ) : (
        <input
          type="text"
          placeholder="Session name..."
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          className="w-full text-xl font-extrabold text-ink-900 border-b-2 border-[--border-faint] pb-2.5 mb-5 focus:outline-none focus:border-ink-900 bg-transparent"
        />
      )}

      {loadingExercises && <p className="text-[--text-muted] mb-4">Loading exercises…</p>}

      {exercises.map(ex => (
        <SessionExerciseCard
          key={ex.key}
          exercise={ex}
          onAddSet={(weightKg, reps) => addSet(ex.key, weightKg, reps)}
          onRemoveSet={setNumber => removeSet(ex.key, setNumber)}
          onRemoveExercise={() => removeExercise(ex.key)}
        />
      ))}

      {mode === "new" && (
        <button onClick={() => setPickerOpen(true)} className="w-full flex items-center justify-center gap-1.5 py-3.5 mb-2 text-sm font-bold text-blue-500">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Exercise
        </button>
      )}

      {exercises.length > 0 && (
        <>
          <p className="text-sm font-bold text-ink-600 mt-2 mb-2.5">How did it go? (optional)</p>
          <div className="flex gap-2.5 mb-4">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(rating === n ? 0 : n)}>
                <svg className={`w-6 h-6 ${n <= rating ? "text-[--warning-500]" : "text-[--gray-200]"}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </button>
            ))}
          </div>
          <textarea
            placeholder="Session notes (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-xl text-sm focus:outline-none focus:border-blue-500 resize-none bg-surface"
          />
        </>
      )}
    </div>
  );
}

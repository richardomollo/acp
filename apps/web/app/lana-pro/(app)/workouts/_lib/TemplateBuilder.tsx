"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import {
  CATEGORIES,
  nextKey,
  type Difficulty,
  type LocationType,
  type PickableExercise,
  type TemplateDraft,
  type TemplateExerciseDraft,
} from "./types";
import { resolveExerciseId } from "./resolveExercise";
import { ExercisePickerModal } from "./ExercisePicker";

const LOCATIONS: { k: LocationType; label: string }[] = [
  { k: "gym", label: "Gym" },
  { k: "home", label: "Home" },
  { k: "both", label: "Both" },
];
const DIFFS: { k: Difficulty; label: string }[] = [
  { k: "beginner", label: "Beginner" },
  { k: "intermediate", label: "Intermediate" },
  { k: "advanced", label: "Advanced" },
];

function NumField({
  label,
  value,
  min,
  onChange,
  suffix,
}: {
  label: string;
  value: number | null;
  min: number;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw === "" ? null : Math.max(min, Number(raw)));
          }}
          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm tabular-nums"
        />
        {suffix && <span className="text-[11px] text-gray-400">{suffix}</span>}
      </span>
    </label>
  );
}

export function TemplateBuilder({
  initial,
  workspace,
  mode,
}: {
  initial: TemplateDraft;
  workspace: "independent" | "employed";
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setEx = (key: string, patch: Partial<TemplateExerciseDraft>) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const move = (idx: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = idx + dir;
      if (j < 0 || j >= d.exercises.length) return d;
      const next = d.exercises.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...d, exercises: next };
    });

  const remove = (key: string) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== key) }));

  const addExercise = async (ex: PickableExercise) => {
    try {
      const exerciseId = await resolveExerciseId(ex);
      setDraft((d) => ({
        ...d,
        exercises: [
          ...d.exercises,
          {
            key: nextKey(),
            exerciseId,
            name: ex.name,
            target: ex.target,
            equipment: ex.equipment,
            gifUrl: ex.gifUrl,
            sets: 3,
            reps: 10,
            durationSeconds: null,
            restSeconds: 60,
            loadGuidance: null,
            notes: null,
          },
        ],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add exercise");
    }
  };

  const addedNames = useMemo(
    () => new Set(draft.exercises.map((e) => e.name.toLowerCase())),
    [draft.exercises],
  );

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!draft.title.trim()) p.push("Add a workout name.");
    if (!draft.category.trim()) p.push("Choose a category.");
    if (draft.exercises.length === 0) p.push("Add at least one exercise.");
    for (const e of draft.exercises) {
      if (e.sets == null && e.reps == null && e.durationSeconds == null) {
        p.push(`${e.name}: set reps, or a duration.`);
      }
    }
    return p;
  }, [draft]);

  const save = async () => {
    if (problems.length > 0) return;
    setSaving(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("lana_pro_save_workout_template", {
      p_template_id: draft.id,
      p_workspace: workspace,
      p_title: draft.title.trim(),
      p_description: draft.description.trim() || null,
      p_category: draft.category,
      p_location_type: draft.locationType,
      p_difficulty: draft.difficulty,
      p_estimated_duration_minutes: draft.estimatedDurationMinutes,
      p_source: draft.source,
      p_exercises: draft.exercises.map((e, i) => ({
        exercise_id: e.exerciseId,
        sort_order: i,
        sets: e.sets,
        reps: e.reps,
        duration_seconds: e.durationSeconds,
        rest_seconds: e.restSeconds,
        load_guidance: e.loadGuidance,
        notes: e.notes,
      })),
    });
    setSaving(false);
    if (rpcErr || !data) {
      setError(
        /PGRST202|schema cache/i.test(rpcErr?.message ?? "")
          ? "Saving isn't available yet on this environment (the save function isn't deployed)."
          : rpcErr?.message ?? "Could not save the workout.",
      );
      return;
    }
    router.push(`/lana-pro/workouts/${data}`);
    router.refresh();
  };

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <button
        onClick={() => router.push("/lana-pro/workouts")}
        className="text-sm font-semibold text-gray-400 hover:text-gray-700 mb-5"
      >
        ← Workouts
      </button>

      {draft.source === "lana_generated" && mode === "create" && (
        <p className="mb-4 text-xs font-semibold text-[#050040] bg-gray-100 rounded-lg px-3 py-2 inline-block">
          Generated by Lana · review before saving
        </p>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Workout name</span>
          <input
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Upper Body Strength"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Category</span>
            <select
              value={draft.category}
              onChange={(e) => set({ category: e.target.value })}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm capitalize"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Est. duration</span>
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.estimatedDurationMinutes ?? ""}
                onChange={(e) =>
                  set({ estimatedDurationMinutes: e.target.value.trim() === "" ? null : Math.max(1, Number(e.target.value)) })
                }
                className="w-20 rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums"
              />
              <span className="text-xs text-gray-400">min</span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Location</span>
            <div className="mt-1 flex gap-1.5">
              {LOCATIONS.map((l) => (
                <button
                  key={l.k}
                  onClick={() => set({ locationType: l.k })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                    draft.locationType === l.k
                      ? "bg-[#050040] text-white border-[#050040]"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Difficulty</span>
            <div className="mt-1 flex gap-1.5">
              {DIFFS.map((l) => (
                <button
                  key={l.k}
                  onClick={() => set({ difficulty: l.k })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                    draft.difficulty === l.k
                      ? "bg-[#050040] text-white border-[#050040]"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Description</span>
          <textarea
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mt-8 mb-3">
        Exercises {draft.exercises.length > 0 && `· ${draft.exercises.length}`}
      </h2>

      {draft.exercises.length === 0 ? (
        <p className="text-sm text-gray-400">No exercises yet.</p>
      ) : (
        <ul className="space-y-3">
          {draft.exercises.map((e, i) => (
            <li key={e.key} className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-gray-300 w-5 pt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 capitalize">{e.name}</p>
                  <p className="text-[11px] text-gray-400 capitalize">
                    {e.target} · {e.equipment}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <NumField label="Sets" value={e.sets} min={1} onChange={(v) => setEx(e.key, { sets: v })} />
                    <NumField label="Reps" value={e.reps} min={1} onChange={(v) => setEx(e.key, { reps: v })} />
                    <NumField
                      label="Time"
                      value={e.durationSeconds}
                      min={1}
                      suffix="sec"
                      onChange={(v) => setEx(e.key, { durationSeconds: v })}
                    />
                    <NumField
                      label="Rest"
                      value={e.restSeconds}
                      min={0}
                      suffix="sec"
                      onChange={(v) => setEx(e.key, { restSeconds: v ?? 0 })}
                    />
                  </div>
                  <input
                    value={e.loadGuidance ?? ""}
                    onChange={(ev) => setEx(e.key, { loadGuidance: ev.target.value || null })}
                    placeholder="Load guidance (e.g. 70% 1RM) — optional"
                    className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 disabled:text-gray-200 text-xs px-1">
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === draft.exercises.length - 1}
                    className="text-gray-400 disabled:text-gray-200 text-xs px-1"
                  >
                    ▼
                  </button>
                  <button onClick={() => remove(e.key)} className="text-red-400 hover:text-red-600 text-xs px-1 mt-1">
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setPicking(true)}
        className="mt-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400"
      >
        + Add exercise
      </button>

      {problems.length > 0 && (
        <ul className="mt-6 text-xs text-amber-600 space-y-0.5">
          {problems.map((p, i) => (
            <li key={i}>• {p}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving || problems.length > 0}
          className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 hover:bg-[#0a0866] disabled:opacity-40"
        >
          {saving ? "Saving…" : mode === "create" ? "Save workout" : "Save changes"}
        </button>
        <button
          onClick={() => router.push("/lana-pro/workouts")}
          className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 hover:border-gray-400"
        >
          Cancel
        </button>
      </div>

      {picking && (
        <ExercisePickerModal addedNames={addedNames} onAdd={(ex) => void addExercise(ex)} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

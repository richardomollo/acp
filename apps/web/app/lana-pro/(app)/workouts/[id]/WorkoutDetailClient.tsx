"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { TemplateBuilder } from "../_lib/TemplateBuilder";
import { AssignForm } from "../_lib/AssignForm";
import { emptyDraft, nextKey, type TemplateDraft } from "../_lib/types";

type Mode = "view" | "edit" | "assign";
type State = "loading" | "ready" | "error" | "missing";

function fmtRest(s: number) {
  return `${s}s rest`;
}

export function WorkoutDetailClient({
  templateId,
  workspace,
}: {
  templateId: string;
  workspace: "independent" | "employed";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [state, setState] = useState<State>("loading");
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const { data: t, error } = await supabase
      .from("workout_templates")
      .select("id, title, description, category, location_type, difficulty, estimated_duration_minutes, source, archived_at")
      .eq("id", templateId)
      .maybeSingle();
    if (error) {
      setState("error");
      return;
    }
    if (!t) {
      setState("missing");
      return;
    }
    const { data: ex } = await supabase
      .from("workout_template_exercises")
      .select("exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds, load_guidance, notes, exercises(name, target_muscle, equipment, gif_url)")
      .eq("template_id", templateId)
      .order("sort_order");
    setDraft({
      id: String(t.id),
      title: String(t.title),
      description: (t.description as string | null) ?? "",
      category: String(t.category),
      locationType: t.location_type as TemplateDraft["locationType"],
      difficulty: t.difficulty as TemplateDraft["difficulty"],
      estimatedDurationMinutes: (t.estimated_duration_minutes as number | null) ?? null,
      source: (t.source as TemplateDraft["source"]) ?? "manual",
      exercises: (ex ?? []).map((r: Record<string, unknown>) => {
        const meta = (Array.isArray(r.exercises) ? r.exercises[0] : r.exercises) as Record<string, unknown> | null;
        return {
          key: nextKey(),
          exerciseId: String(r.exercise_id),
          name: String(meta?.name ?? "Exercise"),
          target: String(meta?.target_muscle ?? ""),
          equipment: String(meta?.equipment ?? ""),
          gifUrl: (meta?.gif_url as string | null) ?? null,
          sets: (r.sets as number | null) ?? null,
          reps: (r.reps as number | null) ?? null,
          durationSeconds: (r.duration_seconds as number | null) ?? null,
          restSeconds: Number(r.rest_seconds ?? 60),
          loadGuidance: (r.load_guidance as string | null) ?? null,
          notes: (r.notes as string | null) ?? null,
        };
      }),
    });
    setState("ready");
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("workout_templates")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", templateId);
    setBusy(false);
    if (error) {
      setMsg("Couldn't archive this workout.");
      return;
    }
    router.push("/lana-pro/workouts");
    router.refresh();
  };

  if (state === "loading") {
    return <div className="p-6 md:p-10 text-sm text-gray-400">Loading…</div>;
  }
  if (state === "missing") {
    return (
      <div className="p-6 md:p-10">
        <button onClick={() => router.push("/lana-pro/workouts")} className="text-sm font-semibold text-gray-400 hover:text-gray-700 mb-5">
          ← Workouts
        </button>
        <p className="text-sm text-gray-500">This workout isn&apos;t in your library.</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="p-6 md:p-10">
        <button onClick={() => router.push("/lana-pro/workouts")} className="text-sm font-semibold text-gray-400 hover:text-gray-700 mb-5">
          ← Workouts
        </button>
        <p className="text-sm text-amber-600">Couldn&apos;t load this workout.</p>
        <button onClick={() => void load()} className="mt-2 text-xs font-semibold text-[#050040] hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (mode === "edit") {
    return <TemplateBuilder initial={draft} workspace={workspace} mode="edit" />;
  }

  return (
    <div className="p-6 md:p-10">
      <button onClick={() => router.push("/lana-pro/workouts")} className="text-sm font-semibold text-gray-400 hover:text-gray-700 mb-5">
        ← Workouts
      </button>

      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{draft.title}</h1>
      <p className="text-sm text-gray-500 mt-1 capitalize">
        {draft.category.replace(/_/g, " ")} · {draft.difficulty} · {draft.locationType}
        {" · "}
        {draft.exercises.length} {draft.exercises.length === 1 ? "exercise" : "exercises"}
        {draft.estimatedDurationMinutes ? ` · ${draft.estimatedDurationMinutes} min` : ""}
      </p>
      {draft.description && <p className="text-sm text-gray-700 mt-2 max-w-prose">{draft.description}</p>}

      <ul className="mt-6 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
        {draft.exercises.map((e, i) => (
          <li key={e.key} className="px-5 py-3.5 flex items-baseline gap-3">
            <span className="text-xs font-bold text-gray-300 w-5">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 capitalize">{e.name}</span>
              <span className="block text-xs text-gray-500">
                {e.durationSeconds
                  ? `${e.durationSeconds}s${e.sets ? ` × ${e.sets}` : ""}`
                  : `${e.sets ?? "–"} × ${e.reps ?? "–"}`}
                {" · "}
                {fmtRest(e.restSeconds)}
                {e.loadGuidance ? ` · ${e.loadGuidance}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {msg && <p className="mt-4 text-sm text-amber-600">{msg}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setMode("edit")}
          className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400"
        >
          Edit workout
        </button>
        {workspace === "independent" ? (
          <button
            onClick={() => setMode("assign")}
            className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0a0866]"
          >
            Assign to client
          </button>
        ) : (
          <span className="text-xs text-gray-400 self-center">
            Client assignment for employed trainers is not available yet.
          </span>
        )}
        <button
          onClick={() => void archive()}
          disabled={busy}
          className="rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold px-4 py-2 hover:border-gray-400 disabled:opacity-40"
        >
          Archive
        </button>
      </div>

      {mode === "assign" && (
        <AssignForm
          templateId={templateId}
          templateTitle={draft.title}
          onClose={() => setMode("view")}
          onDone={(clientName) => {
            setMode("view");
            setMsg(`Assigned to ${clientName}.`);
          }}
        />
      )}
    </div>
  );
}

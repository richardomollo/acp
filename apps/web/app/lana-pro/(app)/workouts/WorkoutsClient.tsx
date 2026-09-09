"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { TemplateListItem } from "./_lib/types";
import { ExerciseBrowser } from "./_lib/ExercisePicker";
import { GenerateForm } from "./_lib/GenerateForm";

type Tab = "workouts" | "exercises";
type LoadState = "loading" | "ready" | "error";

export function WorkoutsClient({ workspace }: { workspace: "independent" | "employed" }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("workouts");
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    // RLS already scopes workout_templates to the current professional.
    const { data, error } = await supabase
      .from("workout_templates")
      .select("id, title, category, difficulty, location_type, estimated_duration_minutes, source, updated_at, workout_template_exercises(count)")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) {
      setState("error");
      return;
    }
    setItems(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        title: String(r.title),
        category: String(r.category),
        difficulty: r.difficulty as TemplateListItem["difficulty"],
        location_type: r.location_type as TemplateListItem["location_type"],
        estimated_duration_minutes: (r.estimated_duration_minutes as number | null) ?? null,
        source: (r.source as TemplateListItem["source"]) ?? "manual",
        exercise_count: Number(
          (Array.isArray(r.workout_template_exercises) && r.workout_template_exercises[0]?.count) || 0,
        ),
        updated_at: String(r.updated_at),
      })),
    );
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workouts</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setGenerating(true)}
            className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400"
          >
            Generate with Lana
          </button>
          <Link
            href="/lana-pro/workouts/new"
            className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0a0866]"
          >
            + Create workout
          </Link>
        </div>
      </div>

      <div className="mt-5 flex gap-1 border-b border-gray-100">
        {(["workouts", "exercises"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-semibold -mb-px border-b-2 ${
              tab === t ? "border-[#050040] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t === "workouts" ? "Workouts" : "Exercises"}
          </button>
        ))}
      </div>

      {tab === "workouts" ? (
        <section className="mt-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mb-3">My workouts</h2>
          {state === "loading" ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : state === "error" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm text-amber-700">Couldn&apos;t load your workouts.</p>
              <button onClick={() => void load()} className="mt-2 text-xs font-semibold text-[#050040] hover:underline">
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center">
              <p className="text-sm font-semibold text-gray-900">No workouts yet.</p>
              <p className="text-sm text-gray-500 mt-1">Build a reusable workout you can assign to any client.</p>
              <Link
                href="/lana-pro/workouts/new"
                className="mt-4 inline-block rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0a0866]"
              >
                Create your first workout
              </Link>
            </div>
          ) : (
            <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {items.map((it) => (
                <li key={it.id}>
                  <Link href={`/lana-pro/workouts/${it.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-sm font-semibold text-gray-900 truncate">{it.title}</span>
                        {it.source === "lana_generated" && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#050040] bg-gray-100 rounded px-1.5 py-0.5">
                            Lana draft
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500 mt-0.5 capitalize">
                        {it.category.replace(/_/g, " ")} · {it.exercise_count}{" "}
                        {it.exercise_count === 1 ? "exercise" : "exercises"}
                        {it.estimated_duration_minutes ? ` · ${it.estimated_duration_minutes} min` : ""}
                      </span>
                    </span>
                    <span className="text-gray-300" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="mt-6">
          <ExerciseBrowser />
        </section>
      )}

      {generating && (
        <GenerateForm
          onClose={() => setGenerating(false)}
          onGenerated={(draftParam) => {
            setGenerating(false);
            router.push(`/lana-pro/workouts/new?g=${encodeURIComponent(draftParam)}`);
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  GENERATOR_TYPES,
  DURATION_OPTIONS,
  generateExercisePool,
  toGeneratedEntry,
} from "@/app/components/client-hub/_lib/workoutGenerator";
import type { TemplateDraft } from "./types";
import { nextKey } from "./types";
import { resolveExerciseId } from "./resolveExercise";

const LEVELS = [
  { k: "beginner", label: "Beginner" },
  { k: "intermediate", label: "Intermediate" },
  { k: "advanced", label: "Advanced" },
] as const;
const LOCS = [
  { k: "gym", label: "Gym" },
  { k: "home", label: "Home" },
  { k: "both", label: "Both" },
] as const;

/** Deterministic — no LLM. Uses the existing client-side exercise-pool builder. */
export function GenerateForm({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: (encodedDraft: string) => void;
}) {
  const [focus, setFocus] = useState<string>("full_body");
  const [duration, setDuration] = useState<number>(45);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["k"]>("intermediate");
  const [location, setLocation] = useState<(typeof LOCS)[number]["k"]>("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const pool = await generateExercisePool({
        location,
        types: [focus],
        difficulty: level,
        durationMinutes: duration,
      });
      if (pool.length === 0) {
        setError("Couldn't build a workout for that combination — try different options.");
        setBusy(false);
        return;
      }
      const focusLabel = GENERATOR_TYPES.find((t) => t.key === focus)?.label ?? "Workout";
      const exercises = [];
      for (const item of pool) {
        const g = toGeneratedEntry(item);
        const timed = focus === "yoga" || focus === "stretch" || item.type === "cardio";
        let exerciseId: string;
        try {
          exerciseId = await resolveExerciseId({
            id: g.externalId,
            externalId: g.externalId,
            name: g.name,
            target: g.target ?? "",
            equipment: g.equipment ?? "",
            bodyPart: g.bodyPart ?? "",
            gifUrl: g.gifUrl ?? null,
            instructions: g.instructions ?? [],
          });
        } catch {
          continue; // skip exercises that can't be normalised; PT can add more
        }
        exercises.push({
          key: nextKey(),
          exerciseId,
          name: g.name,
          target: g.target ?? "",
          equipment: g.equipment ?? "",
          gifUrl: g.gifUrl ?? null,
          sets: timed ? null : g.sets,
          reps: timed ? null : g.reps,
          durationSeconds: timed ? 45 : null,
          restSeconds: g.restSeconds,
          loadGuidance: null,
          notes: null,
        });
      }
      if (exercises.length === 0) {
        setError("Couldn't build a workout for that combination — try different options.");
        setBusy(false);
        return;
      }
      const draft: TemplateDraft = {
        id: null,
        title: `${focusLabel} · ${duration} min`,
        description: "",
        category: /yoga|stretch|mobility/.test(focus) ? "mobility" : /cardio/.test(focus) ? "cardio" : "strength",
        locationType: location,
        difficulty: level,
        estimatedDurationMinutes: duration,
        source: "lana_generated",
        exercises,
      };
      onGenerated(btoa(encodeURIComponent(JSON.stringify(draft))));
    } catch {
      setError("Generation failed — your options weren't changed.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900">Generate workout with Lana</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm font-semibold">
            Close
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Focus</span>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            {GENERATOR_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Duration</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </label>

        <div className="mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Level</span>
          <div className="mt-1 flex gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.k}
                onClick={() => setLevel(l.k)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                  level === l.k ? "bg-[#050040] text-white border-[#050040]" : "border-gray-200 text-gray-600"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Equipment</span>
          <div className="mt-1 flex gap-1.5">
            {LOCS.map((l) => (
              <button
                key={l.k}
                onClick={() => setLocation(l.k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                  location === l.k ? "bg-[#050040] text-white border-[#050040]" : "border-gray-200 text-gray-600"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-amber-600">{error}</p>}

        <button
          onClick={() => void run()}
          disabled={busy}
          className="w-full rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate draft"}
        </button>
      </div>
    </div>
  );
}

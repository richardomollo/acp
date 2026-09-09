"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchExercisesByBodyPart } from "@/app/components/client-hub/_lib/exercisedb";
import { BODY_PARTS, getGifUrl } from "@/app/components/client-hub/_lib/workoutGenerator";
import type { PickableExercise } from "./types";

function Thumb({ url }: { url: string | null }) {
  const [bad, setBad] = useState(false);
  if (!url || bad) {
    return <div className="w-11 h-11 rounded-lg bg-gray-100 flex-shrink-0" aria-hidden />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" onError={() => setBad(true)} className="w-11 h-11 rounded-lg object-cover bg-gray-100 flex-shrink-0" />;
}

function useBodyPart() {
  const [bodyPart, setBodyPart] = useState<string>("chest");
  const [rows, setRows] = useState<PickableExercise[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (bp: string) => {
    setState("loading");
    setRows([]);
    try {
      const data = await fetchExercisesByBodyPart(bp, 24, 0);
      setRows(
        data.map((e) => ({
          id: e.id,
          externalId: e.id,
          name: e.name,
          target: e.target,
          equipment: e.equipment,
          bodyPart: e.bodyPart,
          gifUrl: getGifUrl(e.name, e.target),
          instructions: e.instructions ?? [],
          difficulty: e.difficulty,
        })),
      );
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load(bodyPart);
  }, [bodyPart, load]);

  return { bodyPart, setBodyPart, rows, state, reload: () => load(bodyPart) };
}

function Filters({
  value,
  onChange,
  query,
  onQuery,
}: {
  value: string;
  onChange: (v: string) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search exercises by name…"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {BODY_PARTS.map((bp) => (
          <button
            key={bp.key}
            onClick={() => onChange(bp.key)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border ${
              value === bp.key ? "bg-[#050040] text-white border-[#050040]" : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {bp.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function filterByName(rows: PickableExercise[], q: string): PickableExercise[] {
  const s = q.trim().toLowerCase();
  return s ? rows.filter((r) => r.name.toLowerCase().includes(s)) : rows;
}

/** Standalone Exercises tab — browse only. */
export function ExerciseBrowser() {
  const { bodyPart, setBodyPart, rows, state, reload } = useBodyPart();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterByName(rows, query), [rows, query]);
  return (
    <div>
      <Filters value={bodyPart} onChange={setBodyPart} query={query} onQuery={setQuery} />
      <div className="mt-4">
        {state === "loading" ? (
          <p className="text-sm text-gray-400">Loading exercises…</p>
        ) : state === "error" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm text-amber-700">Couldn&apos;t reach the exercise library.</p>
            <button onClick={() => void reload()} className="mt-2 text-xs font-semibold text-[#050040] hover:underline">
              Try again
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400">No exercises found.</p>
        ) : (
          <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {shown.map((ex) => (
              <li key={ex.id} className="flex items-center gap-3 px-4 py-3">
                <Thumb url={ex.gifUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate capitalize">{ex.name}</span>
                  <span className="block text-xs text-gray-500 capitalize">
                    {ex.bodyPart} · {ex.equipment}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Full-screen picker used inside the builder — adds an exercise to the draft. */
export function ExercisePickerModal({
  addedNames,
  onAdd,
  onClose,
}: {
  addedNames: Set<string>;
  onAdd: (ex: PickableExercise) => void;
  onClose: () => void;
}) {
  const { bodyPart, setBodyPart, rows, state, reload } = useBodyPart();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterByName(rows, query), [rows, query]);
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Add exercise</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm font-semibold">
            Done
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <Filters value={bodyPart} onChange={setBodyPart} query={query} onQuery={setQuery} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {state === "loading" ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : state === "error" ? (
            <div>
              <p className="text-sm text-amber-700">Couldn&apos;t reach the exercise library.</p>
              <button onClick={() => void reload()} className="mt-2 text-xs font-semibold text-[#050040] hover:underline">
                Try again
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((ex) => {
                const already = addedNames.has(ex.name.toLowerCase());
                return (
                  <li key={ex.id} className="flex items-center gap-3 py-3">
                    <Thumb url={ex.gifUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate capitalize">{ex.name}</span>
                      <span className="block text-xs text-gray-500 capitalize">
                        {ex.bodyPart} · {ex.equipment}
                      </span>
                    </span>
                    <button
                      disabled={already}
                      onClick={() => onAdd(ex)}
                      className={`text-xs font-semibold rounded-lg px-3 py-1.5 ${
                        already ? "text-gray-300" : "text-[#050040] hover:bg-gray-100"
                      }`}
                    >
                      {already ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

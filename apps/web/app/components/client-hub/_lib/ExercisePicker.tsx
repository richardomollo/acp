"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Badge } from "../../ui/Badge";
import { fetchExercisesByBodyPart, type ExerciseDBExercise } from "./exercisedb";
import { BODY_PARTS, getGifUrl } from "./workoutGenerator";

export function ExerciseThumb({ gifUrl, size = 44 }: { gifUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!gifUrl || failed) {
    return (
      <div
        className="bg-surface-muted flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size, borderRadius: size * 0.28 }}
      >
        <svg className="text-ink-900" style={{ width: size * 0.45, height: size * 0.45 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={gifUrl}
      alt=""
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: "var(--surface-muted)", objectFit: "cover" }}
      onError={() => setFailed(true)}
    />
  );
}

export function ExercisePicker({
  open, addedIds, onClose, onAdd,
}: {
  open: boolean;
  addedIds: Set<string>;
  onClose: () => void;
  onAdd: (ex: ExerciseDBExercise) => void;
}) {
  const [bodyPart, setBodyPart] = useState<string>("chest");
  const [exercises, setExercises] = useState<ExerciseDBExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bp: string) => {
    setLoading(true);
    setError(null);
    setExercises([]);
    try {
      const data = await fetchExercisesByBodyPart(bp, 20, 0);
      setExercises(data);
    } catch (e: any) {
      setError(e.message ?? "Could not load exercises");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(bodyPart); }, [open, bodyPart, load]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-[--border-faint] flex-shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center text-ink-900">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h2 className="text-lg font-bold text-ink-900">Add Exercise</h2>
        <div className="w-9" />
      </div>

      <div className="flex gap-2 px-4 py-3 border-b border-[--border-faint] overflow-x-auto flex-shrink-0">
        {BODY_PARTS.map((bp) => (
          <Chip key={bp.key} selected={bodyPart === bp.key} onClick={() => setBodyPart(bp.key)} className="text-xs px-3 py-1.5">
            {bp.label}
          </Chip>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-center text-[--text-muted] mt-16">Loading…</p>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 mt-16">
            <p className="text-sm text-[--text-secondary] text-center">{error}</p>
            <Button size="sm" onClick={() => load(bodyPart)}>Try again</Button>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wide mb-3">{exercises.length} exercises · tap to add</p>
            <div className="divide-y divide-[--border-faint]">
              {exercises.map((ex) => {
                const already = addedIds.has(ex.id);
                const gifUrl = getGifUrl(ex.name, ex.target);
                return (
                  <button
                    key={ex.id}
                    onClick={() => { if (!already) onAdd(ex); }}
                    disabled={already}
                    className={`w-full flex items-center gap-3 py-3 text-left ${already ? "opacity-50" : "hover:bg-surface-muted"}`}
                  >
                    <ExerciseThumb gifUrl={gifUrl} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink-900 truncate">{ex.name}</p>
                      <p className="text-xs text-[--text-muted]">{ex.target} · {ex.equipment}</p>
                    </div>
                    {already ? (
                      <Badge variant="success" className="flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Added
                      </Badge>
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {addedIds.size > 0 && (
        <div className="border-t border-[--border-faint] p-4 flex-shrink-0">
          <Button block onClick={onClose}>
            Add {addedIds.size} {addedIds.size === 1 ? "Exercise" : "Exercises"} to Workout
          </Button>
        </div>
      )}
    </div>
  );
}

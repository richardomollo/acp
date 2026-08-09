"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Chip } from "../ui/Chip";
import { SectionLabel } from "../ui/SectionLabel";
import { Stepper } from "../ui/Stepper";
import { ExercisePicker, ExerciseThumb } from "./_lib/ExercisePicker";
import {
  DIFFICULTIES, LOCATION_OPTIONS, GENERATOR_TYPES, DURATION_OPTIONS,
  generateExercisePool, toGeneratedEntry, entryFromExercise, type WorkoutEntry,
} from "./_lib/workoutGenerator";
import type { ExerciseDBExercise } from "./_lib/exercisedb";

export type { WorkoutEntry };

export interface WorkoutMeta {
  name: string;
  location: "gym" | "home" | "both";
  difficulty: "beginner" | "intermediate" | "advanced";
  durationMinutes: number;
  equipment: string | null;
}

function EntryCard({
  entry, idx, onChange, onRemove,
}: {
  entry: WorkoutEntry; idx: number;
  onChange: (u: WorkoutEntry) => void;
  onRemove: () => void;
}) {
  const upd = (patch: Partial<WorkoutEntry>) => onChange({ ...entry, ...patch });
  return (
    <div className="border-[1.5px] border-[--border-faint] rounded-2xl overflow-hidden mb-2.5">
      <div className="flex items-start gap-2.5 p-3.5 pb-2.5">
        <div className="relative flex-shrink-0">
          <ExerciseThumb gifUrl={entry.gifUrl} size={48} />
          <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-ink-900 border-2 border-surface flex items-center justify-center">
            <span className="text-[11px] font-black text-white">{idx + 1}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-ink-900 leading-snug">{entry.name}</p>
          <p className="text-xs text-[--text-muted] mt-0.5">{entry.target} · {entry.equipment}</p>
        </div>
        <button onClick={onRemove} className="p-1 text-danger flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>

      <div className="flex items-center border-t border-[--border-faint] bg-surface-muted">
        <div className="flex-1 flex flex-col items-center gap-1.5 py-3">
          <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wide">Sets</span>
          <Stepper value={entry.sets} min={1} max={10} onChange={(v) => upd({ sets: v })} />
        </div>
        <div className="w-px h-10 bg-[--border-faint]" />
        <div className="flex-1 flex flex-col items-center gap-1.5 py-3">
          <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wide">Reps</span>
          <Stepper value={entry.reps} min={1} max={50} onChange={(v) => upd({ reps: v })} />
        </div>
        <div className="w-px h-10 bg-[--border-faint]" />
        <div className="flex-1 flex flex-col items-center gap-1.5 py-3">
          <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wide">Rest</span>
          <Stepper value={entry.restSeconds} min={15} max={300} step={15} suffix="s" onChange={(v) => upd({ restSeconds: v })} />
        </div>
      </div>

      <input
        type="text"
        placeholder="Add a note (e.g. grip, form cue, weight target)..."
        value={entry.notes}
        onChange={(e) => upd({ notes: e.target.value.slice(0, 140) })}
        className="w-full text-sm text-ink-600 px-3.5 py-2.5 border-t border-[--border-faint] focus:outline-none bg-surface"
      />
    </div>
  );
}

export function WorkoutBuilder({
  backHref, saving, error, onSave,
}: {
  backHref: string;
  saving: boolean;
  error: string | null;
  onSave: (entries: WorkoutEntry[], meta: WorkoutMeta) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState<"gym" | "home" | "both">("gym");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [types, setTypes] = useState<string[]>(["full_body"]);
  const [duration, setDuration] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const addedIds = useMemo(() => new Set(entries.map(e => e.externalId)), [entries]);

  const toggleType = (key: string) => {
    setTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleAddExercise = (ex: ExerciseDBExercise) => {
    setEntries(prev => [...prev, entryFromExercise(ex)]);
  };

  const updateEntry = (tempId: string, updated: WorkoutEntry) =>
    setEntries(prev => prev.map(e => e.tempId === tempId ? updated : e));

  const removeEntry = (tempId: string) =>
    setEntries(prev => prev.filter(e => e.tempId !== tempId));

  const runGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const pool = await generateExercisePool({ location, types, difficulty, durationMinutes: duration });
      if (pool.length === 0) {
        setGenerateError("Could not find matching exercises. Try a different combination.");
        setGenerating(false);
        return;
      }
      const genEntries = pool.map(toGeneratedEntry);
      setEntries(genEntries);
      if (!name.trim()) {
        const labels = types.map(t => GENERATOR_TYPES.find(g => g.key === t)?.label ?? t);
        const typeLabel = labels.length <= 2 ? labels.join(" + ") : "Custom";
        setName(`${typeLabel} Workout`);
      }
    } catch (e: any) {
      setGenerateError(e.message ?? "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateExercises = () => {
    if (types.length === 0) {
      setGenerateError("Select at least one type.");
      return;
    }
    if (entries.length > 0) {
      if (!confirm("This will replace the exercises you already added. Continue?")) return;
    }
    runGenerate();
  };

  const estimatedMinutes = entries.length > 0
    ? Math.max(10, Math.round(entries.reduce((sum, e) => sum + e.sets * (e.restSeconds + 45), 0) / 60))
    : 0;

  const canSave = name.trim().length > 0 && entries.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const equipmentList = [...new Set(
      entries.map(e => e.equipment?.trim()).filter((eq): eq is string => !!eq && eq.toLowerCase() !== "body weight")
    )].join(",");
    onSave(entries, {
      name: name.trim(),
      location,
      difficulty,
      durationMinutes: estimatedMinutes,
      equipment: equipmentList || null,
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto pb-32">
      <ExercisePicker
        open={pickerOpen}
        addedIds={addedIds}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercise}
      />

      <div className="flex items-center gap-3 mb-6">
        <a href={backHref} className="text-sm text-[--text-secondary] hover:underline">← Back</a>
        <h1 className="text-lg font-bold text-ink-900 flex-1">Assign Workout</h1>
        <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      <input
        type="text"
        placeholder="Workout name..."
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 60))}
        className="w-full text-2xl font-extrabold text-ink-900 border-b-2 border-[--border-faint] pb-2.5 mb-7 focus:outline-none focus:border-ink-900 bg-transparent"
      />

      <SectionLabel eyebrow="Workout Setup" title="Location" className="mb-3" />
      <div className="flex gap-2 mb-6">
        {LOCATION_OPTIONS.map(opt => (
          <Chip key={opt.key} selected={location === opt.key} onClick={() => setLocation(opt.key)} className="flex-1">
            {opt.label}
          </Chip>
        ))}
      </div>

      <SectionLabel eyebrow="Workout Setup" title="Difficulty" className="mb-3" />
      <div className="flex gap-2 mb-7">
        {DIFFICULTIES.map(d => (
          <Chip key={d.key} selected={difficulty === d.key} onClick={() => setDifficulty(d.key)} className="flex-1">
            {d.label}
          </Chip>
        ))}
      </div>

      <SectionLabel eyebrow="AI Generator" title="Type (select one or more)" className="mb-3" />
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {GENERATOR_TYPES.map(t => (
          <Chip key={t.key} selected={types.includes(t.key)} onClick={() => toggleType(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <SectionLabel eyebrow="AI Generator" title="Duration" className="mb-3" />
      <div className="flex flex-wrap gap-2 mb-6">
        {DURATION_OPTIONS.map(d => (
          <Chip key={d} selected={duration === d} onClick={() => setDuration(d)}>
            {d} min
          </Chip>
        ))}
      </div>

      <div className="h-px bg-[--border-faint] mb-5" />

      <Button block onClick={handleGenerateExercises} disabled={generating || types.length === 0} className="mb-2">
        {generating ? "Generating…" : "✨ Generate Exercises"}
      </Button>
      {generateError && <p className="text-sm text-danger text-center mb-4">{generateError}</p>}

      <SectionLabel
        eyebrow="Build"
        title="Exercises"
        action={entries.length > 0 && <span className="text-sm font-semibold text-blue-500">{entries.length} added</span>}
        className="mt-4"
      />

      {entries.map((entry, idx) => (
        <EntryCard
          key={entry.tempId}
          entry={entry}
          idx={idx}
          onChange={(updated) => updateEntry(entry.tempId, updated)}
          onRemove={() => removeEntry(entry.tempId)}
        />
      ))}

      <div className="text-center py-2 mt-1 mb-4">
        <button onClick={() => setPickerOpen(true)} className="text-sm text-[--text-muted]">
          Prefer to add exercises yourself? <span className="font-bold text-blue-500">Add Exercise</span>
        </button>
      </div>

      {entries.length > 0 && (
        <p className="text-center text-sm text-[--text-muted]">Estimated duration: {estimatedMinutes} min</p>
      )}
    </div>
  );
}

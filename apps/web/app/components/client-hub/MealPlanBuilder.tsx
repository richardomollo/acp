"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { MealPicker, type PickerMeal } from "./_lib/MealPicker";

export interface MealPlanEntry {
  tempId: string;
  day_of_week: number;
  meal_slot: "breakfast" | "lunch" | "dinner" | "snack";
  meal_id: string;
  meal_name: string;
  calories: number | null;
}

const DAYS = [
  { key: 0, label: "Sun" }, { key: 1, label: "Mon" }, { key: 2, label: "Tue" },
  { key: 3, label: "Wed" }, { key: 4, label: "Thu" }, { key: 5, label: "Fri" }, { key: 6, label: "Sat" },
];

const SLOTS = [
  { key: "breakfast", label: "Breakfast", icon: "🍳" },
  { key: "lunch", label: "Lunch", icon: "🍲" },
  { key: "dinner", label: "Dinner", icon: "🍽️" },
  { key: "snack", label: "Snack", icon: "🥜" },
] as const;

export function MealPlanBuilder({
  backHref, saving, error, onSave,
}: {
  backHref: string;
  saving: boolean;
  error: string | null;
  onSave: (entries: MealPlanEntry[], name: string) => void;
}) {
  const [name, setName] = useState("");
  const [selectedDay, setSelectedDay] = useState(1);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingSlot, setPickingSlot] = useState<MealPlanEntry["meal_slot"] | null>(null);

  const dayEntries = entries.filter(e => e.day_of_week === selectedDay);

  const openPicker = (slot: MealPlanEntry["meal_slot"]) => {
    setPickingSlot(slot);
    setPickerOpen(true);
  };

  const handlePick = (meal: PickerMeal) => {
    if (!pickingSlot) return;
    setEntries(prev => [
      ...prev.filter(e => !(e.day_of_week === selectedDay && e.meal_slot === pickingSlot)),
      { tempId: `${Date.now()}-${Math.random()}`, day_of_week: selectedDay, meal_slot: pickingSlot, meal_id: meal.id, meal_name: meal.name, calories: meal.calories },
    ]);
    setPickerOpen(false);
    setPickingSlot(null);
  };

  const removeMeal = (tempId: string) => setEntries(prev => prev.filter(e => e.tempId !== tempId));

  const canSave = name.trim().length > 0 && entries.length > 0;

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto pb-32">
      <MealPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePick} />

      <div className="flex items-center gap-3 mb-6">
        <a href={backHref} className="text-sm text-[--text-secondary] hover:underline">← Back</a>
        <h1 className="text-lg font-bold text-ink-900 flex-1">Assign Meal Plan</h1>
        <Button size="sm" onClick={() => canSave && onSave(entries, name.trim())} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      <input
        type="text"
        placeholder="Name this plan, e.g. Weight Loss Week 1"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 60))}
        className="w-full text-xl font-extrabold text-ink-900 border-b-2 border-[--border-faint] pb-2.5 mb-6 focus:outline-none focus:border-ink-900 bg-transparent"
      />

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {DAYS.map(d => (
          <Chip key={d.key} selected={selectedDay === d.key} onClick={() => setSelectedDay(d.key)} className="flex items-center gap-1.5">
            {d.label}
            {entries.some(e => e.day_of_week === d.key) && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </Chip>
        ))}
      </div>

      {SLOTS.map(slot => {
        const entry = dayEntries.find(e => e.meal_slot === slot.key);
        return (
          <div key={slot.key} className="mb-4">
            <p className="text-sm font-bold text-ink-900 mb-2">{slot.icon} {slot.label}</p>
            {entry ? (
              <div className="flex items-center justify-between bg-surface border-[1.5px] border-[--border-faint] rounded-xl px-4 py-3">
                <span className="text-sm font-bold text-ink-900 truncate mr-2">{entry.meal_name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {entry.calories != null && <span className="text-xs text-[--text-muted]">{entry.calories} kcal</span>}
                  <button onClick={() => removeMeal(entry.tempId)}>
                    <svg className="w-5 h-5 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => openPicker(slot.key)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-500 text-blue-500 text-sm font-bold"
              >
                + Add Meal
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Chip } from "../../ui/Chip";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface PickerMeal {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
}

const CATEGORIES = ["all", "breakfast", "lunch", "dinner", "snack", "smoothie"] as const;

export function MealPicker({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: PickerMeal) => void;
}) {
  const [category, setCategory] = useState<string>("all");
  const [meals, setMeals] = useState<PickerMeal[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    const query = supabase.from("meals").select("id, name, category, image_url, calories, protein_g").order("name");
    const { data } = cat === "all" ? await query : await query.eq("category", cat);
    setMeals((data as PickerMeal[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(category); }, [open, category, load]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-[--border-faint] flex-shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center text-ink-900">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h2 className="text-lg font-bold text-ink-900">Pick a Meal</h2>
        <div className="w-9" />
      </div>

      <div className="flex gap-2 px-4 py-3 border-b border-[--border-faint] overflow-x-auto flex-shrink-0">
        {CATEGORIES.map((c) => (
          <Chip key={c} selected={category === c} onClick={() => setCategory(c)} className="text-xs px-3 py-1.5 capitalize">
            {c}
          </Chip>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-center text-[--text-muted] mt-16">Loading…</p>
        ) : (
          <div className="divide-y divide-[--border-faint]">
            {meals.map((m) => (
              <button
                key={m.id}
                onClick={() => onPick(m)}
                className="w-full flex items-center gap-3 py-3 text-left hover:bg-surface-muted"
              >
                {m.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-surface-muted flex items-center justify-center flex-shrink-0 text-lg">🍽️</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink-900 truncate">{m.name}</p>
                  <p className="text-xs text-[--text-muted]">
                    {m.calories != null ? `${m.calories} kcal` : ""}{m.protein_g != null ? ` · ${m.protein_g}g protein` : ""}
                  </p>
                </div>
                <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </span>
              </button>
            ))}
            {meals.length === 0 && <p className="text-center text-[--text-muted] mt-16 text-sm">No meals in this category yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

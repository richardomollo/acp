"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { MealPlanBuilder, type MealPlanEntry } from "../../../../components/client-hub/MealPlanBuilder";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AssignMealPlanPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const handleSave = async (entries: MealPlanEntry[], name: string) => {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }
    const { data: pt } = await supabase.from("personal_trainers").select("id").eq("user_id", user.id).single();
    if (!pt) { setError("Trainer profile not found."); setSaving(false); return; }

    const { data: plan, error: planErr } = await supabase
      .from("meal_plans")
      .insert({ user_id: clientId, assigned_by: pt.id, name })
      .select("id")
      .single();

    if (planErr || !plan) { setError(planErr?.message ?? "Failed to assign plan."); setSaving(false); return; }

    const { error: itemsErr } = await supabase.from("meal_plan_items").insert(
      entries.map((e, i) => ({ meal_plan_id: plan.id, day_of_week: e.day_of_week, meal_slot: e.meal_slot, meal_id: e.meal_id, sort_order: i })),
    );

    setSaving(false);
    if (itemsErr) { setError(itemsErr.message); return; }
    router.push(`/pt-dashboard/clients/${clientId}`);
  };

  if (!clientId) return null;

  return (
    <MealPlanBuilder
      backHref={`/pt-dashboard/clients/${clientId}`}
      saving={saving}
      error={error}
      onSave={handleSave}
    />
  );
}

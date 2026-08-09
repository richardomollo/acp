"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const SLOT_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

interface PlanItem {
  id: string;
  day_of_week: number;
  meal_slot: string;
  meals: { name: string } | null;
}

interface DayRow {
  date: string;
  label: string;
  items: { item: PlanItem; status: "eaten" | "skipped" | "pending" }[];
}

function last7Dates(): { date: string; dow: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), dow: d.getDay() };
  });
}

export default function NutritionAdherencePage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const [planName, setPlanName] = useState<string | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [compliancePct, setCompliancePct] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: plan } = await supabase
      .from("meal_plans")
      .select("id, name")
      .eq("user_id", clientId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) { setPlanName(null); setDays([]); setCompliancePct(0); setLoading(false); return; }
    setPlanName(plan.name);

    const { data: itemsData } = await supabase
      .from("meal_plan_items")
      .select("id, day_of_week, meal_slot, meals(name)")
      .eq("meal_plan_id", plan.id);
    const items = (itemsData as unknown as PlanItem[]) ?? [];

    const range = last7Dates();
    const { data: logsData } = await supabase
      .from("meal_logs")
      .select("meal_plan_item_id, log_date, status")
      .eq("user_id", clientId)
      .in("log_date", range.map(r => r.date));
    const logs = logsData ?? [];

    let totalExpected = 0;
    let totalEaten = 0;
    const dayRows: DayRow[] = range.map(({ date, dow }) => {
      const dayItems = items
        .filter(it => it.day_of_week === dow)
        .sort((a, b) => SLOT_ORDER.indexOf(a.meal_slot) - SLOT_ORDER.indexOf(b.meal_slot));
      const entries = dayItems.map(item => {
        const log = logs.find(l => l.meal_plan_item_id === item.id && l.log_date === date);
        const status: "eaten" | "skipped" | "pending" = log ? (log.status as any) : "pending";
        totalExpected++;
        if (status === "eaten") totalEaten++;
        return { item, status };
      });
      return {
        date,
        label: new Date(date + "T00:00:00").toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" }),
        items: entries,
      };
    });

    setDays(dayRows);
    setCompliancePct(totalExpected > 0 ? Math.round((totalEaten / totalExpected) * 100) : 0);
    setLoading(false);
  }, [clientId, router]);

  useEffect(() => { load(); }, [load]);

  if (!clientId) return null;

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-[--text-secondary] hover:underline">← Back</button>
        <h1 className="text-lg font-bold text-ink-900">Nutrition Adherence</h1>
      </div>

      {loading ? (
        <p className="text-[--text-muted] py-16 text-center">Loading…</p>
      ) : !planName ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
          <svg className="w-12 h-12 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 8h1a4 4 0 010 8h-1M5 8h12v9a4 4 0 01-4 4H9a4 4 0 01-4-4V8zM5 8V6a2 2 0 012-2h8a2 2 0 012 2v2" /></svg>
          <p className="font-bold text-ink-900">No active meal plan</p>
          <EmptyState className="max-w-xs">Assign a meal plan to start tracking adherence.</EmptyState>
        </div>
      ) : (
        <>
          <p className="text-xl font-extrabold text-ink-900 mb-5">{planName}</p>

          <div className="bg-blue-50 rounded-2xl p-5 mb-6 text-center">
            <p className="text-xs font-bold text-blue-500 uppercase tracking-wide">7-Day Compliance</p>
            <p className="text-4xl font-black text-blue-500 mt-1 mb-3">{compliancePct}%</p>
            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${compliancePct}%` }} />
            </div>
          </div>

          <div className="space-y-3">
            {days.map(day => (
              <Card key={day.date} radius="xl" className="p-4">
                <p className="text-sm font-bold text-ink-900 mb-2">{day.label}</p>
                {day.items.length === 0 ? (
                  <EmptyState>Nothing planned</EmptyState>
                ) : (
                  <div className="space-y-1.5">
                    {day.items.map(({ item, status }) => (
                      <div key={item.id} className="flex items-center gap-2">
                        {status === "eaten" ? (
                          <svg className="w-[18px] h-[18px] text-success" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        ) : status === "skipped" ? (
                          <svg className="w-[18px] h-[18px] text-danger-500" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                        ) : (
                          <svg className="w-[18px] h-[18px] text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        )}
                        <span className="text-sm text-ink-600 font-medium">
                          {SLOT_LABEL[item.meal_slot] ?? item.meal_slot} · {item.meals?.name ?? "Meal"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

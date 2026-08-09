"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Card } from "../../../../components/ui/Card";
import { ListHeader } from "../../../../components/ui/ListHeader";
import { EmptyState } from "../../../../components/ui/EmptyState";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MeasurementRow = {
  id: string; weight_kg: number | null; waist_cm: number | null;
  chest_cm: number | null; hips_cm: number | null; notes: string | null;
  logged_at: string; logged_by_pt_id: string | null;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export default function BodyStatsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: pt } = await supabase
      .from("personal_trainers").select("id").eq("user_id", user.id).single();
    if (!pt) { setLoading(false); return; }

    const { data: pcRow } = await supabase
      .from("pt_clients").select("share_progress").eq("pt_id", pt.id).eq("client_user_id", clientId).single();
    setShared(!!pcRow?.share_progress);

    const { data } = await supabase
      .from("client_measurements")
      .select("id, weight_kg, waist_cm, chest_cm, hips_cm, notes, logged_at, logged_by_pt_id")
      .eq("user_id", clientId)
      .order("logged_at", { ascending: false })
      .limit(50);
    setRows((data as any) ?? []);
    setLoading(false);
  }, [clientId, router]);

  useEffect(() => { load(); }, [load]);

  const weights = rows.map(r => r.weight_kg).filter((w): w is number => w != null);
  const maxWeight = Math.max(1, ...weights);
  const latest = rows[0];
  const previous = rows[1];

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-[--text-secondary] hover:underline">
          ← Back
        </button>
        <h1 className="text-lg font-bold text-ink-900">Body Stats</h1>
      </div>

      {loading ? (
        <p className="text-[--text-muted] py-16 text-center">Loading…</p>
      ) : !shared && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
          <svg className="w-12 h-12 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          <p className="font-bold text-ink-900">Not shared</p>
          <EmptyState className="max-w-xs">This client hasn&apos;t shared their progress with you yet</EmptyState>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
          <svg className="w-12 h-12 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          <p className="font-bold text-ink-900">No measurements yet</p>
          <EmptyState className="max-w-xs">Nothing logged by this client so far</EmptyState>
        </div>
      ) : (
        <>
          {latest?.weight_kg != null && (
            <div className="flex items-center gap-4 bg-ink-900 rounded-2xl p-5 mb-6">
              <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide">Current Weight</p>
                <p className="text-2xl font-black text-white mt-0.5">{latest.weight_kg} kg</p>
                {previous?.weight_kg != null && (
                  <p className="text-xs font-semibold text-white/70 mt-1">
                    {latest.weight_kg >= previous.weight_kg ? "↑" : "↓"} {Math.abs(latest.weight_kg - previous.weight_kg).toFixed(1)} kg since last log
                  </p>
                )}
              </div>
            </div>
          )}

          {!shared && (
            <div className="flex items-center gap-2 bg-surface-muted rounded-lg p-3 mb-5 text-xs text-[--text-secondary]">
              This client hasn&apos;t shared their full progress — showing only what you&apos;ve logged yourself
            </div>
          )}

          <ListHeader title="History" />

          <div className="space-y-3">
            {rows.map(row => (
              <Card key={row.id} radius="2xl" className="p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-semibold text-[--text-secondary]">{formatDate(row.logged_at)}</span>
                  {row.weight_kg != null && <span className="text-lg font-black text-ink-900">{row.weight_kg} kg</span>}
                </div>

                {row.weight_kg != null && (
                  <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden mb-3">
                    <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${(row.weight_kg / maxWeight) * 100}%` }} />
                  </div>
                )}

                {(row.waist_cm || row.chest_cm || row.hips_cm) && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {row.waist_cm && <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-bold text-[--text-secondary]">Waist {row.waist_cm}cm</span>}
                    {row.chest_cm && <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-bold text-[--text-secondary]">Chest {row.chest_cm}cm</span>}
                    {row.hips_cm && <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-bold text-[--text-secondary]">Hips {row.hips_cm}cm</span>}
                  </div>
                )}

                {row.notes && <p className="text-sm text-[--text-secondary] italic">&quot;{row.notes}&quot;</p>}

                {row.logged_by_pt_id && (
                  <p className="text-[11px] font-semibold text-blue-500 mt-2">Logged by you</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

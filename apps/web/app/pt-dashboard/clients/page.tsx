"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClientListView } from "../../components/client-hub/ClientListView";
import { ClientListRow } from "../../components/client-hub/ClientListRow";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ClientRow = {
  id: string;
  client_user_id: string | null;
  status: "pending" | "active" | "inactive";
  share_progress: boolean;
  invite_code: string | null;
  invited_name: string | null;
  users: { name: string | null; email: string | null } | null;
};

export default function PTClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: pt, error: ptErr } = await supabase
      .from("personal_trainers").select("id").eq("user_id", user.id).single();
    if (!pt) { setError(ptErr?.message ?? "No trainer profile found for this account"); setLoading(false); return; }

    const { data, error: pcErr } = await supabase
      .from("pt_clients")
      .select("id, client_user_id, status, share_progress, invite_code, invited_name, users(name, email)")
      .eq("pt_id", pt.id)
      .order("created_at", { ascending: false });

    if (pcErr) { setError(pcErr.message); setLoading(false); return; }
    setClients((data as any) ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const copyCode = (row: ClientRow) => {
    if (!row.invite_code) return;
    navigator.clipboard.writeText(row.invite_code);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cancelInvite = async (row: ClientRow) => {
    const name = row.users?.name ?? row.invited_name ?? "this invite";
    if (!confirm(`Cancel the invite for ${name}?`)) return;
    const { error } = await supabase.from("pt_clients").delete().eq("id", row.id);
    if (!error) setClients(prev => prev.filter(c => c.id !== row.id));
  };

  return (
    <ClientListView
      clients={clients}
      loading={loading}
      error={error}
      addHref="/pt-dashboard/clients/add"
      emptyHint="Add an existing client or invite a new one, or wait for a booking to add them automatically"
      renderRow={(c) => {
        const name = c.users?.name ?? c.users?.email ?? c.invited_name ?? "Unknown client";
        const isPendingInvite = c.status === "pending" && !!c.client_user_id;
        const isPendingCode = c.status === "pending" && !c.client_user_id;

        const row = (
          <ClientListRow
            name={name}
            subtitle={
              isPendingInvite ? (
                <span className="flex items-center gap-1 text-[--warning-500]">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Invite sent, awaiting response
                </span>
              ) : isPendingCode ? (
                <span className="flex items-center gap-1 text-[--warning-500]">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  Code {c.invite_code} · not yet redeemed
                </span>
              ) : (
                c.share_progress ? "Sharing progress" : "Progress not shared"
              )
            }
            trailing={
              isPendingCode ? (
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.preventDefault(); copyCode(c); }} className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center hover:bg-[--hairline]">
                    {copiedId === c.id ? (
                      <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                  <button onClick={(e) => { e.preventDefault(); cancelInvite(c); }} className="w-9 h-9 rounded-full bg-danger-50 flex items-center justify-center hover:bg-danger-50">
                    <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : isPendingInvite ? (
                <button onClick={(e) => { e.preventDefault(); cancelInvite(c); }} className="w-9 h-9 rounded-full bg-danger-50 flex items-center justify-center hover:bg-danger-50">
                  <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ) : (
                <svg className="w-5 h-5 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              )
            }
          />
        );

        if (isPendingInvite || isPendingCode) return <div key={c.id}>{row}</div>;
        return <Link key={c.id} href={`/pt-dashboard/clients/${c.client_user_id}`}>{row}</Link>;
      }}
    />
  );
}

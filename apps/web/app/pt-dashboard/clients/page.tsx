"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClientListRow } from "../../components/client-hub/ClientListRow";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { bucketForClient, type ClientBucket } from "@/lib/lana-pro-onboarding/client-attention";

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

// "Needs attention" is intentionally driven by the pure classifier in
// client-attention.ts. Phase 3 wires in NO behavioural evidence producer yet
// (no workouts / check-ins / adherence feed), so `bucketForClient` can only
// return 'invited' | 'active' | 'inactive' today — never 'needs_attention'.
// The section still renders, with an honest empty state, so the IA and the
// evidence contract are in place for Lana Intelligence to fill later.
const SECTIONS: { bucket: ClientBucket; title: string; blurb: string; emptyHint: string }[] = [
  {
    bucket: "needs_attention",
    title: "Needs attention",
    blurb: "Clients with a recent signal worth a look.",
    emptyHint: "Not enough activity data yet. This fills in as your clients train and check in.",
  },
  {
    bucket: "active",
    title: "Active",
    blurb: "Clients who have accepted and are connected.",
    emptyHint: "No active clients yet.",
  },
  {
    bucket: "invited",
    title: "Invited",
    blurb: "Invitations sent — waiting for them to accept.",
    emptyHint: "No pending invitations.",
  },
  {
    bucket: "inactive",
    title: "Inactive",
    blurb: "Relationships you've paused.",
    emptyHint: "",
  },
];

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
    setClients((data as unknown as ClientRow[]) ?? []);
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

  const renderRow = (c: ClientRow) => {
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
  };

  const bucketOf = (c: ClientRow): ClientBucket =>
    bucketForClient({
      relationshipStatus: c.status,
      hasAccount: !!c.client_user_id,
      // No behavioural evidence producer yet (Phase 3) — see client-attention.ts.
      evidence: { shareProgressConsent: c.share_progress },
    });

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Clients</h1>
          <p className="text-sm text-[--text-secondary] mt-0.5">{clients.length} total</p>
        </div>
        <Link href="/pt-dashboard/clients/add">
          <Button size="sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Client
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-[--text-muted] py-12 text-center">Loading…</p>
      ) : error ? (
        <div className="bg-danger-50 border border-danger-50 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <svg className="w-12 h-12 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 5v-2a4 4 0 00-3-3.87m-9.6 0A4 4 0 006 15.13V17" />
          </svg>
          <p className="text-ink-600 font-medium">No clients yet</p>
          <EmptyState className="max-w-xs">
            Add an existing client or invite a new one, or wait for a booking to add them automatically
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const rows = clients.filter((c) => bucketOf(c) === section.bucket);
            // Hide "Inactive" entirely when empty; always show the others so the
            // grouping IA is legible.
            if (rows.length === 0 && section.bucket === "inactive") return null;
            return (
              <section key={section.bucket}>
                <div className="mb-3">
                  <h2 className="text-sm font-bold text-ink-900 uppercase tracking-[0.12em]">
                    {section.title}
                    {rows.length > 0 && (
                      <span className="ml-2 text-[--text-muted] font-semibold">{rows.length}</span>
                    )}
                  </h2>
                  <p className="text-xs text-[--text-muted] mt-0.5">{section.blurb}</p>
                </div>
                {rows.length > 0 ? (
                  <div className="space-y-3">{rows.map(renderRow)}</div>
                ) : (
                  <EmptyState>{section.emptyHint}</EmptyState>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

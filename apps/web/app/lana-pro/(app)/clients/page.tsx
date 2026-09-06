"use client";

// LANA PRO — Phase 4.1: Clients (workspace).
//
// Reuses the Phase-3 relationship model + the pure attention classifier. Groups
// Needs attention / Active / Invited / Inactive. "Needs attention" is driven by
// the classifier, which has NO evidence producer in 4.1 → it stays empty with
// an honest message. Counts come straight from `pt_clients.status` (safe).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ClientListRow } from "@/app/components/client-hub/ClientListRow";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { bucketForClient, type ClientBucket } from "@/lib/lana-pro-onboarding/client-attention";

type ClientRow = {
  id: string;
  client_user_id: string | null;
  status: "pending" | "active" | "inactive";
  share_progress: boolean;
  invite_code: string | null;
  invited_name: string | null;
  users: { name: string | null; email: string | null } | null;
};

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
    blurb: "Connected clients who have accepted.",
    emptyHint: "No active clients yet.",
  },
  {
    bucket: "invited",
    title: "Invited",
    blurb: "Invitations sent — waiting for them to accept.",
    emptyHint: "No pending invitations.",
  },
  { bucket: "inactive", title: "Inactive", blurb: "Relationships you've paused.", emptyHint: "" },
];

export default function LanaProClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/partner-login");
      return;
    }
    const { data: pt } = await supabase
      .from("personal_trainers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pt) {
      // Staff-trainer rosters live under a different table; out of 4.1 scope.
      setClients([]);
      setLoading(false);
      return;
    }
    const { data, error: pcErr } = await supabase
      .from("pt_clients")
      .select("id, client_user_id, status, share_progress, invite_code, invited_name, users(name, email)")
      .eq("pt_id", pt.id)
      .order("created_at", { ascending: false });
    if (pcErr) {
      setError(pcErr.message);
      setLoading(false);
      return;
    }
    setClients((data as unknown as ClientRow[]) ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const bucketOf = (c: ClientRow): ClientBucket =>
    bucketForClient({
      relationshipStatus: c.status,
      hasAccount: !!c.client_user_id,
      evidence: { shareProgressConsent: c.share_progress },
    });

  const activeCount = clients.filter((c) => c.status === "active").length;
  const invitedCount = clients.filter((c) => c.status === "pending").length;

  const renderRow = (c: ClientRow) => {
    const name = c.users?.name ?? c.users?.email ?? c.invited_name ?? "Unknown client";
    const pendingCode = c.status === "pending" && !c.client_user_id;
    const pendingInvite = c.status === "pending" && !!c.client_user_id;
    const subtitle = pendingInvite
      ? "Invite sent, awaiting response"
      : pendingCode
        ? `Code ${c.invite_code ?? ""} · not yet redeemed`
        : c.share_progress
          ? "Sharing progress"
          : "Progress not shared";
    const row = (
      <ClientListRow
        name={name}
        subtitle={<span className={c.status === "pending" ? "text-amber-600" : ""}>{subtitle}</span>}
        trailing={
          c.status === "pending" ? null : (
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )
        }
      />
    );
    return c.client_user_id && c.status !== "pending" ? (
      <Link key={c.id} href={`/lana-pro/clients/${c.client_user_id}`}>
        {row}
      </Link>
    ) : (
      <div key={c.id}>{row}</div>
    );
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active · {invitedCount} invited
          </p>
        </div>
        <Link
          href="/lana-pro/clients/invite"
          className="flex-shrink-0 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          Invite clients
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 py-12 text-center text-sm">Loading…</p>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm">{error}</div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gray-900">No clients yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Bring the clients you already work with onto Lana — they stay yours.
          </p>
          <Link
            href="/lana-pro/clients/invite"
            className="inline-block mt-4 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2"
          >
            Invite clients
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const rows = clients.filter((c) => bucketOf(c) === section.bucket);
            if (rows.length === 0 && section.bucket === "inactive") return null;
            return (
              <section key={section.bucket}>
                <div className="mb-3">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-[0.12em]">
                    {section.title}
                    {rows.length > 0 && <span className="ml-2 text-gray-400 font-semibold">{rows.length}</span>}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">{section.blurb}</p>
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

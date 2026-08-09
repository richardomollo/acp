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
  share_progress: boolean;
  users: { name: string | null; email: string | null } | null;
};

export default function GymTrainerClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login?redirect=/trainer-dashboard/clients"); return; }

    const { data: trainer, error: trainerErr } = await supabase
      .from("gym_trainers").select("id").eq("user_id", user.id).maybeSingle();
    if (!trainer) { setError(trainerErr?.message ?? "No trainer profile found for this account"); setLoading(false); return; }

    const { data, error: gcErr } = await supabase
      .from("gym_trainer_clients")
      .select("id, client_user_id, share_progress, users(name, email)")
      .eq("gym_trainer_id", trainer.id)
      .order("created_at", { ascending: false });

    if (gcErr) { setError(gcErr.message); setLoading(false); return; }
    setClients((data as any) ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const removeClient = async (row: ClientRow) => {
    const name = row.users?.name ?? row.users?.email ?? "this client";
    if (!confirm(`Remove ${name} from your client list?`)) return;
    const { error } = await supabase.from("gym_trainer_clients").delete().eq("id", row.id);
    if (!error) setClients(prev => prev.filter(c => c.id !== row.id));
  };

  return (
    <ClientListView
      clients={clients}
      loading={loading}
      error={error}
      addHref="/trainer-dashboard/clients/add"
      emptyHint="Search for an existing member to add them to your client list."
      renderRow={(c) => {
        const name = c.users?.name ?? c.users?.email ?? "Unknown client";
        return (
          <ClientListRow
            key={c.id}
            name={name}
            subtitle={c.share_progress ? "Sharing progress" : "Progress not shared"}
            trailing={
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/trainer-dashboard/clients/${c.client_user_id}/assign-workout`}>
                  <span className="inline-flex px-3 py-1.5 rounded-[--radius-pill] text-xs font-semibold border-[1.5px] border-border text-ink-600 hover:bg-surface-muted transition">
                    Assign workout
                  </span>
                </Link>
                <Link href={`/trainer-dashboard/clients/${c.client_user_id}/assign-meal-plan`}>
                  <span className="inline-flex px-3 py-1.5 rounded-[--radius-pill] text-xs font-semibold border-[1.5px] border-border text-ink-600 hover:bg-surface-muted transition">
                    Assign meal plan
                  </span>
                </Link>
                <button onClick={() => removeClient(c)} className="w-9 h-9 rounded-full bg-danger-50 flex items-center justify-center hover:bg-danger-50 flex-shrink-0">
                  <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            }
          />
        );
      }}
    />
  );
}

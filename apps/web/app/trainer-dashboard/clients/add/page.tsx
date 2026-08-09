"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClientSearchPanel, type ClientMatch } from "../../../components/client-hub/ClientSearchPanel";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AddGymTrainerClientPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<ClientMatch | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTrainerId = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: trainer } = await supabase
      .from("gym_trainers").select("id").eq("user_id", user.id).maybeSingle();
    return trainer?.id ?? null;
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMatch(undefined);
    setError(null);
    const { data, error: err } = await supabase.rpc("search_client_by_contact", { p_query: q });
    if (err) {
      setError(err.message);
      setSearching(false);
      return;
    }
    setMatch((data && data[0]) ?? null);
    setSearching(false);
  };

  const handleAdd = async () => {
    if (!match) return;
    setAdding(true);
    setError(null);
    const trainerId = await getTrainerId();
    if (!trainerId) { setAdding(false); return; }

    const { error: err } = await supabase.from("gym_trainer_clients").insert({
      gym_trainer_id: trainerId,
      client_user_id: match.id,
      status: "active",
    });

    setAdding(false);
    if (err) {
      setError(err.code === "23505" ? "This person is already in your client list." : err.message);
      return;
    }
    router.push("/trainer-dashboard/clients");
  };

  return (
    <div className="p-6 md:p-8 max-w-lg mx-auto">
      <Link href="/trainer-dashboard/clients" className="text-sm text-[--text-secondary] hover:underline mb-6 inline-block">
        ← Back to Clients
      </Link>
      <h1 className="text-2xl font-bold text-ink-900 mb-1">Add Client</h1>
      <p className="text-sm text-[--text-secondary] mb-6">Search for an existing member by their phone or email to add them.</p>

      {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      <ClientSearchPanel
        query={query}
        onQueryChange={(v) => { setQuery(v); setMatch(undefined); }}
        onSearch={handleSearch}
        searching={searching}
        match={match}
        notFoundHint="No account found with that phone or email."
        submitLabel="Add Client"
        submitting={adding}
        onSubmit={handleAdd}
      />
    </div>
  );
}

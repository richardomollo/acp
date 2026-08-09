"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClientSearchPanel, type ClientMatch } from "../../../components/client-hub/ClientSearchPanel";
import { Chip } from "../../../components/ui/Chip";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Input";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AddClientPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"search" | "invite">("search");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<ClientMatch | null | undefined>(undefined);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invitedName, setInvitedName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getPtId = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: pt } = await supabase
      .from("personal_trainers").select("id").eq("user_id", user.id).single();
    return pt?.id ?? null;
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

  const handleSendInvite = async () => {
    if (!match) return;
    setSendingInvite(true);
    setError(null);
    const ptId = await getPtId();
    if (!ptId) { setSendingInvite(false); return; }

    const { error: err } = await supabase.from("pt_clients").insert({
      pt_id: ptId,
      client_user_id: match.id,
      status: "pending",
    });

    setSendingInvite(false);
    if (err) {
      setError(err.code === "23505" ? "This person is already in your client list." : err.message);
      return;
    }
    router.push("/pt-dashboard/clients");
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    setError(null);
    const ptId = await getPtId();
    if (!ptId) { setGenerating(false); return; }

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomCode();
      const { error: err } = await supabase.from("pt_clients").insert({
        pt_id: ptId,
        status: "pending",
        invite_code: code,
        invited_name: invitedName.trim() || null,
      });
      if (!err) {
        setGeneratedCode(code);
        setGenerating(false);
        return;
      }
      lastError = err;
      if (err.code !== "23505") break;
    }
    setGenerating(false);
    setError(lastError?.message ?? "Could not generate an invite code.");
  };

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 md:p-8 max-w-lg mx-auto">
      <Link href="/pt-dashboard/clients" className="text-sm text-[--text-secondary] hover:underline mb-6 inline-block">
        ← Back to Clients
      </Link>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">Add Client</h1>

      <div className="flex gap-2 mb-6 bg-surface-muted rounded-[--radius-pill] p-1">
        <Chip selected={tab === "search"} onClick={() => setTab("search")} className="flex-1 text-center justify-center border-transparent">
          Search Existing
        </Chip>
        <Chip selected={tab === "invite"} onClick={() => setTab("invite")} className="flex-1 text-center justify-center border-transparent">
          Invite New
        </Chip>
      </div>

      {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      {tab === "search" ? (
        <ClientSearchPanel
          query={query}
          onQueryChange={(v) => { setQuery(v); setMatch(undefined); }}
          onSearch={handleSearch}
          searching={searching}
          match={match}
          notFoundHint={'No account found with that phone or email. Try "Invite New" instead.'}
          submitLabel="Send Invite"
          submitting={sendingInvite}
          onSubmit={handleSendInvite}
        />
      ) : (
        <>
          <Field label="Client's name (optional)">
            <Input
              type="text"
              placeholder="e.g. Jane Doe"
              value={invitedName}
              onChange={(e) => setInvitedName(e.target.value)}
              disabled={!!generatedCode}
            />
          </Field>

          {!generatedCode ? (
            <Button block onClick={handleGenerateCode} disabled={generating} className="mt-4">
              {generating ? "Generating…" : "Generate Invite Code"}
            </Button>
          ) : (
            <>
              <p className="text-xs font-semibold text-[--text-secondary] mb-2 mt-4">Share this code with your client</p>
              <button
                onClick={copyCode}
                className="w-full flex items-center justify-center gap-3 py-5 border-[1.5px] border-border rounded-xl mb-3 hover:bg-surface-muted transition"
              >
                <span className="text-2xl font-bold tracking-widest text-ink-900">{generatedCode}</span>
                {copied ? (
                  <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                )}
              </button>
              <p className="text-sm text-[--text-muted] mb-6">
                They enter this code in the &quot;My Trainers&quot; section of their app to connect with you.
              </p>
              <button
                onClick={() => router.push("/pt-dashboard/clients")}
                className="w-full py-3 text-sm font-semibold text-[--text-secondary] hover:text-ink-900"
              >
                Done
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

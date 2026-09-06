"use client";

// LANA PRO — Phase 4.6: the real Team surface.
//
// Reuses the EXISTING employed-trainer primitives verbatim — no forked flow:
//   • invite by email  → insert gym_trainers (status defaults 'invited') +
//     functions/v1/send-email 'trainer_invite' → /trainer-signup?token=…
//     → get_trainer_invite → claim_trainer_invite
//   • add with password → POST /api/partner/create-trainer
//   • suspend / reactivate → gym_trainers.status
// Adds only: assigned-services read (gym_service_providers) and a speciality
// label. No HR functionality. Never deletes a gym_trainers row (§27).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";

type Trainer = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: "invited" | "active" | "suspended";
};

type Assignment = { gym_trainer_id: string; serviceName: string };

const inp =
  "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#050040]/25";

export function TeamManager({
  gymId,
  gymName,
  allGyms,
}: {
  gymId: string;
  gymName: string;
  allGyms: { id: string; name: string }[];
}) {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<null | "invite" | "manual">(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: sp }] = await Promise.all([
      supabase
        .from("gym_trainers")
        .select("id, full_name, email, phone, status")
        .eq("gym_id", gymId)
        .order("created_at", { ascending: false }),
      supabase
        .from("gym_service_providers")
        .select("gym_trainer_id, gym_services(name, gym_id)")
        .limit(500),
    ]);
    setTrainers((t as Trainer[]) ?? []);
    type ProviderRow = {
      gym_trainer_id: string;
      gym_services: { name: string | null; gym_id: string } | { name: string | null; gym_id: string }[] | null;
    };
    const provRows = (sp as unknown as ProviderRow[]) ?? [];
    setAssignments(
      provRows
        .map((r) => {
          const svc = Array.isArray(r.gym_services) ? r.gym_services[0] : r.gym_services;
          return { gym_trainer_id: r.gym_trainer_id, serviceName: svc?.name ?? null, gym_id: svc?.gym_id ?? null };
        })
        .filter((r): r is { gym_trainer_id: string; serviceName: string; gym_id: string } => r.gym_id === gymId && !!r.serviceName)
        .map((r) => ({ gym_trainer_id: r.gym_trainer_id, serviceName: r.serviceName })),
    );
    setLoading(false);
  }, [gymId]);

  useEffect(() => {
    load();
  }, [load]);

  const servicesByTrainer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of assignments) {
      if (!m.has(a.gym_trainer_id)) m.set(a.gym_trainer_id, []);
      m.get(a.gym_trainer_id)!.push(a.serviceName);
    }
    return m;
  }, [assignments]);

  const reset = () => {
    setForm({ name: "", email: "", phone: "", password: "" });
    setMode(null);
    setError("");
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { data: authUser } = await supabase.auth.getUser();
    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", authUser.user?.id)
      .maybeSingle();
    const { data: created, error: insErr } = await supabase
      .from("gym_trainers")
      .insert({
        gym_id: gymId,
        full_name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        invited_by: partner?.id ?? null,
      })
      .select("id, invite_token")
      .single();
    if (insErr) {
      setError(insErr.message || "Could not invite this team member.");
      setSaving(false);
      return;
    }
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: "trainer_invite",
        data: {
          trainerName: form.name.trim(),
          gymName,
          signupUrl: `${window.location.origin}/trainer-signup?token=${created.invite_token}`,
        },
      }),
    }).catch(() => {});
    setSaving(false);
    reset();
    load();
  };

  const addManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/partner/create-trainer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        gymId,
        fullName: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not add this team member.");
      setSaving(false);
      return;
    }
    setSaving(false);
    reset();
    load();
  };

  const toggleStatus = async (t: Trainer) => {
    const next = t.status === "suspended" ? "active" : "suspended";
    setTrainers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    await supabase.from("gym_trainers").update({ status: next }).eq("id", t.id);
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            The instructors and professionals who work at {gymName}, and what they&apos;re assigned to.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <button
            onClick={() => setMode((m) => (m === "manual" ? null : "manual"))}
            className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400"
          >
            {mode === "manual" ? "Cancel" : "Add manually"}
          </button>
          <button
            onClick={() => setMode((m) => (m === "invite" ? null : "invite"))}
            className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0a0866]"
          >
            {mode === "invite" ? "Cancel" : "Invite team member"}
          </button>
        </div>
      </div>

      {allGyms.length > 1 && (
        <p className="text-xs text-gray-400 mt-2">Managing team for {gymName}. Switch venue from the workspace switcher.</p>
      )}

      {mode === "invite" && (
        <form onSubmit={invite} className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
          <p className="text-xs text-gray-500">They get an email with a link to set their own password.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <L label="Full name">
              <input required className={inp} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </L>
            <L label="Phone (optional)">
              <input className={inp} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </L>
          </div>
          <L label="Email">
            <input required type="email" className={inp} value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </L>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={saving} className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40">
            {saving ? "Sending…" : "Send invite"}
          </button>
        </form>
      )}

      {mode === "manual" && (
        <form onSubmit={addManual} className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
          <p className="text-xs text-gray-500">Sets up their login right away — good for on-site.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <L label="Full name">
              <input required className={inp} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </L>
            <L label="Phone (optional)">
              <input className={inp} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </L>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <L label="Email">
              <input required type="email" className={inp} value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </L>
            <L label="Password">
              <input required minLength={6} type="password" className={inp} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </L>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={saving} className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40">
            {saving ? "Adding…" : "Add team member"}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : trainers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-sm font-semibold text-gray-900">No team members yet</p>
            <p className="text-sm text-gray-500 mt-1">Invite your first instructor or professional above.</p>
          </div>
        ) : (
          <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {trainers.map((t) => {
              const services = servicesByTrainer.get(t.id) ?? [];
              const open = openId === t.id;
              return (
                <li key={t.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => setOpenId(open ? null : t.id)}
                      className="text-left min-w-0"
                    >
                      <p className="font-semibold text-gray-900 text-sm truncate">{t.full_name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {services.length > 0 ? services.join(" · ") : "No services assigned"}
                      </p>
                    </button>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          t.status === "active"
                            ? "bg-green-100 text-green-700"
                            : t.status === "invited"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t.status}
                      </span>
                      {t.status !== "invited" && (
                        <button
                          onClick={() => toggleStatus(t)}
                          className="text-xs font-semibold text-gray-400 hover:text-gray-700"
                        >
                          {t.status === "suspended" ? "Reactivate" : "Suspend"}
                        </button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 text-sm text-gray-600 space-y-1">
                      <p>{t.email}{t.phone ? ` · ${t.phone}` : ""}</p>
                      <p className="text-xs text-gray-400">
                        {services.length > 0
                          ? `Delivers: ${services.join(", ")}`
                          : "Assign this professional to a service from Services → edit."}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

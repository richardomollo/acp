"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase/client";

type Recurrence = "once" | "daily" | "weekly";
const WEEKDAYS = [
  { i: 1, l: "M" },
  { i: 2, l: "T" },
  { i: 3, l: "W" },
  { i: 4, l: "T" },
  { i: 5, l: "F" },
  { i: 6, l: "S" },
  { i: 0, l: "S" },
];
const LOCS = [
  { k: "gym", label: "Gym" },
  { k: "home", label: "Home" },
  { k: "outdoor", label: "Outdoor" },
] as const;

interface ClientRow {
  id: string;
  name: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AssignForm({
  templateId,
  templateTitle,
  onClose,
  onDone,
}: {
  templateId: string;
  templateTitle: string;
  onClose: () => void;
  onDone: (clientName: string) => void;
}) {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("18:00");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [locationType, setLocationType] = useState<(typeof LOCS)[number]["k"]>("gym");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: rels } = await supabase
        .from("pt_clients")
        .select("client_user_id")
        .eq("status", "active");
      const ids = (rels ?? []).map((r) => r.client_user_id as string).filter(Boolean);
      if (ids.length === 0) {
        setClients([]);
        return;
      }
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", ids);
      const rows = (users ?? []).map((u) => ({
        id: u.id as string,
        name: (u.name as string) || (u.email as string) || "Client",
      }));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setClients(rows);
    })();
  }, []);

  const submit = async () => {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("lana_pro_assign_workout_template", {
      p_template_id: templateId,
      p_client: clientId,
      p_start_date: date,
      p_time: time,
      p_recurrence: recurrence,
      p_weekdays: recurrence === "weekly" ? weekdays : [],
      p_location_type: locationType,
      p_location_address: null,
    });
    setSaving(false);
    if (rpcErr) {
      setError(
        /PGRST202|schema cache/i.test(rpcErr.message)
          ? "Assigning isn't available yet on this environment (the assign function isn't deployed)."
          : rpcErr.message,
      );
      return;
    }
    onDone(clients?.find((c) => c.id === clientId)?.name ?? "the client");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-gray-900">Assign workout</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm font-semibold">
            Close
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{templateTitle}</p>

        <label className="block mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Client</span>
          {clients === null ? (
            <p className="mt-1 text-sm text-gray-400">Loading clients…</p>
          ) : clients.length === 0 ? (
            <p className="mt-1 text-sm text-gray-400">You don&apos;t have any active clients yet.</p>
          ) : (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Start date</span>
            <input
              type="date"
              value={date}
              min={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Recurrence</span>
          <div className="mt-1 flex gap-1.5">
            {(["once", "daily", "weekly"] as Recurrence[]).map((r) => (
              <button
                key={r}
                onClick={() => setRecurrence(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border capitalize ${
                  recurrence === r ? "bg-[#050040] text-white border-[#050040]" : "border-gray-200 text-gray-600"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {recurrence === "weekly" && (
          <div className="mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Weekdays</span>
            <div className="mt-1 flex gap-1.5">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.i}
                  onClick={() =>
                    setWeekdays((w) => (w.includes(d.i) ? w.filter((x) => x !== d.i) : [...w, d.i]))
                  }
                  className={`w-8 h-8 rounded-lg text-xs font-semibold border ${
                    weekdays.includes(d.i) ? "bg-[#050040] text-white border-[#050040]" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-5">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Location</span>
          <div className="mt-1 flex gap-1.5">
            {LOCS.map((l) => (
              <button
                key={l.k}
                onClick={() => setLocationType(l.k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                  locationType === l.k ? "bg-[#050040] text-white border-[#050040]" : "border-gray-200 text-gray-600"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={
            saving ||
            !clientId ||
            (recurrence === "weekly" && weekdays.length === 0)
          }
          className="w-full rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] disabled:opacity-40"
        >
          {saving ? "Assigning…" : "Assign workout"}
        </button>
      </div>
    </div>
  );
}

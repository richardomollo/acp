"use client";

// LANA PRO — Phase 4.6: create a venue team-delivered appointment (§10).
//   client → service → professional → date & time → review → confirm
// Writes gym_service_bookings directly (RLS 20260913000001). Never creates a
// pt_bookings row, never a fake session, never touches consent.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import { PrimaryButton } from "@/app/lana-pro/onboarding/OnboardingShell";
import {
  checkAppointmentDraft,
  buildAppointmentInsert,
  problemMessage,
  type AppointmentDraft,
  type ExistingBookingLite,
} from "@/lib/lana-pro-venue-teams/appointment-draft";

type ClientOpt = { userId: string; name: string };
type ServiceOpt = { id: string; name: string; duration: number; price: number | null };
type TrainerOpt = { id: string; name: string };

export default function NewVenueBookingPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<WorkspaceContext | null | undefined>(undefined);
  const [gymId, setGymId] = useState<string | null>(null);
  const [fixedTrainerId, setFixedTrainerId] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [trainers, setTrainers] = useState<TrainerOpt[]>([]);
  const [providerByService, setProviderByService] = useState<Record<string, string[]>>({});
  const [existing, setExisting] = useState<ExistingBookingLite[]>([]);

  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const context = await loadWorkspaceContext();
      setCtx(context);
      if (!context) return;
      const active = context.activeContext;
      const kind = active?.kind;
      if (kind !== "business" && kind !== "employed") return;

      const resolvedGymId =
        kind === "business" ? active?.gymId ?? context.gyms[0]?.id ?? null : active?.gymId ?? null;
      setGymId(resolvedGymId);
      const myTrainerId = kind === "employed" ? active?.gymTrainerId ?? null : null;
      setFixedTrainerId(myTrainerId);
      if (myTrainerId) setTrainerId(myTrainerId);
      if (!resolvedGymId) return;

      const nowTs = new Date().toISOString().slice(0, 10) + "T00:00:00";
      const [svcRes, provRes, trnRes, rosterRes, existRes] = await Promise.all([
        supabase.from("gym_services").select("id, name, duration_minutes, price_kes, status").eq("gym_id", resolvedGymId),
        supabase.from("gym_service_providers").select("gym_service_id, gym_trainer_id, gym_services(gym_id)"),
        supabase.from("gym_trainers").select("id, full_name").eq("gym_id", resolvedGymId).eq("status", "active"),
        myTrainerId
          ? supabase.from("gym_trainer_clients").select("client_user_id, users(name)").eq("gym_trainer_id", myTrainerId).eq("status", "active")
          : supabase
              .from("gym_trainer_clients")
              .select("client_user_id, status, users(name), gym_trainers!inner(gym_id)")
              .eq("gym_trainers.gym_id", resolvedGymId)
              .eq("status", "active"),
        supabase
          .from("gym_service_bookings")
          .select("gym_trainer_id, starts_at, status, client_user_id, gym_service_id")
          .eq("gym_id", resolvedGymId)
          .gte("starts_at", nowTs),
      ]);

      setServices(
        ((svcRes.data as { id: string; name: string; duration_minutes: number | null; price_kes: number | string | null; status: string }[] | null) ?? [])
          .filter((s) => s.status === "active")
          .map((s) => ({
            id: s.id,
            name: s.name,
            duration: s.duration_minutes ?? 60,
            price: s.price_kes == null ? null : Number(s.price_kes),
          })),
      );

      const provMap: Record<string, string[]> = {};
      for (const p of ((provRes.data as { gym_service_id: string; gym_trainer_id: string; gym_services: { gym_id: string } | { gym_id: string }[] | null }[]) ?? [])) {
        const g = Array.isArray(p.gym_services) ? p.gym_services[0]?.gym_id : p.gym_services?.gym_id;
        if (g !== resolvedGymId) continue;
        (provMap[p.gym_service_id] ??= []).push(p.gym_trainer_id);
      }
      setProviderByService(provMap);

      setTrainers(
        ((trnRes.data as { id: string; full_name: string | null }[] | null) ?? []).map((t) => ({
          id: t.id,
          name: t.full_name ?? "Professional",
        })),
      );

      const seen = new Set<string>();
      const rosterClients: ClientOpt[] = [];
      for (const r of ((rosterRes.data as { client_user_id: string | null; users: { name: string | null } | { name: string | null }[] | null }[] | null) ?? [])) {
        if (!r.client_user_id || seen.has(r.client_user_id)) continue;
        seen.add(r.client_user_id);
        const u = Array.isArray(r.users) ? r.users[0] : r.users;
        rosterClients.push({ userId: r.client_user_id, name: u?.name ?? "Client" });
      }
      setClients(rosterClients);

      setExisting(
        ((existRes.data as { gym_trainer_id: string | null; starts_at: string; status: string; client_user_id: string | null; gym_service_id: string | null }[] | null) ?? []).map((b) => ({
          gymTrainerId: b.gym_trainer_id,
          startsAtLocal: (b.starts_at ?? "").slice(0, 16),
          status: b.status,
          clientUserId: b.client_user_id,
          gymServiceId: b.gym_service_id,
        })),
      );
    })();
  }, []);

  const service = services.find((s) => s.id === serviceId) ?? null;

  // Only professionals who provide the chosen service (gym_service_providers).
  const eligibleTrainers = useMemo(() => {
    if (fixedTrainerId) return trainers.filter((t) => t.id === fixedTrainerId);
    if (!serviceId) return trainers;
    const allowed = new Set(providerByService[serviceId] ?? []);
    return allowed.size > 0 ? trainers.filter((t) => allowed.has(t.id)) : trainers;
  }, [trainers, providerByService, serviceId, fixedTrainerId]);

  const draft: Partial<AppointmentDraft> = useMemo(
    () => ({
      clientUserId: clientId || undefined,
      gymServiceId: serviceId || undefined,
      gymTrainerId: trainerId || undefined,
      startsAtLocal: date && time ? `${date}T${time}` : undefined,
      durationMinutes: service?.duration ?? 0,
      priceKes: service?.price ?? null,
    }),
    [clientId, serviceId, trainerId, date, time, service?.duration, service?.price],
  );
  const nowLocal = new Date().toISOString().slice(0, 16);
  const check = checkAppointmentDraft(draft, existing, nowLocal);

  const create = useCallback(async () => {
    if (!ctx || !gymId || !check.ok) {
      if (!check.ok) setErr(check.problems.map(problemMessage).join(" "));
      return;
    }
    setSaving(true);
    setErr(null);
    const row = buildAppointmentInsert(draft as AppointmentDraft, { gymId, createdBy: ctx.userId });
    const { error } = await supabase.from("gym_service_bookings").insert(row);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/lana-pro/bookings");
    router.refresh();
  }, [ctx, gymId, check.ok, check.problems, draft, router]);

  if (ctx === undefined) return <div className="p-10 text-sm text-gray-400">Loading…</div>;
  if (!ctx || (ctx.activeContext?.kind !== "business" && ctx.activeContext?.kind !== "employed")) {
    return (
      <div className="p-6 md:p-10 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500">Switch to a venue or employed-professional context to book a venue appointment.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto">
      <Link href="/lana-pro/bookings" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
        ← Bookings
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New booking</h1>
      <p className="text-sm text-gray-500 mt-1">A venue appointment, delivered by one of your team.</p>

      {err && <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm mt-4">{err}</div>}

      <div className="mt-6 space-y-4">
        <Field label="Client">
          {clients.length === 0 ? (
            <p className="text-sm text-gray-400">No active roster clients found for this venue&apos;s team.</p>
          ) : (
            <select className={sel} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.userId} value={c.userId}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Service">
          <select className={sel} value={serviceId} onChange={(e) => { setServiceId(e.target.value); if (!fixedTrainerId) setTrainerId(""); }}>
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration} min{s.price ? ` · KES ${Math.round(s.price).toLocaleString("en-KE")}` : " · Free"}
              </option>
            ))}
          </select>
          {services.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              No active services. <Link href="/lana-pro/services/new" className="text-[#050040] font-semibold hover:underline">Add one</Link>.
            </p>
          )}
        </Field>

        <Field label="Professional">
          {fixedTrainerId ? (
            <p className="text-sm text-gray-700">{eligibleTrainers[0]?.name ?? "You"}</p>
          ) : (
            <select className={sel} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">Choose who delivers it…</option>
              {eligibleTrainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className={sel} min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <input type="time" className={sel} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        {service && clientId && trainerId && date && time && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm">
            <p className="font-semibold text-gray-900">{service.name}</p>
            <p className="text-gray-600 mt-0.5">
              {clients.find((c) => c.userId === clientId)?.name} with{" "}
              {eligibleTrainers.find((t) => t.id === trainerId)?.name}
            </p>
            <p className="text-gray-600 mt-0.5">{date} at {time} · {service.duration} min</p>
            <p className="text-gray-600 mt-0.5">
              {service.price ? `KES ${Math.round(service.price).toLocaleString("en-KE")}` : "Free"} · Payment not collected via Lana
            </p>
          </div>
        )}

        {!check.ok && (clientId || serviceId || trainerId || date || time) && (
          <p className="text-xs text-amber-700">{check.problems.map(problemMessage).join(" ")}</p>
        )}

        <PrimaryButton onClick={create} disabled={saving || !check.ok}>
          {saving ? "Creating…" : "Confirm booking"}
        </PrimaryButton>
      </div>
    </div>
  );
}

const sel = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#050040]/25";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

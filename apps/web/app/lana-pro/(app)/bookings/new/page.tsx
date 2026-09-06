"use client";

// LANA PRO — Phase 4.3: direct existing-client booking (§6/§7).
//   client (must be active) → active service → date → available time → confirm
// Writes pt_bookings directly (RLS policy 20260910000001 backs this).
// Does NOT create pt_clients — the relationship must already exist.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import { PrimaryButton } from "@/app/lana-pro/onboarding/OnboardingShell";
import { statusFromOfferingFlags } from "@/lib/lana-pro-services/service-status";
import {
  windowsForDate,
  generateSlots,
  busyFromBookings,
  checkDirectBookingEligibility,
} from "@/lib/lana-pro-bookings/slots";
import {
  normalisePtBookings,
  type PtBookingRow,
} from "@/lib/lana-pro-bookings/booking-model";

type ClientOpt = { userId: string; name: string };
type ServiceOpt = { id: string; title: string; duration: number; price: number | null; status: ReturnType<typeof statusFromOfferingFlags> };

const PT_COLS =
  "id, pt_id, user_id, offering_id, scheduled_date, scheduled_time, status, payment_status, payment_method, amount_kes, location_type, checked_in, guest_name, users(id, full_name, email), pt_offerings(id, title, duration_minutes, is_programme, gym_id)";

export default function NewBookingPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<WorkspaceContext | null | undefined>(undefined);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [availRows, setAvailRows] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([]);
  const [existing, setExisting] = useState<PtBookingRow[]>([]);

  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const context = await loadWorkspaceContext();
      setCtx(context);
      if (!context?.pt) return;
      const ptId = context.pt.id;
      const [cRes, sRes, aRes, bRes] = await Promise.all([
        supabase.from("pt_clients").select("client_user_id, status, users(name)").eq("pt_id", ptId).eq("status", "active"),
        supabase.from("pt_offerings").select("id, title, duration_minutes, price_kes, is_active, is_draft, is_programme").eq("pt_id", ptId),
        supabase.from("pt_availability").select("day_of_week, start_time, end_time").eq("pt_id", ptId).is("offering_id", null),
        supabase.from("pt_bookings").select(PT_COLS).eq("pt_id", ptId).gte("scheduled_date", new Date().toISOString().slice(0, 10)),
      ]);
      setClients(
        ((cRes.data as { client_user_id: string; users: { name: string | null } | null }[] | null) ?? [])
          .filter((r) => r.client_user_id)
          .map((r) => ({ userId: r.client_user_id, name: r.users?.name || "Client" })),
      );
      setServices(
        ((sRes.data as { id: string; title: string; duration_minutes: number | null; price_kes: number | string | null; is_active: boolean; is_draft: boolean; is_programme: boolean }[] | null) ?? [])
          .filter((o) => !o.is_programme)
          .map((o) => ({
            id: o.id,
            title: o.title,
            duration: o.duration_minutes ?? 60,
            price: o.price_kes == null ? null : Number(o.price_kes),
            status: statusFromOfferingFlags(o),
          })),
      );
      setAvailRows((aRes.data as { day_of_week: number; start_time: string; end_time: string }[] | null) ?? []);
      setExisting((bRes.data as PtBookingRow[] | null) ?? []);
    })();
  }, []);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const todayStr = new Date().toISOString().slice(0, 10);

  const slots = useMemo(() => {
    if (!service || !date) return [];
    const windows = windowsForDate(availRows, date);
    const busy = busyFromBookings(normalisePtBookings(existing), date);
    return generateSlots(windows, {
      durationMinutes: service.duration,
      busy,
      notBefore: date === todayStr ? new Date().toISOString().slice(11, 16) : undefined,
    });
  }, [service, date, availRows, existing, todayStr]);

  const eligibility = useMemo(() => {
    if (!service) return { ok: false, reasons: [] as string[] };
    return checkDirectBookingEligibility({
      clientRelationship: clientId ? "active" : "none",
      serviceStatus: service.status,
      chosenDate: date || undefined,
      chosenTime: time || undefined,
      durationMinutes: service.duration,
      availabilityWindows: windowsForDate(availRows, date),
      busyOnDate: busyFromBookings(normalisePtBookings(existing), date),
      todayStr,
    });
  }, [service, clientId, date, time, availRows, existing, todayStr]);

  const create = useCallback(async () => {
    if (!ctx?.pt || !service || !clientId || !date || !time) return;
    if (!eligibility.ok) {
      setErr("This time isn't available. Pick another slot.");
      return;
    }
    setSaving(true);
    setErr(null);
    // Honest payment state: no money is collected through Lana for a
    // professional-created booking today (§3). amount = price snapshot,
    // payment_status = pending, method = free.
    const { error } = await supabase.from("pt_bookings").insert({
      pt_id: ctx.pt.id,
      user_id: clientId,
      offering_id: service.id,
      scheduled_date: date,
      scheduled_time: time,
      status: "confirmed",
      payment_method: "free",
      payment_status: "pending",
      amount_kes: service.price,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/lana-pro/bookings");
  }, [ctx, service, clientId, date, time, eligibility.ok, router]);

  if (ctx === undefined) return <div className="p-10 text-sm text-gray-400">Loading…</div>;
  if (!ctx?.pt) {
    return (
      <div className="p-6 md:p-10 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500">Direct bookings are for independent professionals with a client roster.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto">
      <Link href="/lana-pro/bookings" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
        ← Bookings
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New booking</h1>
      <p className="text-sm text-gray-500 mt-1">For a client you already work with. They&apos;ll get the usual booking notification.</p>

      {err && <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm mt-4">{err}</div>}

      <div className="mt-6 space-y-4">
        <Field label="Client">
          {clients.length === 0 ? (
            <p className="text-sm text-gray-400">
              No active clients yet. <Link href="/lana-pro/clients/invite" className="text-[#050040] font-semibold hover:underline">Invite one</Link>.
            </p>
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
          <select className={sel} value={serviceId} onChange={(e) => { setServiceId(e.target.value); setTime(""); }}>
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id} disabled={s.status !== "active"}>
                {s.title} · {s.duration} min{s.price ? ` · KES ${Math.round(s.price).toLocaleString("en-KE")}` : " · Free"}
                {s.status !== "active" ? ` (${s.status})` : ""}
              </option>
            ))}
          </select>
          {services.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              No services yet. <Link href="/lana-pro/services/new" className="text-[#050040] font-semibold hover:underline">Add one</Link>.
            </p>
          )}
        </Field>

        <Field label="Date">
          <input type="date" className={sel} min={todayStr} value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} />
        </Field>

        {service && date && (
          <Field label="Available times">
            {slots.length === 0 ? (
              <p className="text-sm text-gray-400">
                No open times that day. Check your <Link href="/lana-pro/schedule" className="text-[#050040] font-semibold hover:underline">availability</Link>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(s)}
                    aria-pressed={time === s}
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold ${
                      time === s ? "border-[#050040] bg-[#050040] text-white" : "border-gray-200 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        {service && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm">
            <p className="font-semibold text-gray-900">{service.title}</p>
            <p className="text-gray-600 mt-0.5">
              {date || "—"} {time && `at ${time}`} · {service.duration} min
            </p>
            <p className="text-gray-600 mt-0.5">
              {service.price ? `KES ${Math.round(service.price).toLocaleString("en-KE")}` : "Free"} · Payment pending (not collected via Lana)
            </p>
          </div>
        )}

        <PrimaryButton onClick={create} disabled={saving || !eligibility.ok || !time}>
          {saving ? "Creating…" : "Create booking"}
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

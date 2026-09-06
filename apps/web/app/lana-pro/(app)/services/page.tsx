"use client";

// LANA PRO — Phase 4.2: Services.
//
// Reads the normalised LanaService model over the EXISTING supply tables
// (pt_offerings / sessions / gym_services / gym_access_passes). Programmes are
// dropped by the normaliser and can never appear here. Status (draft/active/
// inactive) is workspace state — NOT marketplace visibility (§11).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import {
  assembleServices,
  groupServicesByStatus,
  formatPrice,
  serviceSummaryLine,
  deliveryModeLabel,
  type LanaService,
  type OfferingRow,
  type SessionRow,
  type GymServiceRow,
  type GymAccessRow,
} from "@/lib/lana-pro-services/service-model";

const OFFERING_COLS =
  "id, title, description, type, duration_minutes, price_kes, max_participants, gym_id, is_active, is_draft, is_programme";

export default function LanaProServicesPage() {
  const [ctx, setCtx] = useState<WorkspaceContext | null | undefined>(undefined);
  const [services, setServices] = useState<LanaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const context = await loadWorkspaceContext();
    setCtx(context);
    if (!context) {
      setLoading(false);
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

    let offerings: OfferingRow[] = [];
    let sessions: SessionRow[] = [];
    let gymServices: GymServiceRow[] = [];
    let gymAccess: GymAccessRow[] = [];

    if (context.pt) {
      const { data } = await supabase.from("pt_offerings").select(OFFERING_COLS).eq("pt_id", context.pt.id);
      offerings = (data as OfferingRow[] | null) ?? [];
    }
    if (context.gyms.length > 0) {
      const gymIds = context.gyms.map((g) => g.id);
      const [sRes, gsRes, gaRes] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, gym_id, name, description, date, time, duration_minutes, max_capacity, category, instructor_id, drop_in_price, is_active")
          .in("gym_id", gymIds)
          .gte("date", ninetyAgo),
        // These two tables only exist after 20260909000001 is applied — tolerate absence.
        supabase.from("gym_services").select("id, gym_id, name, description, duration_minutes, price_kes, capacity, status").in("gym_id", gymIds),
        supabase.from("gym_access_passes").select("id, gym_id, name, description, duration_minutes, price_kes, capacity, status").in("gym_id", gymIds),
      ]);
      sessions = (sRes.data as SessionRow[] | null) ?? [];
      gymServices = gsRes.error ? [] : ((gsRes.data as GymServiceRow[] | null) ?? []);
      gymAccess = gaRes.error ? [] : ((gaRes.data as GymAccessRow[] | null) ?? []);
    }

    setServices(assembleServices({ offerings, sessions, gymServices, gymAccess, todayStr }));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (svc: LanaService, next: "active" | "inactive") => {
    setBusyId(svc.id);
    setError(null);
    let err: { message: string } | null = null;
    if (svc.sourceType === "pt_offering") {
      ({ error: err } = await supabase
        .from("pt_offerings")
        .update({ is_active: next === "active", is_draft: false })
        .eq("id", svc.sourceId));
    } else if (svc.sourceType === "gym_service") {
      ({ error: err } = await supabase.from("gym_services").update({ status: next }).eq("id", svc.sourceId));
    } else if (svc.sourceType === "gym_access_pass") {
      ({ error: err } = await supabase.from("gym_access_passes").update({ status: next }).eq("id", svc.sourceId));
    }
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const publishDraft = async (svc: LanaService) => setStatus(svc, "active");

  if (loading || ctx === undefined) {
    return <div className="p-6 md:p-10 max-w-4xl mx-auto text-sm text-gray-400">Loading…</div>;
  }
  if (!ctx) {
    return <div className="p-6 md:p-10 max-w-4xl mx-auto text-sm text-gray-500">Please sign in again.</div>;
  }

  const grouped = groupServicesByStatus(services);
  const isEmpty = services.length === 0;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Services</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage what clients can book.</p>
        </div>
        {!isEmpty && (
          <Link
            href="/lana-pro/services/new"
            className="flex-shrink-0 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
          >
            + Add service
          </Link>
        )}
      </div>

      {ctx.marketplaceGated && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 mt-4">
          <span className="font-semibold">You can build everything now.</span>{" "}
          Services you activate become bookable; your public marketplace profile is still under review.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm mt-4">{error}</div>
      )}

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center mt-6">
          <p className="text-sm font-semibold text-gray-900">You haven&apos;t added any services yet.</p>
          <p className="text-sm text-gray-500 mt-1">Create the first thing clients can book with you.</p>
          <Link
            href="/lana-pro/services/new"
            className="inline-block mt-4 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5"
          >
            Add your first service
          </Link>
        </div>
      ) : (
        <div className="space-y-8 mt-6">
          <ServiceGroup
            title="Active"
            services={grouped.active}
            busyId={busyId}
            onDeactivate={(s) => setStatus(s, "inactive")}
          />
          {grouped.drafts.length > 0 && (
            <ServiceGroup
              title="Drafts"
              subtitle="Not published — finish setup to make it bookable."
              services={grouped.drafts}
              busyId={busyId}
              onPublish={publishDraft}
            />
          )}
          {grouped.inactive.length > 0 && (
            <ServiceGroup
              title="Inactive"
              subtitle="Kept for your records. Not bookable."
              services={grouped.inactive}
              busyId={busyId}
              onReactivate={(s) => setStatus(s, "active")}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ServiceGroup({
  title,
  subtitle,
  services,
  busyId,
  onDeactivate,
  onReactivate,
  onPublish,
}: {
  title: string;
  subtitle?: string;
  services: LanaService[];
  busyId: string | null;
  onDeactivate?: (s: LanaService) => void;
  onReactivate?: (s: LanaService) => void;
  onPublish?: (s: LanaService) => void;
}) {
  if (services.length === 0 && title === "Active") {
    return (
      <section>
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-[0.12em] mb-3">{title}</h2>
        <p className="text-sm text-gray-400">No active services yet.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-[0.12em]">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      <ul className="space-y-3">
        {services.map((s) => {
          const busy = busyId === s.id;
          const editable = s.sourceType === "pt_offering" || s.sourceType === "gym_service" || s.sourceType === "gym_access_pass";
          const editHref = editable
            ? `/lana-pro/services/new?edit=${encodeURIComponent(s.id)}`
            : "/lana-pro/schedule";
          return (
            <li key={s.id} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{serviceSummaryLine(s)}</p>
                  <p className="text-sm text-gray-900 font-medium mt-1">{formatPrice(s.price, s.currency)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {s.deliveryModes.map(deliveryModeLabel).join(" · ")}
                    {s.teamDelivered ? " · Delivered by your team" : ""}
                    {s.occurrences ? ` · ${s.occurrences.future} scheduled` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <StatusPill status={s.status} />
                  <div className="flex items-center gap-2">
                    <Link href={editHref} className="text-xs font-semibold text-[#050040] hover:underline">
                      {editable ? "Edit" : "Edit in Schedule"}
                    </Link>
                    {onDeactivate && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeactivate(s)}
                        className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-40"
                      >
                        {busy ? "…" : "Deactivate"}
                      </button>
                    )}
                    {onReactivate && s.sourceType !== "session_group" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReactivate(s)}
                        className="text-xs font-semibold text-green-700 hover:underline disabled:opacity-40"
                      >
                        {busy ? "…" : "Reactivate"}
                      </button>
                    )}
                    {onPublish && s.sourceType !== "session_group" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPublish(s)}
                        className="text-xs font-semibold text-[#050040] hover:underline disabled:opacity-40"
                      >
                        {busy ? "…" : "Publish"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusPill({ status }: { status: LanaService["status"] }) {
  const map = {
    active: "bg-green-50 text-green-700",
    draft: "bg-amber-50 text-amber-700",
    inactive: "bg-gray-100 text-gray-500",
  } as const;
  const label = { active: "Available", draft: "Draft", inactive: "Inactive" }[status];
  return <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${map[status]}`}>{label}</span>;
}

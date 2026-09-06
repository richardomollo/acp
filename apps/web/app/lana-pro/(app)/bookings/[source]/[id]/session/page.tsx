// LANA PRO — Phase 4.4 / 4.6 + Phase 6 (Step 5): Professional session workspace.
//   /lana-pro/bookings/appointment/<pt_bookings.id>/session   — independent PT
//   /lana-pro/bookings/venue/<gym_service_bookings.id>/session — employed pro
//
// Server component: loads the booking, then builds the pre-session brief via the
// SAME consent-aware Phase-6 aggregator the Home / client-detail surfaces use —
// no separate intelligence path. Renders the interactive workspace.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { resolveWorkspaceIdentity } from "../../../../../_shared/identity";
import { flavourFromSpecialisations, type ProfessionalFlavour } from "@/lib/lana-pro-services/service-taxonomy";
import { canStartSession } from "@/lib/lana-pro-delivery/session-model";
import { resolveClientBrief } from "@/lib/lana-pro-intelligence/aggregator";
import { SessionWorkspace } from "./SessionWorkspace";

export const dynamic = "force-dynamic";

/** Best-effort flavour for a venue service — gym_services has no explicit
 *  flavour column; keyword-match the name, default to training (§26). */
function flavourFromServiceName(name: string): ProfessionalFlavour {
  const n = name.toLowerCase();
  if (/nutrition|diet|dietit|meal/.test(n)) return "nutrition";
  if (/massage|physio|therapy|recovery|spa|treatment/.test(n)) return "therapy";
  if (/consult|assess|wellness/.test(n)) return "general";
  return "training";
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  if (source === "venue") return <VenueSession id={id} />;
  if (source !== "appointment") redirect(`/lana-pro/bookings/${source}/${id}`);
  return <IndependentSession id={id} />;
}

function nowBits() {
  const iso = new Date().toISOString();
  return { nowIso: iso.slice(0, 19), todayStr: iso.slice(0, 10) };
}

// ── independent PT ─────────────────────────────────────────────────────

async function IndependentSession({ id }: { id: string }) {
  const supabase = await createClient();
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");
  if (!identity.pt) redirect(`/lana-pro/bookings/appointment/${id}`);
  const ptId = identity.pt.id;
  const { nowIso, todayStr } = nowBits();

  const { data: ptRow } = await supabase
    .from("personal_trainers")
    .select("specialisations")
    .eq("id", ptId)
    .maybeSingle();
  const flavour: ProfessionalFlavour = flavourFromSpecialisations(
    (ptRow?.specialisations as string[] | null) ?? null,
  );

  const { data: booking } = await supabase
    .from("pt_bookings")
    .select("id, pt_id, user_id, scheduled_date, scheduled_time, status, pt_offerings(title, duration_minutes)")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.pt_id !== ptId) return <Missing />;
  const offering = Array.isArray(booking.pt_offerings) ? booking.pt_offerings[0] : booking.pt_offerings;
  const clientId: string | null = booking.user_id ?? null;
  const serviceName = offering?.title || "Session";

  const [{ data: existing }, brief, userRow] = await Promise.all([
    supabase
      .from("professional_session_records")
      .select("*")
      .eq("booking_source", "pt_booking")
      .eq("booking_id", id)
      .maybeSingle(),
    clientId
      ? resolveClientBrief(
          supabase as unknown as Parameters<typeof resolveClientBrief>[0],
          {
            workspace: "independent",
            professionalKind: "personal_trainer",
            professionalId: ptId,
            professionalFlavour: flavour,
            clientUserId: clientId,
            todayLocalDate: todayStr,
            nowIso,
          },
          "detail",
        )
      : Promise.resolve(null),
    clientId
      ? supabase.from("users").select("name, email").eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const clientName =
    brief?.clientContext.name ||
    (userRow?.data as { name: string | null; email: string | null } | null)?.name ||
    "Client";
  const startable = canStartSession({ status: booking.status });

  return (
    <SessionWorkspace
      bookingId={id}
      ptId={ptId}
      clientId={clientId}
      clientName={clientName}
      serviceName={serviceName}
      flavour={flavour}
      scheduledDate={booking.scheduled_date}
      scheduledTime={booking.scheduled_time}
      durationMinutes={offering?.duration_minutes ?? null}
      bookingStatus={booking.status}
      startable={startable.ok}
      startBlockedReason={startable.reason ?? null}
      clientBrief={brief}
      existingRecord={existing ?? null}
    />
  );
}

// ── employed professional ─────────────────────────────────────────────

async function VenueSession({ id }: { id: string }) {
  const supabase = await createClient();
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");
  const { nowIso, todayStr } = nowBits();

  const { data: booking } = await supabase
    .from("gym_service_bookings")
    .select("id, gym_id, gym_trainer_id, client_user_id, starts_at, duration_minutes, status, gym_services(name, duration_minutes)")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return <Missing />;

  // Authorise: the caller must hold the gym_trainers row this booking is
  // assigned to. Context switching is navigation only — this is the boundary.
  const myTrainer = identity.employments.find((e) => e.gymTrainerId === booking.gym_trainer_id);
  if (!myTrainer) return <Missing />;
  const gymTrainerId = myTrainer.gymTrainerId;

  const svc = Array.isArray(booking.gym_services) ? booking.gym_services[0] : booking.gym_services;
  const serviceName = svc?.name || "Session";
  const flavour = flavourFromServiceName(serviceName);
  const clientId: string | null = booking.client_user_id ?? null;

  const [{ data: existing }, brief, userRow] = await Promise.all([
    supabase
      .from("professional_session_records")
      .select("*")
      .eq("booking_source", "gym_service_booking")
      .eq("booking_id", id)
      .maybeSingle(),
    clientId
      ? resolveClientBrief(
          supabase as unknown as Parameters<typeof resolveClientBrief>[0],
          {
            workspace: "employed",
            professionalKind: "gym_trainer",
            professionalId: gymTrainerId,
            professionalFlavour: flavour,
            clientUserId: clientId,
            todayLocalDate: todayStr,
            nowIso,
          },
          "detail",
        )
      : Promise.resolve(null),
    clientId
      ? supabase.from("users").select("name, email").eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const clientName =
    brief?.clientContext.name ||
    (userRow?.data as { name: string | null; email: string | null } | null)?.name ||
    "Client";
  const startable = canStartSession({ status: booking.status });
  const startsTime = (booking.starts_at ?? "").slice(11, 16);

  return (
    <SessionWorkspace
      bookingId={id}
      ptId=""
      professionalKind="gym_trainer"
      gymTrainerId={gymTrainerId}
      bookingSource="gym_service_booking"
      bookingTable="gym_service_bookings"
      backHref={`/lana-pro/bookings/venue/${id}`}
      clientId={clientId}
      clientName={clientName}
      serviceName={serviceName}
      flavour={flavour}
      scheduledDate={(booking.starts_at ?? "").slice(0, 10)}
      scheduledTime={startsTime || null}
      durationMinutes={booking.duration_minutes ?? svc?.duration_minutes ?? null}
      bookingStatus={booking.status}
      startable={startable.ok}
      startBlockedReason={startable.reason ?? null}
      clientBrief={brief}
      existingRecord={existing ?? null}
    />
  );
}

function Missing() {
  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <Link href="/lana-pro/bookings" className="text-sm font-semibold text-gray-400 hover:text-gray-700">
        ← Bookings
      </Link>
      <p className="text-sm text-gray-500 mt-6">This booking couldn&apos;t be found, or it isn&apos;t yours.</p>
    </div>
  );
}

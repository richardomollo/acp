import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { resolveWorkspaceIdentity } from "../../_shared/identity";
import {
  sessionToTodayItem,
  type SessionRow,
  type TodayItem,
} from "@/lib/lana-pro-workspace/today";
// §14 — Home derives "today" from the SAME booking normaliser /bookings + /schedule use.
import {
  normalisePtBookings,
  normaliseGymServiceBookings,
  type PtBookingRow as LanaPtBookingRow,
  type GymServiceBookingRow,
} from "@/lib/lana-pro-bookings/booking-model";
import { todayItemsFrom, bookingToTodayItem } from "@/lib/lana-pro-bookings/schedule-agg";
import { isOperationallyActive } from "@/lib/lana-pro-bookings/booking-model";
import {
  deriveProfessionalChecklist,
  deriveBusinessChecklist,
} from "@/lib/lana-pro-workspace/activation";
import {
  buildProfessionalHome,
  buildBusinessHome,
} from "@/lib/lana-pro-workspace/home-model";
import { proContextFor } from "../../_shared/pro-context";
import { resolveHomeIntelligence } from "@/lib/lana-pro-intelligence/aggregator";
import type { LanaClientBrief } from "@/lib/lana-pro-intelligence/client-brief";
import { resolveBusinessBrief } from "@/lib/lana-pro-intelligence/business-aggregator";
import { ProfessionalHome } from "./ProfessionalHome";
import { BusinessHome } from "./BusinessHome";
import { EmployedHome, type EmployedHomeModel } from "./EmployedHome";

const GYM_SVC_BOOKING_COLS =
  "id, gym_id, gym_service_id, gym_trainer_id, client_user_id, starts_at, duration_minutes, status, payment_status, price_kes, users(id, name, email), gym_services(id, name, duration_minutes), gym_trainers(id, full_name)";

function greetingFor(nowIso: string): string {
  const h = Number(nowIso.slice(11, 13));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// Always dynamic — it reads the signed-in user.
export const dynamic = "force-dynamic";

function nowParts() {
  const iso = new Date().toISOString();
  return { nowIso: iso.slice(0, 19), todayStr: iso.slice(0, 10) };
}

export default async function LanaProHomePage() {
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");
  if (identity.capabilities.needsOnboarding) redirect("/lana-pro/onboarding");

  const supabase = await createClient();
  const { nowIso, todayStr } = nowParts();

  // Phase 6 (Step 4) — Lana Intelligence for the active workspace. Business
  // owner context keeps the honest placeholder (no individual client data).
  let specialisations: string[] | null = null;
  if (identity.pt) {
    const { data: ptRow } = await supabase
      .from("personal_trainers")
      .select("specialisations")
      .eq("id", identity.pt.id)
      .maybeSingle();
    specialisations = (ptRow?.specialisations as string[] | null) ?? null;
  }
  const pro = proContextFor(identity, specialisations);
  const briefs: LanaClientBrief[] =
    pro && pro.workspace !== "business"
      ? await resolveHomeIntelligence(supabase as unknown as Parameters<typeof resolveHomeIntelligence>[0], {
          workspace: pro.workspace,
          professionalKind: pro.professionalKind,
          professionalId: pro.professionalId,
          professionalFlavour: pro.professionalFlavour,
          todayLocalDate: todayStr,
          nowIso,
          limit: 4,
        })
      : [];

  // §13 — an employed-professional context renders its own operational Home.
  if (identity.activeContext?.kind === "employed" && identity.activeContext.gymTrainerId) {
    const model = await buildEmployedModel(
      supabase,
      identity.activeContext.gymTrainerId,
      identity.activeContext.displayName,
      nowIso,
      todayStr,
    );
    return <EmployedHome model={model} briefs={briefs} />;
  }

  if (identity.capabilities.homeVariant === "business") {
    const model = await buildBusinessModel(supabase, identity, nowIso, todayStr);
    return <BusinessHome model={model} />;
  }

  const model = await buildProfessionalModel(supabase, identity, nowIso, todayStr);
  return (
    <ProfessionalHome
      model={model}
      marketplaceGated={identity.capabilities.marketplaceGated}
      briefs={briefs}
    />
  );
}

// ── professional ──────────────────────────────────────────────────────────

type SB = Awaited<ReturnType<typeof createClient>>;

async function buildProfessionalModel(
  supabase: SB,
  identity: NonNullable<Awaited<ReturnType<typeof resolveWorkspaceIdentity>>>,
  nowIso: string,
  todayStr: string,
) {
  const ptId = identity.pt?.id ?? identity.staffTrainer?.id ?? "";

  // Independent PT: real pt_bookings + pt_clients. Staff trainer: no
  // pt_bookings table of their own in 4.1 — empty schedule, roster still shown
  // on the Clients page.
  const isIndependent = !!identity.pt;

  const [bookingsRes, activeRes, invitedRes, offeringsRes, availabilityRes, anyClientRes, payoutRes, profileRes] =
    await Promise.all([
      isIndependent
        ? supabase
            .from("pt_bookings")
            .select(
              "id, pt_id, user_id, offering_id, scheduled_date, scheduled_time, status, payment_status, payment_method, amount_kes, location_type, checked_in, guest_name, users(id, full_name, email), pt_offerings(id, title, duration_minutes, is_programme, gym_id)",
            )
            .eq("pt_id", ptId)
            .in("status", ["pending", "confirmed"])
            .gte("scheduled_date", todayStr)
            .order("scheduled_date", { ascending: true })
            .order("scheduled_time", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: [] as LanaPtBookingRow[] }),
      isIndependent
        ? supabase.from("pt_clients").select("id", { count: "exact", head: true }).eq("pt_id", ptId).eq("status", "active")
        : Promise.resolve({ count: 0 }),
      isIndependent
        ? supabase.from("pt_clients").select("id", { count: "exact", head: true }).eq("pt_id", ptId).eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      isIndependent
        // Programmes are not sellable services (§2) — exclude them from the
        // "add your first service" evidence.
        ? supabase
            .from("pt_offerings")
            .select("id", { count: "exact", head: true })
            .eq("pt_id", ptId)
            .eq("is_programme", false)
        : Promise.resolve({ count: 0 }),
      isIndependent
        ? supabase.from("pt_availability").select("id", { count: "exact", head: true }).eq("pt_id", ptId)
        : Promise.resolve({ count: 0 }),
      isIndependent
        ? supabase.from("pt_clients").select("id", { count: "exact", head: true }).eq("pt_id", ptId)
        : Promise.resolve({ count: 0 }),
      isIndependent
        ? supabase.from("pt_payout_requests").select("id", { count: "exact", head: true }).eq("pt_id", ptId)
        : Promise.resolve({ count: 0 }),
      isIndependent
        ? supabase.from("personal_trainers").select("bio, specialisations, photo_url").eq("id", ptId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const todayItems: TodayItem[] = todayItemsFrom({
    appointments: normalisePtBookings((bookingsRes.data as LanaPtBookingRow[]) ?? [], {
      professionalName: identity.displayName ?? undefined,
    }),
    classBookings: [],
    nowIso,
  });

  const prof = profileRes.data as { bio: string | null; specialisations: string[] | null; photo_url: string | null } | null;
  const profileComplete =
    !!prof?.bio?.trim() && (prof?.specialisations?.length ?? 0) > 0 && !!prof?.photo_url;

  const checklist = deriveProfessionalChecklist({
    hasService: ((offeringsRes as { count: number | null }).count ?? 0) > 0,
    hasAvailability: ((availabilityRes as { count: number | null }).count ?? 0) > 0,
    hasClients: ((anyClientRes as { count: number | null }).count ?? 0) > 0,
    profileComplete,
    payoutReady: ((payoutRes as { count: number | null }).count ?? 0) > 0,
  });

  return buildProfessionalHome({
    nowIso,
    displayName: identity.displayName,
    professionalStatus: identity.pt?.status ?? "approved",
    todayItems,
    activeClientCount: (activeRes as { count: number | null }).count ?? 0,
    invitedClientCount: (invitedRes as { count: number | null }).count ?? 0,
    checklist,
    // No behavioural-evidence producer in 4.1 → honest "still learning" state.
    clientEvidence: {},
  });
}

// ── business ──────────────────────────────────────────────────────────────

async function buildBusinessModel(
  supabase: SB,
  identity: NonNullable<Awaited<ReturnType<typeof resolveWorkspaceIdentity>>>,
  nowIso: string,
  todayStr: string,
) {
  const gym = identity.gyms[0];
  const gymId = gym?.id ?? "";

  const startOfToday = `${todayStr}T00:00:00`;

  const [sessionsRes, futureSessionsRes, bookingsRes, teamRes, gymRes, gymSvcRes, gymAccessRes, venueApptRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, date, time, name, duration_minutes, max_capacity, is_active, instructor")
      .eq("gym_id", gymId)
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(50),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("gym_id", gymId).gt("date", todayStr),
    supabase.from("bookings").select("session_id").eq("gym_id", gymId).eq("booking_date", todayStr).limit(1000),
    supabase.from("gym_trainers").select("id", { count: "exact", head: true }).eq("gym_id", gymId),
    supabase.from("gyms").select("description, image_url, is_active").eq("id", gymId).maybeSingle(),
    // Phase 4.2 supply — tables exist only after 20260909000001; tolerate absence.
    supabase.from("gym_services").select("id", { count: "exact", head: true }).eq("gym_id", gymId),
    supabase.from("gym_access_passes").select("id", { count: "exact", head: true }).eq("gym_id", gymId),
    // Phase 4.6 — venue team-delivered appointments (gym_service_bookings).
    supabase
      .from("gym_service_bookings")
      .select(GYM_SVC_BOOKING_COLS)
      .eq("gym_id", gymId)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", startOfToday)
      .order("starts_at", { ascending: true })
      .limit(100),
  ]);

  const bookingCountBySession = new Map<string, number>();
  for (const b of (bookingsRes.data as { session_id: string | null }[]) ?? []) {
    if (!b.session_id) continue;
    bookingCountBySession.set(b.session_id, (bookingCountBySession.get(b.session_id) ?? 0) + 1);
  }

  const sessions = ((sessionsRes.data as SessionRow[]) ?? []).filter((s) => s.is_active !== false);
  const classItems: TodayItem[] = sessions.map((s) =>
    sessionToTodayItem(s, bookingCountBySession.get(s.id) ?? 0),
  );

  // §14 — venue team-delivered appointments today + "TEAM TODAY" per-trainer counts.
  const venueApptRows = ((venueApptRes as { data: GymServiceBookingRow[] | null }).data ?? []) as GymServiceBookingRow[];
  const venueAppts = normaliseGymServiceBookings(venueApptRows);
  const venueApptTodayItems: TodayItem[] = venueAppts
    .filter((b) => isOperationallyActive(b.status) && b.startAt.slice(0, 10) === todayStr)
    .map(bookingToTodayItem);
  const teamTodayMap = new Map<string, number>();
  for (const r of venueApptRows) {
    if ((r.starts_at ?? "").slice(0, 10) !== todayStr) continue;
    if (!["pending", "confirmed"].includes(r.status ?? "")) continue;
    const name = r.gym_trainers?.full_name?.trim() || "Unassigned";
    teamTodayMap.set(name, (teamTodayMap.get(name) ?? 0) + 1);
  }
  const teamToday = [...teamTodayMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const todayItems: TodayItem[] = [...classItems, ...venueApptTodayItems].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
  );

  const gymRow = gymRes.data as { description: string | null; image_url: string | null; is_active: boolean | null } | null;
  const anyVenueActive = identity.gyms.some((g) => g.is_active === true);

  const cnt = (r: unknown) => ((r as { count: number | null; error?: unknown }).error ? 0 : ((r as { count: number | null }).count ?? 0));
  const otherSupply = cnt(gymSvcRes) + cnt(gymAccessRes);

  const checklist = deriveBusinessChecklist({
    hasInventory: sessions.length > 0 || cnt(futureSessionsRes) > 0 || otherSupply > 0,
    hasSchedule: cnt(futureSessionsRes) > 0,
    hasTeam: ((teamRes as { count: number | null }).count ?? 0) > 0,
    teamRelevant: true,
    profileComplete: !!gymRow?.description?.trim() && !!gymRow?.image_url,
    payoutReady: !!gymRow?.is_active,
  });

  // Phase 6 (Step 8) — deterministic BUSINESS INTELLIGENCE. Operations only;
  // never touches individual client progress / health / private coaching data
  // (the aggregator simply does not query those tables).
  const businessBrief = gymId
    ? await resolveBusinessBrief(supabase as unknown as Parameters<typeof resolveBusinessBrief>[0], {
        workspace: "business",
        businessId: gymId,
        businessType: gym?.type ?? null,
        teamRelevant: true,
        todayLocalDate: todayStr,
        nowIso,
      })
    : null;

  return {
    ...buildBusinessHome({
      nowIso,
      displayName: identity.displayName,
      anyVenueActive,
      todayItems,
      checklist,
    }),
    teamToday,
    businessBrief,
  };
}

// ── employed professional (§13) ──────────────────────────────────────────

async function buildEmployedModel(
  supabase: SB,
  gymTrainerId: string,
  venueName: string,
  nowIso: string,
  todayStr: string,
): Promise<EmployedHomeModel> {
  const startOfToday = `${todayStr}T00:00:00`;
  const [apptRes, rosterRes] = await Promise.all([
    supabase
      .from("gym_service_bookings")
      .select(GYM_SVC_BOOKING_COLS)
      .eq("gym_trainer_id", gymTrainerId)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", startOfToday)
      .order("starts_at", { ascending: true })
      .limit(100),
    supabase
      .from("gym_trainer_clients")
      .select("id", { count: "exact", head: true })
      .eq("gym_trainer_id", gymTrainerId)
      .eq("status", "active"),
  ]);

  const rows = ((apptRes.data as GymServiceBookingRow[] | null) ?? []) as GymServiceBookingRow[];
  const bookings = normaliseGymServiceBookings(rows).filter((b) => isOperationallyActive(b.status));
  const today = bookings
    .filter((b) => b.startAt.slice(0, 10) === todayStr)
    .map(bookingToTodayItem);
  const future = bookings
    .filter((b) => b.startAt >= nowIso.slice(0, 19))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const next = future.length > 0 ? bookingToTodayItem(future[0]) : null;

  return {
    greeting: greetingFor(nowIso),
    venueName,
    today,
    next,
    activeClients: (rosterRes as { count: number | null }).count ?? 0,
  };
}

// LANA PRO — Phase 4.1 / 4.6: server-side workspace identity resolution.
//
// A handful of indexed lookups (personal_trainers, partners → partner_gyms,
// gym_trainers) fed into the PURE `deriveWorkspaceCapabilities` and the PURE
// context model. No writes.
//
// Phase 4.6: one auth.users may hold SEVERAL professional contexts at once —
// an independent `personal_trainers` profile, venue(s) they own, AND
// `gym_trainers` employment(s) elsewhere. We resolve ALL of them, never null
// one because another exists, and never merge the underlying rows.

// Server-only: relies on next/headers via createClient. Do not import from a
// "use client" module.
import { cookies } from "next/headers";
import { createClient } from "@/app/lib/supabase/server";
import {
  deriveWorkspaceCapabilities,
  type WorkspaceCapabilities,
  type ProfessionalStatus,
} from "@/lib/lana-pro-workspace/capabilities";
import {
  buildWorkspaceContexts,
  resolveActiveContext,
  applyContextToCapabilities,
  type WorkspaceContextOption,
} from "@/lib/lana-pro-workspace/contexts";

export const WORKSPACE_CONTEXT_COOKIE = "lana_pro_ctx";

export interface WorkspaceGym {
  id: string;
  name: string | null;
  type: string | null;
  is_active: boolean | null;
}

export interface WorkspaceEmployment {
  gymTrainerId: string;
  gymId: string;
  gymName: string | null;
  trainerName: string;
  status: string;
}

export interface WorkspaceIdentity {
  userId: string;
  email: string | null;
  /** independent / marketplace PT profile */
  pt: { id: string; status: ProfessionalStatus; displayName: string } | null;
  /** venues this user owns via partners → partner_gyms */
  gyms: WorkspaceGym[];
  /** ALL active `gym_trainers` employment rows for this user (any venue) */
  employments: WorkspaceEmployment[];
  /** back-compat: first employment, ONLY when the user has no independent
   *  profile (existing pages branch on this). New code should use `contexts`. */
  staffTrainer: { id: string; gymId: string } | null;
  /** the business employs ≥1 staff trainer across owned venues */
  employsTrainers: boolean;
  /** capabilities, already overlaid with the active context (nav + Home) */
  capabilities: WorkspaceCapabilities;
  /** ordered list of contexts this account can work in */
  contexts: WorkspaceContextOption[];
  /** the context currently selected (cookie, else the first) */
  activeContext: WorkspaceContextOption | null;
  /** best label for the shell header (follows the active context) */
  displayName: string;
}

/** Returns null when there is no signed-in user. */
export async function resolveWorkspaceIdentity(): Promise<WorkspaceIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [ptRes, partnerRes, staffRes] = await Promise.all([
    supabase
      .from("personal_trainers")
      .select("id, full_name, professional_name, status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("partners").select("id").eq("user_id", user.id).maybeSingle(),
    // ALL active employments — never .maybeSingle() (§2).
    supabase
      .from("gym_trainers")
      .select("id, gym_id, full_name, status")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const ptRow = ptRes.data;
  const pt = ptRow
    ? {
        id: ptRow.id as string,
        status: (ptRow.status ?? "pending") as ProfessionalStatus,
        displayName:
          (ptRow.professional_name as string | null) ||
          (ptRow.full_name as string | null) ||
          "Your practice",
      }
    : null;

  // Owned venues.
  let gyms: WorkspaceGym[] = [];
  if (partnerRes.data?.id) {
    const { data: pgs } = await supabase
      .from("partner_gyms")
      .select("gyms(id, name, type, is_active)")
      .eq("partner_id", partnerRes.data.id);
    gyms = (pgs ?? [])
      .map((row: { gyms: WorkspaceGym | WorkspaceGym[] | null }) =>
        Array.isArray(row.gyms) ? row.gyms[0] : row.gyms,
      )
      .filter((g): g is WorkspaceGym => !!g);
  }

  // Employments — resolve gym names (they may be venues the user does NOT own).
  const rawEmployments = (staffRes.data ?? []) as {
    id: string;
    gym_id: string;
    full_name: string | null;
    status: string;
  }[];
  const ownedById = new Map(gyms.map((g) => [g.id, g.name] as const));
  const missingNameIds = rawEmployments
    .map((e) => e.gym_id)
    .filter((id) => !ownedById.has(id));
  const empGymNames = new Map<string, string | null>();
  if (missingNameIds.length > 0) {
    const { data: empGyms } = await supabase
      .from("gyms")
      .select("id, name")
      .in("id", missingNameIds);
    for (const g of (empGyms ?? []) as { id: string; name: string | null }[]) {
      empGymNames.set(g.id, g.name);
    }
  }
  const employments: WorkspaceEmployment[] = rawEmployments.map((e) => ({
    gymTrainerId: e.id,
    gymId: e.gym_id,
    gymName: ownedById.get(e.gym_id) ?? empGymNames.get(e.gym_id) ?? null,
    trainerName: e.full_name ?? "You",
    status: e.status,
  }));

  // Does the BUSINESS (owned venues) employ anyone?
  let employsTrainers = false;
  if (gyms.length > 0) {
    const { count } = await supabase
      .from("gym_trainers")
      .select("id", { count: "exact", head: true })
      .in(
        "gym_id",
        gyms.map((g) => g.id),
      );
    employsTrainers = (count ?? 0) > 0;
  }

  const staffTrainer =
    employments.length > 0 && !pt
      ? { id: employments[0].gymTrainerId, gymId: employments[0].gymId }
      : null;

  // Contexts + active selection.
  const contexts = buildWorkspaceContexts({
    pt: pt ? { id: pt.id, displayName: pt.displayName } : null,
    gyms: gyms.map((g) => ({ id: g.id, name: g.name })),
    employments: employments.map((e) => ({
      gymTrainerId: e.gymTrainerId,
      gymId: e.gymId,
      gymName: e.gymName,
    })),
  });
  const cookieStore = await cookies();
  const requested = cookieStore.get(WORKSPACE_CONTEXT_COOKIE)?.value ?? null;
  const activeContext = resolveActiveContext(contexts, requested);

  const baseCapabilities = deriveWorkspaceCapabilities({
    hasProfessionalProfile: !!pt,
    professionalStatus: pt?.status ?? null,
    ownsBusiness: gyms.length > 0,
    businessTypes: gyms.map((g) => (g.type ?? "").toLowerCase()).filter(Boolean),
    anyVenueActive: gyms.some((g) => g.is_active === true),
    employsTrainers,
    isStaffTrainer: employments.length > 0,
  });
  const capabilities = applyContextToCapabilities(baseCapabilities, activeContext);

  const displayName =
    activeContext?.displayName ||
    (capabilities.homeVariant === "business"
      ? gyms[0]?.name || "Your business"
      : pt?.displayName || "Your practice");

  return {
    userId: user.id,
    email: user.email ?? null,
    pt,
    gyms,
    employments,
    staffTrainer,
    employsTrainers,
    capabilities,
    contexts,
    activeContext,
    displayName,
  };
}

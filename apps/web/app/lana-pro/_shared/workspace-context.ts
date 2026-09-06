"use client";

// LANA PRO — Phase 4.2: client-side workspace context for the Services /
// Schedule pages. Mirrors the server `resolveWorkspaceIdentity` but for
// "use client" pages that write supply directly (same pattern as the existing
// pt-dashboard pages). Read-only; no writes here.

import { supabase } from "@/app/lib/supabase/client";
import {
  deriveServiceCapability,
  flavourFromSpecialisations,
  type ServiceCapability,
  type ProfessionalFlavour,
} from "@/lib/lana-pro-services/service-taxonomy";
import {
  buildWorkspaceContexts,
  resolveActiveContext,
  type WorkspaceContextOption,
} from "@/lib/lana-pro-workspace/contexts";

function readContextCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)lana_pro_ctx=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export interface WorkspaceEmployment {
  gymTrainerId: string;
  gymId: string;
  gymName: string | null;
}

export interface WorkspaceContext {
  userId: string;
  pt: { id: string; status: string; flavour: ProfessionalFlavour } | null;
  gyms: { id: string; name: string | null; type: string | null; is_active: boolean | null }[];
  /** ALL active gym_trainers employments for this user (any venue). */
  employments: WorkspaceEmployment[];
  /** ordered contexts + the active one (cookie, else first). */
  contexts: WorkspaceContextOption[];
  activeContext: WorkspaceContextOption | null;
  employsTeam: boolean;
  teamTrainers: { id: string; full_name: string | null }[];
  capability: ServiceCapability;
  marketplaceGated: boolean;
}

export async function loadWorkspaceContext(): Promise<WorkspaceContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [ptRes, partnerRes, empRes] = await Promise.all([
    supabase
      .from("personal_trainers")
      .select("id, status, specialisations")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("partners").select("id").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("gym_trainers")
      .select("id, gym_id, gyms(name)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const pt = ptRes.data
    ? {
        id: ptRes.data.id as string,
        status: (ptRes.data.status ?? "pending") as string,
        flavour: flavourFromSpecialisations(ptRes.data.specialisations as string[] | null),
      }
    : null;

  let gyms: WorkspaceContext["gyms"] = [];
  let employsTeam = false;
  let teamTrainers: WorkspaceContext["teamTrainers"] = [];

  if (partnerRes.data?.id) {
    const { data: pgs } = await supabase
      .from("partner_gyms")
      .select("gyms(id, name, type, is_active)")
      .eq("partner_id", partnerRes.data.id);
    gyms = (pgs ?? [])
      .map((r: { gyms: WorkspaceContext["gyms"][number] | WorkspaceContext["gyms"][number][] | null }) =>
        Array.isArray(r.gyms) ? r.gyms[0] : r.gyms,
      )
      .filter((g): g is WorkspaceContext["gyms"][number] => !!g);

    if (gyms.length > 0) {
      const { data: trainers } = await supabase
        .from("gym_trainers")
        .select("id, full_name")
        .in(
          "gym_id",
          gyms.map((g) => g.id),
        )
        .neq("status", "suspended");
      teamTrainers = (trainers as WorkspaceContext["teamTrainers"]) ?? [];
      employsTeam = teamTrainers.length > 0;
    }
  }

  const capability = deriveServiceCapability({
    isIndependentPro: !!pt,
    professionalFlavour: pt?.flavour ?? "general",
    ownsVenue: gyms.length > 0,
    venueTypes: gyms.map((g) => (g.type ?? "").toLowerCase()).filter(Boolean),
    employsTeam,
  });

  const marketplaceGated =
    (!!pt && pt.status !== "approved") || (gyms.length > 0 && !gyms.some((g) => g.is_active === true));

  const employments: WorkspaceEmployment[] = (
    (empRes.data as { id: string; gym_id: string; gyms: { name: string | null } | { name: string | null }[] | null }[] | null) ?? []
  ).map((r) => ({
    gymTrainerId: r.id,
    gymId: r.gym_id,
    gymName: Array.isArray(r.gyms) ? (r.gyms[0]?.name ?? null) : (r.gyms?.name ?? null),
  }));

  const contexts = buildWorkspaceContexts({
    pt: pt ? { id: pt.id, displayName: "My practice" } : null,
    gyms: gyms.map((g) => ({ id: g.id, name: g.name })),
    employments,
  });
  const activeContext = resolveActiveContext(contexts, readContextCookie());

  return {
    userId: user.id,
    pt,
    gyms,
    employments,
    contexts,
    activeContext,
    employsTeam,
    teamTrainers,
    capability,
    marketplaceGated,
  };
}

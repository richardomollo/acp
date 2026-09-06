// LANA PRO — Phase 6: derive the intelligence aggregator context from the
// resolved workspace identity. Server-only glue — the real query logic lives
// in `lib/lana-pro-intelligence/aggregator.ts` (pure, testable).
//
// Workspace isolation is decided HERE: a person who is both an independent PT
// and an employed trainer gets exactly one context — the ACTIVE one.

import { flavourFromSpecialisations, type ProfessionalFlavour } from "@/lib/lana-pro-services/service-taxonomy";
import type { resolveWorkspaceIdentity } from "./identity";

type Identity = NonNullable<Awaited<ReturnType<typeof resolveWorkspaceIdentity>>>;

export interface ProContext {
  workspace: "independent" | "employed" | "business";
  professionalKind: "personal_trainer" | "gym_trainer";
  /** personal_trainers.id (independent) OR gym_trainers.id (employed); "" for business */
  professionalId: string;
  professionalFlavour: ProfessionalFlavour | null;
}

/**
 * @param specialisations the PT's `personal_trainers.specialisations` (for
 *   flavour). Optional — pass when available so nutritionists get nutrition
 *   observations; otherwise flavour is null and no nutrition data is fetched.
 */
export function proContextFor(identity: Identity, specialisations?: string[] | null): ProContext | null {
  const active = identity.activeContext;

  if (active?.kind === "business") {
    return { workspace: "business", professionalKind: "personal_trainer", professionalId: "", professionalFlavour: null };
  }

  if (active?.kind === "employed" && active.gymTrainerId) {
    return {
      workspace: "employed",
      professionalKind: "gym_trainer",
      professionalId: active.gymTrainerId,
      professionalFlavour: null,
    };
  }

  if (identity.pt) {
    return {
      workspace: "independent",
      professionalKind: "personal_trainer",
      professionalId: identity.pt.id,
      professionalFlavour: specialisations ? flavourFromSpecialisations(specialisations) : null,
    };
  }

  // Staff trainer with no independent profile and no explicit active context.
  if (identity.staffTrainer) {
    return {
      workspace: "employed",
      professionalKind: "gym_trainer",
      professionalId: identity.staffTrainer.id,
      professionalFlavour: null,
    };
  }

  return null;
}

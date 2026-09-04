// ACP Intelligence™ Day 7.3 — unified structured supply orchestration.
//
// NOT a RAG task. No embeddings, no pgvector, no knowledge_documents/
// knowledge_chunks, no LLM-based marketplace search/ranking/availability
// inference, no revenue/commission/margin/sponsorship weighting anywhere in
// this module or anything it imports — grep this directory for
// "embedding"/"vector"/"knowledge"/"openai" and it returns nothing (Test T).
//
// Architecture (see the Day 7.3 report for the full inspection write-up):
//   USER CONTEXT + PLAN ACTIVITY / SUPPORT NEED + LIVE ACP SUPPLY
//     → deterministic eligibility (hard filters, per source module)
//     → deterministic scoring (soft signals, per source module)
//     → diversified structured candidates (diversify.ts)
//     → SupplyCandidate[]
//
// Composition, not replacement (spec section 5/36/37): this module is pure
// (no Supabase import — exactly like lib/fulfilment.ts's existing
// convention, the call site fetches rows and passes them in) and reuses
// lib/fulfilment.ts's exported keyword/date helpers and
// lib/professional-support.ts's exported keyword tables rather than
// duplicating either. Neither existing module is modified in behaviour —
// only additively exported for reuse.
//
// No standalone venue candidate is ever emitted (see session-candidates.ts's
// header) — gyms.amenities is empty on every live row, so there is no
// structured venue-level facility data to rank on; venues only ever appear
// as fulfilment CONTEXT on session/experience candidates (the `venue`
// field). This is a reported data gap, not a fabricated feature.
import { buildSessionCandidates, type SessionCandidateRow } from './session-candidates.ts';
import { buildPersonalTrainerCandidates, buildNutritionistCandidates, type ProviderCandidateRow } from './provider-candidates.ts';
import { diversifySupplyCandidates, type DiversifyOptions } from './diversify.ts';
import type { SupplyCandidate, SupplyPlanActivityInput, SupplyUserContext, SupportOpportunity } from './types.ts';

export interface GetSupplyCandidatesParams {
  userContext: SupplyUserContext;
  /** Context A — plan execution (spec section 41). Omit for a pure support-need lookup. */
  planActivity?: SupplyPlanActivityInput;
  /** Context B — professional/support need (spec section 41). Always the ONLY source of "is support relevant" — never inferred from preferredActivities (Test R). */
  supportOpportunities?: SupportOpportunity[];
  /** Pre-fetched, already-active/future-filtered inventory (caller owns the Supabase query, matching lib/fulfilment.ts's existing convention — avoids N+1 inside this pure function, spec section 39). */
  sessionInventory?: SessionCandidateRow[];
  providers?: ProviderCandidateRow[];
  anchor: Date;
  limitPerType?: number;
  overallCap?: number;
}

/**
 * The one entry point: normalizes whichever live supply sources are
 * supplied, applies hard eligibility, scores soft fit, diversifies, and
 * returns a ranked SupplyCandidate[]. Returns [] (never a substituted/
 * unrelated candidate) when nothing genuinely matches (spec section 90
 * scenario 6).
 */
export function getSupplyCandidates(params: GetSupplyCandidatesParams): SupplyCandidate[] {
  const { userContext, planActivity, supportOpportunities, sessionInventory, providers, anchor } = params;
  const diversifyOptions: DiversifyOptions = { limitPerType: params.limitPerType, overallCap: params.overallCap };

  const all: SupplyCandidate[] = [];

  if (planActivity && sessionInventory) {
    all.push(...buildSessionCandidates({ planActivity, inventory: sessionInventory, userContext, anchor }));
  }

  if (providers) {
    all.push(...buildPersonalTrainerCandidates(providers, userContext, supportOpportunities));
    all.push(...buildNutritionistCandidates(providers, userContext, supportOpportunities));
  }

  return diversifySupplyCandidates(all, diversifyOptions);
}

export type { SupplyCandidate, SupplyCandidateType, SupplyUserContext, SupplyPlanActivityInput, SupplyScoring, SupplyReasonCode } from './types.ts';
export type { SessionCandidateRow } from './session-candidates.ts';
export type { ProviderCandidateRow } from './provider-candidates.ts';

// Beta Feedback #019D — the ONE query for "which personal_trainers are
// reachable from wherever Lana is currently showing marketplace supply for."
// See lib/professional-support.ts's mergeEligiblePtIds for the eligibility
// contract this implements. Every surface that can name a specific
// professional (My Plan, Today Nutrition, Log Progress, Trainers, Discover,
// Fitness Journey, Activity Fulfilment) resolves through this before
// matching/ranking — no surface re-derives its own venue/offering query.
//
// Beta Feedback #019E — the result now distinguishes "the query ran fine and
// found zero eligible ids" from "the query itself failed", so callers can
// render a genuine error state instead of quietly reusing the geography-
// unavailable copy (spec §5: a backend failure must never read as "Not
// available in <city> yet").
import { supabase } from '@/lib/supabase';
import { mergeEligiblePtIds } from '@/lib/professional-support';

export type EligiblePersonalTrainerIdsResult =
  | { ok: true; ids: string[] | null } // ids: string[] (may be []) when geo-gated; null when kill switch off — no filter
  | { ok: false };

/**
 * `venueScopeIds` is `MarketplaceLocationValue.venueScopeIds` — pass it
 * straight through, unmodified:
 *   • string[] (may be empty) → scope to these venues + explicit online
 *   • null                    → kill switch off, no filter (`{ ok: true, ids: null }`)
 *
 * §5/§8 — on a query failure, returns `{ ok: false }` (never a bare `[]`), so
 * a transient network error can be told apart from "zero eligible ids" and
 * rendered as a genuine error, never as "show everybody" nor as "not
 * available here."
 */
export async function getEligiblePersonalTrainerIds(venueScopeIds: string[] | null): Promise<EligiblePersonalTrainerIdsResult> {
  if (venueScopeIds === null) return { ok: true, ids: null }; // kill switch off — pre-#019 behaviour

  try {
    const [{ data: links }, { data: geoOfferings }, { data: onlineOfferings }] = await Promise.all([
      venueScopeIds.length
        ? supabase.from('pt_venue_links').select('pt_id').in('gym_id', venueScopeIds)
        : Promise.resolve({ data: [] as { pt_id: string }[] }),
      venueScopeIds.length
        ? supabase.from('pt_offerings').select('pt_id').eq('is_active', true).eq('is_draft', false).in('gym_id', venueScopeIds)
        : Promise.resolve({ data: [] as { pt_id: string }[] }),
      supabase.from('pt_offerings').select('pt_id').eq('is_active', true).eq('is_draft', false).eq('type', 'online'),
    ]);
    const ids = mergeEligiblePtIds(
      venueScopeIds,
      ((links as { pt_id: string }[] | null) ?? []).map(r => r.pt_id),
      ((geoOfferings as { pt_id: string }[] | null) ?? []).map(o => o.pt_id),
      ((onlineOfferings as { pt_id: string }[] | null) ?? []).map(o => o.pt_id),
    );
    return { ok: true, ids };
  } catch {
    return { ok: false }; // §5/§8 — a real query failure, distinguishable from "zero eligible ids"
  }
}

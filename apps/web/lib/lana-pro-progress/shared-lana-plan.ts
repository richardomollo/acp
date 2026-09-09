// LANA PRO — the ONE access boundary for a client's Lana-generated plan
// (planned occurrences + AUTHORITATIVE completion), via the consent-gated
// SECURITY DEFINER RPC `lana_pro_shared_plan_occurrences`.
//
// Every surface that needs the shared Lana plan — client-detail "Training this
// week", adherence facts, Home attention — goes through here. No surface calls
// `.rpc(...)` for this directly. The RPC itself enforces:
//   authenticated caller + active pt_clients/gym_trainer_clients relationship
//   + share_progress = true
// so this wrapper adds no authorization of its own.

export interface SharedLanaOccurrence {
  clientUserId: string;
  /** canonical local calendar date 'YYYY-MM-DD' */
  date: string;
  title: string;
  category: string | null;
  durationMinutes: number | null;
  /** the consumer app's authoritative completion state for this occurrence */
  completed: boolean;
}

/** minimal structural shape — the real Supabase client satisfies it */
export interface RpcCapable {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

type RpcRow = {
  client_user_id?: unknown;
  planned_date?: unknown;
  title?: unknown;
  category?: unknown;
  duration_minutes?: unknown;
  completed?: unknown;
};

/**
 * The load either succeeded (possibly with 0 occurrences — the client genuinely
 * has no Lana plan) OR it failed (RPC not deployed to this DB, permission, a
 * transient network/PostgREST error). Callers that render a factual empty state
 * ("no workouts this week") MUST check `ok` — an infrastructure failure is not
 * proof the client has no plan (§15/§21).
 */
export type SharedLanaPlanResult =
  | { ok: true; occurrences: SharedLanaOccurrence[] }
  | { ok: false; occurrences: []; error: string };

function describeRpcError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code : '';
    const msg = typeof e.message === 'string' ? e.message : '';
    return [code, msg].filter(Boolean).join(': ') || 'shared Lana plan RPC error';
  }
  return typeof error === 'string' && error ? error : 'shared Lana plan RPC error';
}

function mapRows(data: unknown): SharedLanaOccurrence[] {
  return (Array.isArray(data) ? (data as RpcRow[]) : [])
    .map((r): SharedLanaOccurrence | null => {
      const date = typeof r.planned_date === 'string' && r.planned_date.length >= 10 ? r.planned_date.slice(0, 10) : null;
      const clientUserId = typeof r.client_user_id === 'string' ? r.client_user_id : null;
      if (!date || !clientUserId) return null;
      const dur = Number(r.duration_minutes);
      return {
        clientUserId,
        date,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Planned workout',
        category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null,
        durationMinutes: Number.isFinite(dur) && dur > 0 ? dur : null,
        completed: r.completed === true,
      };
    })
    .filter((x): x is SharedLanaOccurrence => x !== null);
}

/**
 * Occurrences for the given consented client ids over [from, to] (inclusive),
 * distinguishing "loaded, empty" from "load failed" (§15). Security still fails
 * closed — a failure yields ZERO occurrences, never fabricated sessions — but
 * the caller can avoid asserting "No workouts scheduled" when the load errored.
 */
export async function getSharedLanaPlanWeek(
  supabase: RpcCapable,
  clientIds: readonly string[],
  from: string,
  to: string,
): Promise<SharedLanaPlanResult> {
  const ids = Array.from(new Set(clientIds.filter(Boolean)));
  if (ids.length === 0) return { ok: true, occurrences: [] };
  try {
    const { data, error } = await supabase.rpc('lana_pro_shared_plan_occurrences', {
      p_clients: ids,
      p_from: from,
      p_to: to,
    });
    if (error) return { ok: false, occurrences: [], error: describeRpcError(error) };
    if (!Array.isArray(data)) return { ok: false, occurrences: [], error: 'unexpected RPC response' };
    return { ok: true, occurrences: mapRows(data) };
  } catch (e) {
    return { ok: false, occurrences: [], error: describeRpcError(e) };
  }
}

/**
 * List-only convenience for callers that intentionally degrade to trainer-plan
 * only on failure (Home's adherence pre-screen). Returns [] on error OR on an
 * empty plan — use `getSharedLanaPlanWeek` where the two must be told apart.
 */
export async function getSharedLanaPlanOccurrences(
  supabase: RpcCapable,
  clientIds: readonly string[],
  from: string,
  to: string,
): Promise<SharedLanaOccurrence[]> {
  return (await getSharedLanaPlanWeek(supabase, clientIds, from, to)).occurrences;
}

/** group a flat occurrence list by client id */
export function groupSharedLanaByClient(
  rows: readonly SharedLanaOccurrence[],
): Map<string, SharedLanaOccurrence[]> {
  const out = new Map<string, SharedLanaOccurrence[]>();
  for (const r of rows) {
    (out.get(r.clientUserId) ?? out.set(r.clientUserId, []).get(r.clientUserId)!).push(r);
  }
  return out;
}

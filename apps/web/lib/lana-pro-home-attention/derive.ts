// LANA PRO — HOME INTELLIGENCE V1: derive "Clients needing attention".
//
// TWO-STAGE, BOUNDED, CONSTANT QUERY COST (independent of roster size):
//
//   STAGE A — cheap candidate identification
//     A1  consented roster                                         (1 query)
//     A2  ONE batched workout_history read across the roster, 28-day window,
//         newest-first, capped — completions for BOTH comment signals and
//         adherence counting                                       (1 query)
//     A3  ONE batched workout_schedules read across the roster (PT-assigned;
//         independent workspace only)                              (1 query)
//     A4  ONE batched Lana-plan load (RPC) across the roster over the
//         adherence window — source-complete adherence (§25)       (1 RPC)
//       → candidates = clients with a recent comment-bearing session
//         OR a computable adherence drop (trainer plan + Lana plan)
//       → rank by recency; keep the top HYDRATE_CAP
//
//   STAGE B — hydrate ONLY the top candidates through the canonical chain
//     B1  batched workouts   (id → title/category)                 (1 query)
//     B2  batched exercises  (id → name; skipped when none)        (1 query)
//     B3  batched users      (id → name)                           (1 query)
//       then PURE per client:
//         buildWorkoutFeedback → deriveWorkoutFeedbackSignals
//         + computeAdherenceFacts → deriveAdherenceSignals
//           → derivePTInsights → deriveSuggestedCoachingActions
//       one card per client, highest-priority insight only (§17/§26)
//
// Total: ≤ 6 DB queries + ≤ 1 RPC for any roster (1 when empty). No per-client
// DB loop, no N+1, no LLM, no writes. Consent enforced by an explicit
// `share_progress = true` roster filter BEFORE any evidence read (and again
// inside the RPC) — prevented, not filtered.

import type { SupabaseLike } from '../lana-pro-intelligence/aggregator.ts';
import { addDays } from '../lana-pro-intelligence/signals.ts';
import {
  buildWorkoutFeedback,
  computeAdherenceFacts,
  weekBounds,
  type ScheduleRow,
  type SharedLanaPlanOccurrence,
  type WorkoutHistoryFeedbackRow,
} from '../lana-pro-progress/progress.ts';

import { deriveWorkoutFeedbackSignals } from '../lana-pro-signals/derive.ts';
import { deriveAdherenceSignals } from '../lana-pro-signals/adherence.ts';
import { derivePTInsights } from '../lana-pro-insights/derive.ts';
import type { PTInsight } from '../lana-pro-insights/types.ts';
import { deriveSuggestedCoachingActions } from '../lana-pro-coaching-actions/derive.ts';
import type { SuggestedCoachingAction } from '../lana-pro-coaching-actions/types.ts';
import type { HomeAttentionItem } from './types.ts';

/** Loads the Lana-generated plan occurrences (planned + authoritative
 *  completion) for a batch of consented client ids over [from, to]. The page
 *  passes one backed by `getSharedLanaPlanOccurrences` (the RPC boundary);
 *  omitting it degrades Home to trainer-plan-only adherence. */
export type LoadSharedLana = (
  clientIds: string[],
  from: string,
  to: string,
) => Promise<(SharedLanaPlanOccurrence & { clientUserId: string })[]>;

export interface HomeAttentionContext {
  /** 'business' is handled by the caller — it yields no attention items */
  workspace: 'independent' | 'employed';
  /** personal_trainers.id (independent) OR gym_trainers.id (employed) */
  professionalId: string;
  todayLocalDate: string;
  /** display cap; clamped to [0, DISPLAY_CAP] */
  limit?: number;
}

/** L2 evidence window — identical to the client detail page. */
const FEEDBACK_WINDOW_DAYS = 28;
/** consented clients considered for candidacy (matches the legacy Home) */
const ROSTER_CAP = 200;
/** batched workout_history rows pulled across the whole roster */
const FEEDBACK_ROW_CAP = 400;
/** batched workout_schedules rows pulled across the whole roster */
const SCHEDULE_ROW_CAP = 400;
/** clients run through the full L1→L5 chain */
export const HYDRATE_CAP = 5;
/** attention items rendered on Home */
export const DISPLAY_CAP = 5;

const PRIORITY_RANK: Record<HomeAttentionItem['priority'], number> = { attention: 0, review: 1 };
// discomfort (safety) → adherence (execution) → progression (optimisation).
// This IS the deterministic tie-break when priorities match (§25).
const FAMILY_RANK: Record<PTInsight['family'], number> = { discomfort: 0, adherence: 1, progression: 2 };

type Row = Record<string, unknown>;

function nonEmpty(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}
/** a row that can SEED a comment insight = it carries a verbatim comment.
 *  (Mirrors buildClientProgress's feedback-row filter exactly.) */
function isSeedRow(r: Row): boolean {
  if (nonEmpty(r.notes)) return true;
  const en = r.exercise_notes;
  return !!en && typeof en === 'object' && Object.values(en as Record<string, unknown>).some(nonEmpty);
}

function toFeedbackRow(r: Row): WorkoutHistoryFeedbackRow {
  return {
    id: String(r.id),
    workout_id: String(r.workout_id),
    completed_at: nonEmpty(r.completed_at) ? String(r.completed_at) : null,
    status: (r.status as string | null) ?? null,
    completion_percentage: Number.isFinite(Number(r.completion_percentage)) ? Number(r.completion_percentage) : null,
    notes: typeof r.notes === 'string' ? r.notes : null,
    exercise_notes:
      r.exercise_notes && typeof r.exercise_notes === 'object' ? (r.exercise_notes as Record<string, unknown>) : null,
    perceived_difficulty: (r.perceived_difficulty as string | null) ?? null,
  };
}

function toScheduleRow(r: Row): ScheduleRow {
  const d = (v: unknown) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
  return {
    workout_id: String(r.workout_id),
    start_date: d(r.start_date) ?? '9999-12-31',
    recurrence: String(r.recurrence ?? 'once'),
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [],
    is_active: r.is_active !== false,
  };
}

// ── PURE HELPERS (separately tested) ──────────────────────────────────────

/** Home shows ONE card per client. Discomfort (safety) → adherence (execution)
 *  → progression (optimisation); within a family the newest insight wins
 *  (§17/§18/§26). */
export function pickTopInsight(insights: readonly PTInsight[]): PTInsight | null {
  if (insights.length === 0) return null;
  return [...insights].sort(
    (a, b) => FAMILY_RANK[a.family] - FAMILY_RANK[b.family] || b.observedAt.localeCompare(a.observedAt),
  )[0];
}

export function toHomeAttentionItem(
  clientId: string,
  clientName: string,
  insight: PTInsight,
  action: SuggestedCoachingAction,
): HomeAttentionItem {
  const recent = (insight.occurrences ?? []).filter((o) => o.period === 'recent');
  return {
    clientId,
    clientName,
    href: `/lana-pro/clients/${clientId}`,
    insightId: insight.id,
    insightFamily: insight.family,
    insightTitle: insight.title,
    actionId: action.id,
    actionTitle: action.title,
    actionStatement: action.statement,
    priority: action.priority,
    observedAt: insight.observedAt,
    basedOnSessions: insight.window.sessionCount,
    subjectLabel: insight.subject.label,
    ...(insight.family === 'adherence'
      ? {
          adherenceRecent: {
            completed: recent.filter((o) => o.status === 'completed').length,
            scheduled: recent.length,
          },
        }
      : {}),
  };
}

/** Deterministic order: attention before review, then the family rank
 *  (adherence before progression), then newest insight, then clientId — no
 *  numeric score, no LLM ranking (§5/§22/§25). */
export function rankHomeAttentionItems(items: readonly HomeAttentionItem[], limit = DISPLAY_CAP): HomeAttentionItem[] {
  const cap = Math.max(0, Math.min(Math.trunc(limit), DISPLAY_CAP));
  return [...items]
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        FAMILY_RANK[a.insightFamily] - FAMILY_RANK[b.insightFamily] ||
        b.observedAt.localeCompare(a.observedAt) ||
        a.clientId.localeCompare(b.clientId),
    )
    .slice(0, cap);
}

// ── THE AGGREGATOR ───────────────────────────────────────────────────────

export async function resolveHomeAttention(
  db: SupabaseLike,
  ctx: HomeAttentionContext,
  /** ONE batched load of the roster's Lana-generated plan occurrences over the
   *  adherence window — so Home adherence uses the SAME source-complete spine
   *  as client detail (§25). Omitted → trainer-plan-only, as before. */
  loadSharedLana?: LoadSharedLana,
): Promise<HomeAttentionItem[]> {
  const isEmployed = ctx.workspace === 'employed';
  const relTable = isEmployed ? 'gym_trainer_clients' : 'pt_clients';
  const proCol = isEmployed ? 'gym_trainer_id' : 'pt_id';

  // ── STAGE A1 — consented roster (share_progress gate BEFORE any evidence) ──
  const { data: rosterRaw } = await db
    .from(relTable)
    .select('client_user_id, created_at')
    .eq(proCol, ctx.professionalId)
    .eq('status', 'active')
    .eq('share_progress', true)
    .not('client_user_id', 'is', null)
    .limit(ROSTER_CAP);
  const consentedIds = Array.from(
    new Set(
      ((rosterRaw as Row[] | null) ?? [])
        .map((r) => (nonEmpty(r.client_user_id) ? String(r.client_user_id) : null))
        .filter((x): x is string => !!x),
    ),
  );
  if (consentedIds.length === 0) return [];
  const consentedSet = new Set(consentedIds);

  // ── STAGE A2 — ONE batched recent-completion read across the roster ──
  const sinceIso = `${addDays(ctx.todayLocalDate, -FEEDBACK_WINDOW_DAYS)}T00:00:00Z`;
  const { data: histRaw } = await db
    .from('workout_history')
    .select('id, user_id, workout_id, completed_at, status, completion_percentage, perceived_difficulty, notes, exercise_notes')
    .eq('status', 'completed')
    .in('user_id', consentedIds)
    .gte('completed_at', sinceIso)
    .order('completed_at', { ascending: false })
    .limit(FEEDBACK_ROW_CAP);

  const seedByClient = new Map<string, Row[]>();
  const completedByClient = new Map<string, { id: string; workoutId: string; date: string }[]>();
  for (const r of (histRaw as Row[] | null) ?? []) {
    const uid = nonEmpty(r.user_id) ? String(r.user_id) : '';
    if (!consentedSet.has(uid)) continue; // belt & braces over RLS
    if (!nonEmpty(r.completed_at) || String(r.completed_at) < sinceIso) continue;
    const date = String(r.completed_at).slice(0, 10);
    (completedByClient.get(uid) ?? completedByClient.set(uid, []).get(uid)!).push({
      id: String(r.id),
      workoutId: String(r.workout_id),
      date,
    });
    if (isSeedRow(r)) (seedByClient.get(uid) ?? seedByClient.set(uid, []).get(uid)!).push(r);
  }

  // ── STAGE A3 — ONE batched schedule read (PT-assigned; independent only) ──
  const schedByClient = new Map<string, ScheduleRow[]>();
  if (!isEmployed) {
    const { data: schedRaw } = await db
      .from('workout_schedules')
      .select('user_id, workout_id, start_date, recurrence, weekdays, is_active')
      .eq('assigned_by', ctx.professionalId)
      .in('user_id', consentedIds)
      .eq('is_active', true)
      .limit(SCHEDULE_ROW_CAP);
    for (const r of (schedRaw as Row[] | null) ?? []) {
      const uid = nonEmpty(r.user_id) ? String(r.user_id) : '';
      if (!consentedSet.has(uid)) continue;
      (schedByClient.get(uid) ?? schedByClient.set(uid, []).get(uid)!).push(toScheduleRow(r));
    }
  }

  // ── STAGE A4 — ONE batched Lana-plan load across the roster (adherence
  //    window = this week's Monday back 3 whole weeks) ──
  const lanaByClient = new Map<string, SharedLanaPlanOccurrence[]>();
  if (loadSharedLana) {
    const { weekStart } = weekBounds(ctx.todayLocalDate);
    const lanaFrom = addDays(weekStart, -21);
    const lanaTo = addDays(weekStart, -1);
    try {
      const rows = await loadSharedLana(consentedIds, lanaFrom, lanaTo);
      for (const r of rows) {
        if (!consentedSet.has(r.clientUserId)) continue;
        (lanaByClient.get(r.clientUserId) ?? lanaByClient.set(r.clientUserId, []).get(r.clientUserId)!).push(r);
      }
    } catch {
      // degrade to trainer-plan-only adherence — never break Home
    }
  }
  const lanaFor = (id: string) => lanaByClient.get(id) ?? [];

  // ── candidate identification (cheap; no titles needed for the pre-screen) ──
  type Cand = { id: string; recency: string };
  const candMap = new Map<string, Cand>();
  const bump = (id: string, recency: string) => {
    const cur = candMap.get(id);
    if (!cur || recency > cur.recency) candMap.set(id, { id, recency });
  };
  for (const [id, rows] of seedByClient) {
    bump(id, rows.reduce((mx, r) => (String(r.completed_at) > mx ? String(r.completed_at) : mx), ''));
  }
  const adherenceCandidateIds = new Set<string>([...schedByClient.keys(), ...lanaByClient.keys()]);
  for (const id of adherenceCandidateIds) {
    const facts = computeAdherenceFacts({
      schedules: schedByClient.get(id) ?? [],
      completions: completedByClient.get(id) ?? [],
      titleById: new Map(), // labels not needed to decide candidacy
      todayLocalDate: ctx.todayLocalDate,
      lanaOccurrences: lanaFor(id),
    });
    const sig = deriveAdherenceSignals(facts, id)[0];
    if (sig) bump(id, sig.observedAt);
  }
  if (candMap.size === 0) return [];

  const candidates = [...candMap.values()]
    .sort((a, b) => b.recency.localeCompare(a.recency) || a.id.localeCompare(b.id))
    .slice(0, HYDRATE_CAP);

  // ── STAGE B1/B2/B3 — batched hydration reads for the chosen candidates ──
  const chosenIds = candidates.map((c) => c.id);
  const seedRowsFor = (id: string) => seedByClient.get(id) ?? [];
  const workoutIds = Array.from(
    new Set(
      candidates.flatMap((c) => [
        ...seedRowsFor(c.id).map((r) => String(r.workout_id)),
        ...(schedByClient.get(c.id) ?? []).map((s) => s.workout_id),
      ]),
    ),
  );
  const exerciseNoteIds = Array.from(
    new Set(
      candidates.flatMap((c) =>
        seedRowsFor(c.id).flatMap((r) =>
          r.exercise_notes && typeof r.exercise_notes === 'object'
            ? Object.keys(r.exercise_notes as Record<string, unknown>)
            : [],
        ),
      ),
    ),
  );

  const [{ data: woRaw }, { data: exRaw }, { data: userRaw }] = await Promise.all([
    workoutIds.length > 0
      ? db.from('workouts').select('id, title, category').in('id', workoutIds).limit(workoutIds.length)
      : Promise.resolve({ data: [] as Row[], error: null }),
    exerciseNoteIds.length > 0
      ? db.from('exercises').select('id, name').in('id', exerciseNoteIds).limit(exerciseNoteIds.length)
      : Promise.resolve({ data: [] as Row[], error: null }),
    db.from('users').select('id, name, email').in('id', chosenIds).limit(chosenIds.length),
  ]);

  const titleById = new Map<string, string>();
  const categoryById = new Map<string, string>();
  for (const r of (woRaw as Row[] | null) ?? []) {
    titleById.set(String(r.id), String(r.title ?? 'Workout'));
    const c = typeof r.category === 'string' ? r.category.trim() : '';
    if (c) categoryById.set(String(r.id), c);
  }
  const exerciseNameById = new Map<string, string>(
    ((exRaw as Row[] | null) ?? []).map((r) => [String(r.id), String(r.name ?? 'Exercise')]),
  );
  const nameById = new Map<string, string>();
  for (const r of (userRaw as Row[] | null) ?? []) {
    nameById.set(String(r.id), String(r.name || r.email || 'Client'));
  }

  // ── STAGE B — PURE canonical chain per chosen candidate ──
  const items: HomeAttentionItem[] = [];
  for (const cand of candidates) {
    const clientName = nameById.get(cand.id) ?? 'Client';

    const feedback = buildWorkoutFeedback(
      seedRowsFor(cand.id).map(toFeedbackRow),
      titleById,
      exerciseNameById,
      categoryById,
    );
    const signals = deriveWorkoutFeedbackSignals(feedback, cand.id);

    const adherenceFacts = computeAdherenceFacts({
      schedules: schedByClient.get(cand.id) ?? [],
      completions: completedByClient.get(cand.id) ?? [],
      titleById,
      todayLocalDate: ctx.todayLocalDate,
      lanaOccurrences: lanaFor(cand.id), // SAME source-complete spine as client detail (§25)
    });
    const adherenceSignals = deriveAdherenceSignals(adherenceFacts, cand.id);

    const insights = derivePTInsights({ clientId: cand.id, clientName, feedback, signals, adherenceSignals });
    if (insights.length === 0) continue; // candidate but nothing qualified — no card
    const actions = deriveSuggestedCoachingActions({ clientId: cand.id, clientName, insights });

    const top = pickTopInsight(insights);
    if (!top) continue;
    const action = actions.find((a) => a.insightId === top.id);
    if (!action) continue; // L5 always makes one; defensive only

    items.push(toHomeAttentionItem(cand.id, clientName, top, action));
  }

  return rankHomeAttentionItems(items, ctx.limit ?? DISPLAY_CAP);
}

// LANA PRO — Phase 6 (Step 2): consent-aware server aggregator.
//
// THE most important privacy boundary in Phase 6. The rule is structural, not
// cosmetic: consent-gated tables are queried ONLY inside `if (consented)`.
// The aggregator PREVENTS the query — it never fetches-then-filters.
//
//   • Relationship is resolved FIRST (pt_clients | gym_trainer_clients).
//   • consented = relationship.status === 'active' && share_progress === true.
//   • Without consent: name, relationship, this professional's bookings /
//     session records / assigned tasks only.
//   • With consent: + the exact consumer evidence the Phase-6 inspection
//     confirmed is professionally visible (fitness_profile, client_measurements,
//     workout_history, workouts-assigned adherence, activities, daily_checkins
//     COUNT only, food_log_entries for nutrition flavour).
//   • NEVER, for any consent state: health_profile, coaching_memory,
//     health_daily_stats, health_workouts, strava_connections,
//     plan_activity_completions, plan_activity_execution, nutrition internals,
//     fitness_plans, meal_plans, saved_meals — and never daily_checkins
//     mood/note text (frequency only).
//   • Workspace isolation: an independent PT and an employed trainer who are
//     the same person see only the roster + evidence of the ACTIVE workspace.
//
// The DB dependency is a tiny structural interface so this whole module is
// unit-tested with a fake that records every table touched (node --test).

import type { ProfessionalFlavour } from '../lana-pro-services/service-taxonomy.ts';
import {
  buildClientBrief,
  type ClientBriefInput,
  type LanaClientBrief,
  type ProfessionalKind,
} from './client-brief.ts';
import { addDays } from './signals.ts';
import { humanGoal, humaniseLevel } from './labels.ts';

// ── minimal supabase surface (the real client satisfies this structurally) ──

export interface QueryResult<T = unknown> {
  data: T | null;
  error: unknown;
  count?: number | null;
}
export interface QueryBuilder extends PromiseLike<QueryResult> {
  select(cols?: string, opts?: { count?: 'exact'; head?: boolean }): QueryBuilder;
  eq(col: string, val: unknown): QueryBuilder;
  neq(col: string, val: unknown): QueryBuilder;
  in(col: string, vals: readonly unknown[]): QueryBuilder;
  gte(col: string, val: unknown): QueryBuilder;
  lte(col: string, val: unknown): QueryBuilder;
  not(col: string, op: string, val: unknown): QueryBuilder;
  order(col: string, opts?: { ascending?: boolean }): QueryBuilder;
  limit(n: number): QueryBuilder;
  maybeSingle(): PromiseLike<QueryResult>;
}
export interface SupabaseLike {
  from(table: string): QueryBuilder;
}

// ── context ───────────────────────────────────────────────────────────────

export type Workspace = 'independent' | 'employed' | 'business';

export interface AggregatorContext {
  workspace: Workspace;
  professionalKind: ProfessionalKind;
  /** personal_trainers.id (independent) OR gym_trainers.id (employed) */
  professionalId: string;
  professionalFlavour: ProfessionalFlavour | null;
  clientUserId: string;
  todayLocalDate: string;
  nowIso: string;
}

const ADHERENCE_WINDOW_DAYS = 7;
const ACTIVITY_HISTORY_WEEKS = 4;
const CHECKIN_WINDOW_DAYS = 14;
const NUTRITION_WINDOW_DAYS = 7;

// ═════════════════════════════════════════════════════════════════════════
// single client
// ═════════════════════════════════════════════════════════════════════════

export async function buildClientBriefInput(
  db: SupabaseLike,
  ctx: AggregatorContext,
): Promise<ClientBriefInput | null> {
  if (ctx.workspace === 'business') return null; // §13 — no individual client intelligence for the owner context

  const isEmployed = ctx.workspace === 'employed';
  const relTable = isEmployed ? 'gym_trainer_clients' : 'pt_clients';
  const proCol = isEmployed ? 'gym_trainer_id' : 'pt_id';
  const bookingTable = isEmployed ? 'gym_service_bookings' : 'pt_bookings';
  const sessionProCol = isEmployed ? 'gym_trainer_id' : 'personal_trainer_id';
  const sessionKind: ProfessionalKind = isEmployed ? 'gym_trainer' : 'personal_trainer';

  // ── 1. RELATIONSHIP FIRST ──
  const { data: rel } = await db
    .from(relTable)
    .select('status, share_progress, created_at')
    .eq(proCol, ctx.professionalId)
    .eq('client_user_id', ctx.clientUserId)
    .maybeSingle();
  if (!rel) return null;
  const relRow = rel as { status: string | null; share_progress: boolean | null; created_at: string | null };

  const consented = relRow.status === 'active' && relRow.share_progress === true;

  // ── 2. NON-GATED evidence (name + the professional's own artefacts) ──
  const { data: userRow } = await db
    .from('users')
    .select('name, email')
    .eq('id', ctx.clientUserId)
    .maybeSingle();
  const u = userRow as { name: string | null; email: string | null } | null;
  const clientName = u?.name || u?.email || 'Client';

  const nextBooking = await fetchNextBooking(db, ctx, bookingTable, proCol, isEmployed);
  const upcomingCount = await countUpcomingBookings(db, ctx, bookingTable, proCol);

  const { data: prevRows } = await db
    .from('professional_session_records')
    .select('focus, completed_at, client_response, plan_intent')
    .eq(sessionProCol, ctx.professionalId)
    .eq('client_user_id', ctx.clientUserId)
    .eq('session_status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);
  const prev =
    (prevRows as
      | { focus: string | null; completed_at: string | null; client_response: string | null; plan_intent: string | null }[]
      | null)?.[0] ?? null;

  const { count: completedCount } = await db
    .from('professional_session_records')
    .select('id', { count: 'exact', head: true })
    .eq(sessionProCol, ctx.professionalId)
    .eq('client_user_id', ctx.clientUserId)
    .eq('session_status', 'completed');

  const { data: dueRows } = await db
    .from('professional_session_records')
    .select('follow_up_at')
    .eq(sessionProCol, ctx.professionalId)
    .eq('client_user_id', ctx.clientUserId)
    .not('follow_up_at', 'is', null)
    .lte('follow_up_at', ctx.todayLocalDate)
    .order('follow_up_at', { ascending: true })
    .limit(1);
  const followUpDueOn = (dueRows as { follow_up_at: string | null }[] | null)?.[0]?.follow_up_at ?? null;

  // client_tasks is pt_id-keyed (personal_trainers only). Employed trainers
  // have no task surface — openActions stays empty for them.
  let openActionTitles: string[] = [];
  if (!isEmployed) {
    const { data: taskRows } = await db
      .from('client_tasks')
      .select('title')
      .eq('pt_id', ctx.professionalId)
      .eq('client_user_id', ctx.clientUserId)
      .eq('status', 'pending')
      .limit(10);
    openActionTitles = ((taskRows as { title: string | null }[] | null) ?? [])
      .map((t) => (t.title ?? '').trim())
      .filter(Boolean);
  }

  const input: ClientBriefInput = {
    clientId: ctx.clientUserId,
    clientName,
    professionalRef: { kind: sessionKind, id: ctx.professionalId },
    professionalFlavour: ctx.professionalFlavour,
    todayLocalDate: ctx.todayLocalDate,
    nowIso: ctx.nowIso,
    relationship: { status: normaliseStatus(relRow.status), createdAt: relRow.created_at },
    sharesProgress: consented,
    nextBooking,
    previousSession: prev
      ? {
          focus: prev.focus,
          completedAtDate: prev.completed_at ? prev.completed_at.slice(0, 10) : null,
          clientResponse: prev.client_response ?? null,
          planIntent: prev.plan_intent ?? null,
        }
      : null,
    completedSessionsCount: completedCount ?? 0,
    openActionTitles,
    followUpDueOn,
    hasUpcomingBooking: (upcomingCount ?? 0) > 0,
  };

  // ── 3. CONSENT-GATED evidence — ONLY reached when consented ──
  if (consented) {
    await attachSharedProgress(db, ctx, input);
  }

  return input;
}

export async function resolveClientBrief(
  db: SupabaseLike,
  ctx: AggregatorContext,
  surface: 'home' | 'detail' = 'detail',
): Promise<LanaClientBrief | null> {
  const input = await buildClientBriefInput(db, ctx);
  if (!input) return null;
  return buildClientBrief(input, surface);
}

// ═════════════════════════════════════════════════════════════════════════
// Home — roster → cheap rank → hydrate the top few
// ═════════════════════════════════════════════════════════════════════════

export interface HomeContext {
  workspace: Workspace;
  professionalKind: ProfessionalKind;
  professionalId: string;
  professionalFlavour: ProfessionalFlavour | null;
  todayLocalDate: string;
  nowIso: string;
  /** hard cap on hydrated intelligence items (§ "Maximum 3–4") */
  limit?: number;
}

export async function resolveHomeIntelligence(
  db: SupabaseLike,
  home: HomeContext,
): Promise<LanaClientBrief[]> {
  if (home.workspace === 'business') return []; // owner context keeps the honest placeholder

  const isEmployed = home.workspace === 'employed';
  const relTable = isEmployed ? 'gym_trainer_clients' : 'pt_clients';
  const proCol = isEmployed ? 'gym_trainer_id' : 'pt_id';
  const bookingTable = isEmployed ? 'gym_service_bookings' : 'pt_bookings';
  const sessionProCol = isEmployed ? 'gym_trainer_id' : 'personal_trainer_id';

  const { data: rosterRows } = await db
    .from(relTable)
    .select('client_user_id, status, share_progress, created_at')
    .eq(proCol, home.professionalId)
    .eq('status', 'active')
    .not('client_user_id', 'is', null)
    .limit(200);
  const roster = ((rosterRows as RosterRow[] | null) ?? []).filter((r) => r.client_user_id);
  if (roster.length === 0) return [];
  const ids = roster.map((r) => r.client_user_id);

  const [nextByClient, openByClient, dueSet] = await Promise.all([
    nextBookingDaysByClient(db, home, bookingTable, proCol, ids),
    isEmployed
      ? Promise.resolve(new Map<string, number>())
      : openActionsByClient(db, home.professionalId, ids),
    followUpDueSet(db, home.professionalId, sessionProCol, home.todayLocalDate, ids),
  ]);

  // Cheap, non-gated ranking (no consumer progress needed to decide WHO).
  const ranked = roster
    .map((r) => {
      const days = nextByClient.get(r.client_user_id);
      const ageDays = r.created_at
        ? Math.floor((Date.parse(home.nowIso) - Date.parse(r.created_at)) / 864e5)
        : 999;
      const score =
        (dueSet.has(r.client_user_id) ? 1000 : 0) +
        (days != null && days >= 0 && days <= 2 ? 500 - days : 0) +
        ((openByClient.get(r.client_user_id) ?? 0) > 0 ? 100 : 0) +
        (ageDays <= 10 ? 40 : 0);
      return { id: r.client_user_id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const limit = Math.max(1, Math.min(home.limit ?? 4, 4));
  const chosen = ranked.slice(0, limit);

  const briefs = await Promise.all(
    chosen.map((c) =>
      resolveClientBrief(
        db,
        {
          workspace: home.workspace,
          professionalKind: home.professionalKind,
          professionalId: home.professionalId,
          professionalFlavour: home.professionalFlavour,
          clientUserId: c.id,
          todayLocalDate: home.todayLocalDate,
          nowIso: home.nowIso,
        },
        'home',
      ),
    ),
  );
  return briefs.filter((b): b is LanaClientBrief => b != null);
}

// ═════════════════════════════════════════════════════════════════════════
// gated fetch — the whole reason this module exists
// ═════════════════════════════════════════════════════════════════════════

async function attachSharedProgress(
  db: SupabaseLike,
  ctx: AggregatorContext,
  input: ClientBriefInput,
): Promise<void> {
  const client = ctx.clientUserId;
  const weekStart = mondayOf(ctx.todayLocalDate);
  const activitySince = addDays(ctx.todayLocalDate, -(ACTIVITY_HISTORY_WEEKS * 7));
  const checkinSince = addDays(ctx.todayLocalDate, -CHECKIN_WINDOW_DAYS);
  const nutritionSince = addDays(ctx.todayLocalDate, -NUTRITION_WINDOW_DAYS);
  const adherenceSince = addDays(ctx.todayLocalDate, -ADHERENCE_WINDOW_DAYS);

  // fitness_profile — goal, experience, preferences
  const { data: fp } = await db
    .from('fitness_profile')
    .select('goal, goals, experience_level, preferred_activities, preferred_training_days')
    .eq('user_id', client)
    .maybeSingle();
  const prof = fp as {
    goal: string | null;
    goals: string[] | null;
    experience_level: string | null;
    preferred_activities: string[] | null;
    preferred_training_days: string[] | null;
  } | null;
  if (prof) {
    input.goal = {
      label: prof.goal ? humanGoal(prof.goal) : null,
      secondary: (Array.isArray(prof.goals) ? prof.goals : []).map(humanGoal),
    };
    input.experienceLevel = prof.experience_level ? humaniseLevel(prof.experience_level) : null;
    input.preferredActivities = (prof.preferred_activities ?? []).map(humaniseLevel);
    input.preferredTrainingDays = (prof.preferred_training_days ?? []).map(humaniseLevel);
  }

  // client_measurements — recent weights + recency
  const { data: measRows } = await db
    .from('client_measurements')
    .select('weight_kg, logged_at')
    .eq('user_id', client)
    .order('logged_at', { ascending: false })
    .limit(6);
  const meas = (measRows as { weight_kg: number | string | null; logged_at: string | null }[] | null) ?? [];
  const weights = meas
    .map((m) => Number(m.weight_kg))
    .filter((n) => Number.isFinite(n))
    .slice(0, 3);
  if (weights.length >= 3) input.recentWeightsKg = weights;
  const lastLoggedAt = meas.find((m) => m.logged_at)?.logged_at ?? null;
  input.daysSinceLastMeasurement = lastLoggedAt
    ? Math.max(0, Math.floor((Date.parse(`${ctx.todayLocalDate}T00:00:00Z`) - Date.parse(lastLoggedAt)) / 864e5))
    : null;

  // assigned-workout adherence — denominator: workouts THIS pro assigned in the
  // window; numerator: those with a completion in workout_history.
  const assignedCol = ctx.professionalKind === 'gym_trainer' ? 'assigned_by_gym_trainer_id' : 'assigned_by';
  const { data: assignedRows } = await db
    .from('workouts')
    .select('id, suggested_local_date')
    .eq('user_id', client)
    .eq(assignedCol, ctx.professionalId)
    .gte('suggested_local_date', adherenceSince)
    .limit(50);
  const assigned = (assignedRows as { id: string; suggested_local_date: string | null }[] | null) ?? [];
  if (assigned.length > 0) {
    const assignedIds = assigned.map((a) => a.id);
    const { data: doneRows } = await db
      .from('workout_history')
      .select('workout_id')
      .eq('user_id', client)
      .in('workout_id', assignedIds)
      .eq('status', 'completed');
    const doneIds = new Set(((doneRows as { workout_id: string | null }[] | null) ?? []).map((d) => d.workout_id));
    input.assignedWorkoutAdherence = {
      assigned: assigned.length,
      completed: assigned.filter((a) => doneIds.has(a.id)).length,
      windowDays: ADHERENCE_WINDOW_DAYS,
    };
  }

  // activity vs recent pattern — workout_history + activities counts by week
  const [{ data: whRows }, { data: actRows }] = await Promise.all([
    db.from('workout_history').select('completed_at').eq('user_id', client).gte('completed_at', `${activitySince}T00:00:00Z`),
    db.from('activities').select('start_time').eq('user_id', client).gte('start_time', `${activitySince}T00:00:00Z`),
  ]);
  const activityDates: string[] = [
    ...(((whRows as { completed_at: string | null }[] | null) ?? []).map((r) => r.completed_at)),
    ...(((actRows as { start_time: string | null }[] | null) ?? []).map((r) => r.start_time)),
  ]
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 10));
  input.activityPattern = weeklyPattern(activityDates, weekStart, ctx.todayLocalDate);

  // check-in FREQUENCY only — id count, never mood/note
  const { count: checkinCount } = await db
    .from('daily_checkins')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', client)
    .gte('checkin_date', checkinSince);
  if ((checkinCount ?? 0) > 0) {
    input.checkInCount = { count: checkinCount ?? 0, windowDays: CHECKIN_WINDOW_DAYS };
  }

  // nutrition logging pattern — nutritionist flavour only
  if (ctx.professionalFlavour === 'nutrition') {
    const { data: flRows } = await db
      .from('food_log_entries')
      .select('local_date, meal_slot')
      .eq('user_id', client)
      .gte('local_date', nutritionSince)
      .limit(200);
    const rows = (flRows as { local_date: string | null; meal_slot: string | null }[] | null) ?? [];
    if (rows.length > 0) {
      const days = new Set(rows.map((r) => r.local_date).filter(Boolean));
      const bDays = new Set(
        rows.filter((r) => (r.meal_slot ?? '').toLowerCase() === 'breakfast').map((r) => r.local_date).filter(Boolean),
      );
      input.nutrition = { daysWithAnyLog: days.size, windowDays: NUTRITION_WINDOW_DAYS, breakfastDays: bDays.size };
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
// non-gated helpers
// ═════════════════════════════════════════════════════════════════════════

interface RosterRow {
  client_user_id: string;
  status: string | null;
  share_progress: boolean | null;
  created_at: string | null;
}

function normaliseStatus(s: string | null): 'active' | 'pending' | 'inactive' | 'none' {
  if (s === 'active' || s === 'pending' || s === 'inactive') return s;
  return 'none';
}


function mondayOf(localDate: string): string {
  const t = Date.parse(`${localDate}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(t - dow * 864e5).toISOString().slice(0, 10);
}

/** counts per ISO-week; returns { thisWeek, recentWeeklyMean, weeksObserved }. */
function weeklyPattern(
  dates: string[],
  thisWeekStart: string,
  today: string,
): { thisWeek: number; recentWeeklyMean: number; weeksObserved: number } | null {
  if (dates.length === 0) return null;
  const byWeek = new Map<string, number>();
  for (const d of dates) {
    const wk = mondayOf(d);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }
  const thisWeek = byWeek.get(thisWeekStart) ?? 0;
  const priorWeeks: number[] = [];
  for (let i = 1; i <= ACTIVITY_HISTORY_WEEKS; i += 1) {
    const wk = addDays(thisWeekStart, -7 * i);
    if (wk >= addDays(today, -(ACTIVITY_HISTORY_WEEKS * 7 + 7))) priorWeeks.push(byWeek.get(wk) ?? 0);
  }
  const weeksObserved = priorWeeks.length;
  if (weeksObserved < 2) return { thisWeek, recentWeeklyMean: 0, weeksObserved };
  const mean = priorWeeks.reduce((a, b) => a + b, 0) / weeksObserved;
  return { thisWeek, recentWeeklyMean: mean, weeksObserved };
}

async function fetchNextBooking(
  db: SupabaseLike,
  ctx: AggregatorContext,
  table: string,
  proCol: string,
  isEmployed: boolean,
): Promise<ClientBriefInput['nextBooking']> {
  if (isEmployed) {
    const { data } = await db
      .from(table)
      .select('id, starts_at, gym_services(name)')
      .eq(proCol, ctx.professionalId)
      .eq('client_user_id', ctx.clientUserId)
      .in('status', ['pending', 'confirmed'])
      .gte('starts_at', `${ctx.todayLocalDate}T00:00:00`)
      .order('starts_at', { ascending: true })
      .limit(1);
    const row = (data as { id: string; starts_at: string | null; gym_services: { name: string | null } | { name: string | null }[] | null }[] | null)?.[0];
    if (!row?.starts_at) return null;
    const svc = Array.isArray(row.gym_services) ? row.gym_services[0] : row.gym_services;
    return { atIso: row.starts_at, serviceName: svc?.name || 'Session', source: 'venue', bookingId: row.id };
  }
  const { data } = await db
    .from(table)
    .select('id, scheduled_date, scheduled_time, pt_offerings(title)')
    .eq(proCol, ctx.professionalId)
    .eq('user_id', ctx.clientUserId)
    .in('status', ['pending', 'confirmed'])
    .gte('scheduled_date', ctx.todayLocalDate)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .limit(1);
  const row = (data as { id: string; scheduled_date: string | null; scheduled_time: string | null; pt_offerings: { title: string | null } | { title: string | null }[] | null }[] | null)?.[0];
  if (!row?.scheduled_date) return null;
  const off = Array.isArray(row.pt_offerings) ? row.pt_offerings[0] : row.pt_offerings;
  const time = (row.scheduled_time ?? '00:00').slice(0, 5);
  return {
    atIso: `${row.scheduled_date}T${time}:00`,
    serviceName: off?.title || 'Session',
    source: 'appointment',
    bookingId: row.id,
  };
}

async function countUpcomingBookings(
  db: SupabaseLike,
  ctx: AggregatorContext,
  table: string,
  proCol: string,
): Promise<number | null> {
  if (ctx.workspace === 'employed') {
    const { count } = await db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(proCol, ctx.professionalId)
      .eq('client_user_id', ctx.clientUserId)
      .in('status', ['pending', 'confirmed'])
      .gte('starts_at', `${ctx.todayLocalDate}T00:00:00`);
    return count ?? 0;
  }
  const { count } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(proCol, ctx.professionalId)
    .eq('user_id', ctx.clientUserId)
    .in('status', ['pending', 'confirmed'])
    .gte('scheduled_date', ctx.todayLocalDate);
  return count ?? 0;
}

async function nextBookingDaysByClient(
  db: SupabaseLike,
  home: HomeContext,
  table: string,
  proCol: string,
  ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const today = Date.parse(`${home.todayLocalDate}T00:00:00Z`);
  if (home.workspace === 'employed') {
    const { data } = await db
      .from(table)
      .select('client_user_id, starts_at')
      .eq(proCol, home.professionalId)
      .in('status', ['pending', 'confirmed'])
      .in('client_user_id', ids)
      .gte('starts_at', `${home.todayLocalDate}T00:00:00`);
    for (const r of (data as { client_user_id: string; starts_at: string | null }[] | null) ?? []) {
      if (!r.starts_at) continue;
      const d = Math.round((Date.parse(`${r.starts_at.slice(0, 10)}T00:00:00Z`) - today) / 864e5);
      const prev = out.get(r.client_user_id);
      if (prev == null || d < prev) out.set(r.client_user_id, d);
    }
    return out;
  }
  const { data } = await db
    .from(table)
    .select('user_id, scheduled_date')
    .eq(proCol, home.professionalId)
    .in('status', ['pending', 'confirmed'])
    .in('user_id', ids)
    .gte('scheduled_date', home.todayLocalDate);
  for (const r of (data as { user_id: string; scheduled_date: string | null }[] | null) ?? []) {
    if (!r.scheduled_date) continue;
    const d = Math.round((Date.parse(`${r.scheduled_date}T00:00:00Z`) - today) / 864e5);
    const prev = out.get(r.user_id);
    if (prev == null || d < prev) out.set(r.user_id, d);
  }
  return out;
}

async function openActionsByClient(db: SupabaseLike, ptId: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data } = await db
    .from('client_tasks')
    .select('client_user_id')
    .eq('pt_id', ptId)
    .eq('status', 'pending')
    .in('client_user_id', ids);
  for (const r of (data as { client_user_id: string }[] | null) ?? []) {
    out.set(r.client_user_id, (out.get(r.client_user_id) ?? 0) + 1);
  }
  return out;
}

async function followUpDueSet(
  db: SupabaseLike,
  professionalId: string,
  sessionProCol: string,
  today: string,
  ids: string[],
): Promise<Set<string>> {
  const { data } = await db
    .from('professional_session_records')
    .select('client_user_id')
    .eq(sessionProCol, professionalId)
    .not('follow_up_at', 'is', null)
    .lte('follow_up_at', today)
    .in('client_user_id', ids);
  return new Set(((data as { client_user_id: string }[] | null) ?? []).map((r) => r.client_user_id));
}

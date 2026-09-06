// LANA PRO — Phase 6 (Step 8): BUSINESS INTELLIGENCE server aggregator.
//
// The privacy boundary here is structural and blunt: this module queries ONLY
// business-operations tables —
//   gyms context is passed in; it reads
//   gym_services, gym_access_passes, gym_trainers, sessions, bookings,
//   gym_service_bookings
// and it NEVER queries:
//   fitness_profile, client_measurements, workout_history, activities,
//   food_log_entries, daily_checkins, professional_session_records,
//   pt_clients, gym_trainer_clients, client_tasks, pt_bookings
// A business owner does NOT inherit an employed PT's coaching relationship
// (§2 / §12). Tested with a fake that records every table touched.
//
// The DB dependency is the same tiny structural `SupabaseLike` interface the
// client-side aggregator uses, so this whole module is unit-tested with
// `node --test`.

import type { SupabaseLike } from './aggregator.ts';
import {
  buildBusinessBrief,
  type BusinessBriefInput,
  type LanaBusinessBrief,
} from './business-brief.ts';
import {
  bucketWeekdayFill,
  weekdayLabelOf,
  addDays,
  MIN_DEMAND_WEEKS,
  type UpcomingClass,
} from './business-signals.ts';

export interface BusinessAggregatorContext {
  /** guard — anything other than 'business' yields null, no queries */
  workspace: 'independent' | 'employed' | 'business';
  /** gyms.id of the active business context */
  businessId: string;
  /** raw gyms.type (used only for the coarse shape) */
  businessType: string | null;
  /** does a team belong in this business? (from ownership / capabilities) */
  teamRelevant: boolean;
  todayLocalDate: string;
  nowIso: string;
}

/** Upcoming-activity window and how far back the demand comparator looks. */
const WINDOW_DAYS = 7;
const HISTORY_WEEKS = 4;

// Statuses that count as a real, still-live class booking (never cancelled /
// no-show). `bookings.status` CHECK also allows pending_payment / deposit_paid.
const LIVE_BOOKING_STATUSES = ['pending', 'pending_payment', 'deposit_paid', 'confirmed', 'checked_in', 'completed'];

interface SessionRow {
  id: string;
  date: string | null;
  time: string | null;
  name: string | null;
  max_capacity: number | null;
  is_active: boolean | null;
}
interface ClassBookingRow {
  session_id: string | null;
  status: string | null;
  no_show: boolean | null;
  booking_date: string | null;
}

export async function resolveBusinessBrief(
  db: SupabaseLike,
  ctx: BusinessAggregatorContext,
): Promise<LanaBusinessBrief | null> {
  if (ctx.workspace !== 'business') return null; // §12 — owner-only surface
  if (!ctx.businessId) return null;

  const gymId = ctx.businessId;
  const historyStart = addDays(ctx.todayLocalDate, -(HISTORY_WEEKS * 7 + 7));
  const windowEnd = addDays(ctx.todayLocalDate, WINDOW_DAYS);
  const startOfToday = `${ctx.todayLocalDate}T00:00:00`;
  const endOfWindow = `${windowEnd}T00:00:00`;

  const [svcRes, accessRes, teamRes, sessionsRes, classBookingsRes, apptRes] = await Promise.all([
    // any bookable service (category is always 'appointment' today, but count all)
    db.from('gym_services').select('id, status').eq('gym_id', gymId).limit(500),
    db.from('gym_access_passes').select('id, status').eq('gym_id', gymId).limit(200),
    db.from('gym_trainers').select('id, status').eq('gym_id', gymId).limit(200),
    // classes across the whole history+future window (one query)
    db
      .from('sessions')
      .select('id, date, time, name, max_capacity, is_active')
      .eq('gym_id', gymId)
      .gte('date', historyStart)
      .lte('date', windowEnd)
      .order('date', { ascending: true })
      .limit(1000),
    db
      .from('bookings')
      .select('session_id, status, no_show, booking_date')
      .eq('gym_id', gymId)
      .gte('booking_date', historyStart)
      .lte('booking_date', windowEnd)
      .limit(5000),
    // upcoming venue-delivered appointments — operational count only
    db
      .from('gym_service_bookings')
      .select('id, starts_at, status')
      .eq('gym_id', gymId)
      .in('status', ['pending', 'confirmed'])
      .gte('starts_at', startOfToday)
      .lte('starts_at', endOfWindow)
      .limit(500),
  ]);

  const services = (svcRes.data as { id: string; status: string | null }[] | null) ?? [];
  const accessPasses = (accessRes.data as { id: string; status: string | null }[] | null) ?? [];
  const team = (teamRes.data as { id: string; status: string | null }[] | null) ?? [];
  const sessions = ((sessionsRes.data as SessionRow[] | null) ?? []).filter((s) => s.is_active !== false && s.date);
  const classBookings = (classBookingsRes.data as ClassBookingRow[] | null) ?? [];
  const appts = (apptRes.data as { id: string; starts_at: string | null; status: string | null }[] | null) ?? [];

  // qualifying booking count per session (exclude cancelled + no-show)
  const bookedBySession = new Map<string, number>();
  const bookedByDate = new Map<string, number>(); // for the demand bucketer, keyed session date
  for (const b of classBookings) {
    if (!b.session_id) continue;
    if (b.no_show === true) continue;
    if (!LIVE_BOOKING_STATUSES.includes((b.status ?? '').trim())) continue;
    bookedBySession.set(b.session_id, (bookedBySession.get(b.session_id) ?? 0) + 1);
  }

  const toStartAt = (date: string, time: string | null): string => {
    const t = (time ?? '').trim();
    const hhmmss = t.length === 0 ? '00:00:00' : t.length === 5 ? `${t}:00` : t.slice(0, 8);
    return `${date}T${hhmmss}`;
  };

  // every class occurrence in the window, with its qualifying booking count
  const allDatedClasses = sessions.map((s) => ({
    id: s.id,
    name: (s.name ?? '').trim() || 'Class',
    startAt: toStartAt(s.date as string, s.time),
    capacity: s.max_capacity,
    booked: bookedBySession.get(s.id) ?? 0,
  }));

  // upcoming subset for capacity + load
  const upcomingClasses: UpcomingClass[] = allDatedClasses.filter(
    (c) => c.startAt.slice(0, 10) >= ctx.todayLocalDate && c.startAt.slice(0, 10) <= windowEnd,
  );

  // ── history-gated demand comparator ──
  const buckets = bucketWeekdayFill({
    classes: allDatedClasses,
    todayLocalDate: ctx.todayLocalDate,
    historyWeeks: HISTORY_WEEKS,
  });
  let demand: BusinessBriefInput['demand'] = null;
  const usable = buckets
    .filter((b) => b.weeksObserved >= MIN_DEMAND_WEEKS)
    .sort((a, b) => Math.abs(b.thisWeekFill - b.priorMeanFill) - Math.abs(a.thisWeekFill - a.priorMeanFill));
  if (usable.length > 0) {
    const top = usable[0];
    demand = {
      weekdayLabel: weekdayLabelOf(top.weekday),
      thisWeekFill: top.thisWeekFill,
      priorMeanFill: top.priorMeanFill,
      weeksObserved: top.weeksObserved,
    };
  }

  // freshness — newest operational date we actually saw
  const dates: string[] = [
    ...upcomingClasses.map((c) => c.startAt.slice(0, 10)),
    ...appts.map((a) => (a.starts_at ?? '').slice(0, 10)).filter(Boolean),
    ...classBookings.map((b) => b.booking_date ?? '').filter(Boolean),
  ];
  const newestEvidenceDate = dates.length ? dates.slice().sort().at(-1)! : null;

  const input: BusinessBriefInput = {
    businessId: gymId,
    businessType: ctx.businessType,
    nowIso: ctx.nowIso,
    todayLocalDate: ctx.todayLocalDate,
    setup: {
      hasService: services.length > 0 || accessPasses.length > 0 || sessions.length > 0,
      hasSchedule: allDatedClasses.some((c) => c.startAt.slice(0, 10) >= ctx.todayLocalDate),
      hasTeam: team.length > 0,
      teamRelevant: ctx.teamRelevant,
      hasFacilityAccess: accessPasses.length > 0,
    },
    upcomingClasses,
    upcomingAppointmentCount: appts.length,
    windowDays: WINDOW_DAYS,
    demand,
    newestEvidenceDate,
  };

  return buildBusinessBrief(input);
}

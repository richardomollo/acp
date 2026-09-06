// LANA PRO — Phase 6 (Step 8): BUSINESS INTELLIGENCE signals (PURE).
//
// The second expression of Lana Intelligence: "Where does my business need
// attention and what can I do?" — operating on BUSINESS OPERATIONS only
// (bookings, services, schedule, team, capacity). It never touches an
// individual client's progress, health data, or a professional's private
// coaching evidence — that boundary lives in `business-aggregator.ts`, which
// simply never queries those tables.
//
// Same discipline as the client side:
//   • FACT        — verifiable, present-tense, from real operational rows.
//   • OBSERVATION  — a derived pattern, explicitly not a fact, conservative.
//   • Every rendered string passes `assertBriefSafe`.
//   • No trend claim without enough history (§14) — the demand comparator is
//     silent below MIN_DEMAND_WEEKS comparable weeks.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

import { assertBriefSafe } from '../lana-pro-delivery/copy-safety.ts';

export type BusinessSignalTag = 'fact' | 'observation';

export interface BusinessSignalItem {
  tag: BusinessSignalTag;
  kind: string;
  text: string;
  /** newest operational date this signal rests on (freshness), if any */
  evidenceDate?: string;
}

// ── business type (from real ops, not a hardcoded venue label, §10) ────────

export type BusinessShape = 'gym' | 'studio' | 'spa' | 'mixed';

const STUDIO_HINTS = ['pilates', 'yoga', 'barre', 'spin', 'cycle', 'dance'];
const SPA_HINTS = ['spa', 'wellness', 'massage', 'recovery', 'sauna', 'therapy', 'beauty'];
const GYM_HINTS = ['gym', 'fitness', 'strength', 'weights', 'crossfit'];

/** Coarse shape used ONLY to decide which setup gaps are relevant. A signal
 *  still never fires unless the underlying inventory supports it. */
export function normaliseBusinessShape(raw: string | null | undefined): BusinessShape {
  const t = (raw ?? '').toLowerCase().trim();
  if (!t) return 'mixed';
  if (STUDIO_HINTS.some((h) => t.includes(h))) return 'studio';
  if (SPA_HINTS.some((h) => t.includes(h))) return 'spa';
  if (GYM_HINTS.some((h) => t.includes(h))) return 'gym';
  return 'mixed';
}

/** Classes are a relevant concept for gyms / studios / mixed venues — not for
 *  an appointment-led spa (§13). */
export function classesRelevant(shape: BusinessShape): boolean {
  return shape !== 'spa';
}
/** Facility / open access is a relevant concept for gyms and spas, not a
 *  class-only studio (§11). */
export function facilityRelevant(shape: BusinessShape): boolean {
  return shape === 'gym' || shape === 'spa';
}
/** Appointment services are a natural fit for spas, gyms and mixed venues. */
export function appointmentsRelevant(shape: BusinessShape): boolean {
  return shape !== 'studio';
}

// ── setup gaps (valuable even with zero history, §4G / §7) ────────────────

export type BusinessGapId =
  | 'no_service'
  | 'no_schedule'
  | 'no_team'
  | 'no_facility_access';

export interface BusinessGap {
  id: BusinessGapId;
  /** short observation line */
  text: string;
  /** supporting one-liner (the "why it matters") */
  detail: string;
}

export interface SetupInput {
  shape: BusinessShape;
  /** ≥1 bookable service of any kind (gym_services OR sessions OR access) */
  hasService: boolean;
  /** ≥1 upcoming class occurrence */
  hasSchedule: boolean;
  /** ≥1 gym_trainers row */
  hasTeam: boolean;
  /** does a team belong in this business at all? (caller decides from ownership) */
  teamRelevant: boolean;
  /** ≥1 gym_access_passes row */
  hasFacilityAccess: boolean;
}

/** Deterministic, ordered list of the setup gaps that actually apply. */
export function setupGaps(input: SetupInput): BusinessGap[] {
  const out: BusinessGap[] = [];

  if (!input.hasService) {
    out.push({
      id: 'no_service',
      text: 'You haven’t added any services yet.',
      detail: 'Give clients something to book.',
    });
  }

  if (input.hasService && !input.hasSchedule && classesRelevant(input.shape)) {
    out.push({
      id: 'no_schedule',
      text: 'No upcoming classes are scheduled.',
      detail: 'Add times so clients can book the week ahead.',
    });
  }

  // Team is only a meaningful gap once there is something to deliver — a
  // brand-new business is nudged to add a service first (§10: ops, not labels).
  if (input.teamRelevant && input.hasService && !input.hasTeam) {
    out.push({
      id: 'no_team',
      text: 'Your team is empty.',
      detail: 'Invite the professionals who work with you.',
    });
  }

  if (facilityRelevant(input.shape) && !input.hasFacilityAccess && input.hasService) {
    out.push({
      id: 'no_facility_access',
      text: 'Facility access isn’t set up yet.',
      detail: 'Add an access pass for open use of your space.',
    });
  }

  for (const g of out) {
    assertBriefSafe(g.text, 'business-signals:gap');
    assertBriefSafe(g.detail, 'business-signals:gap-detail');
  }
  return out;
}

// ── class capacity (§4B — real booking count, never spots_left) ───────────

export interface UpcomingClass {
  id: string;
  name: string;
  /** local wall-clock 'YYYY-MM-DDTHH:MM:SS' */
  startAt: string;
  capacity: number | null;
  /** qualifying bookings only — cancelled / no-show already excluded upstream */
  booked: number;
}

const NEARLY_FULL_RATIO = 0.8;

function weekdayName(startAt: string): string {
  const d = new Date(`${startAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
}

function timeOfDay(startAt: string): string {
  const hh = Number(startAt.slice(11, 13));
  if (!Number.isFinite(hh)) return '';
  if (hh < 12) return 'morning';
  if (hh < 17) return 'afternoon';
  return 'evening';
}

/** Capacity signals for the classes coming up, most-pressing first. Only
 *  classes with a real positive capacity produce a line. Full → FACT;
 *  nearly-full → OBSERVATION. Malformed / zero capacity is silently skipped. */
export function classCapacitySignals(
  classes: readonly UpcomingClass[],
  opts: { max?: number } = {},
): BusinessSignalItem[] {
  const max = Math.max(1, opts.max ?? 2);
  const scored = classes
    .filter((c) => Number.isFinite(c.capacity as number) && (c.capacity ?? 0) > 0)
    .map((c) => {
      const cap = c.capacity as number;
      const booked = Math.max(0, Math.min(Math.trunc(c.booked || 0), cap));
      const ratio = booked / cap;
      return { c, cap, booked, ratio };
    })
    .filter((x) => x.ratio >= NEARLY_FULL_RATIO)
    .sort((a, b) => a.c.startAt.localeCompare(b.c.startAt) || b.ratio - a.ratio)
    .slice(0, max);

  const out: BusinessSignalItem[] = [];
  for (const { c, cap, booked } of scored) {
    const day = weekdayName(c.startAt);
    const when = day ? `${day}` : 'The next';
    const full = booked >= cap;
    const text = full
      ? `${when}’s ${c.name} class is full — ${booked} of ${cap} places booked.`
      : `${when}’s ${c.name} class is nearly full — ${booked} of ${cap} places booked.`;
    assertBriefSafe(text, 'business-signals:class-capacity');
    out.push({
      tag: full ? 'fact' : 'observation',
      kind: 'class_capacity',
      text,
      evidenceDate: c.startAt.slice(0, 10),
    });
  }
  return out;
}

// ── upcoming operational load (§14 — facts before interpretation) ──────────

export function upcomingLoadFact(input: {
  classCount: number;
  appointmentCount: number;
  windowDays: number;
}): BusinessSignalItem | null {
  const c = Math.max(0, Math.trunc(input.classCount || 0));
  const a = Math.max(0, Math.trunc(input.appointmentCount || 0));
  const d = Math.max(1, Math.trunc(input.windowDays || 7));
  if (c === 0 && a === 0) return null;

  const parts: string[] = [];
  if (c > 0) parts.push(`${c} ${c === 1 ? 'class' : 'classes'}`);
  if (a > 0) parts.push(`${a} ${a === 1 ? 'appointment' : 'appointments'}`);
  const text = `${parts.join(' and ')} ${c + a === 1 ? 'is' : 'are'} booked in the next ${d} days.`;
  assertBriefSafe(text, 'business-signals:upcoming-load');
  return { tag: 'fact', kind: 'upcoming_load', text };
}

// ── class demand vs recent weekday pattern (§4C/§4D — history-gated) ───────

/** A trend claim needs at least this many comparable prior weeks (§14). */
export const MIN_DEMAND_WEEKS = 3;
/** Minimum fill-rate gap before we say anything at all. */
const DEMAND_DELTA = 0.15;

export interface DemandInput {
  weekdayLabel: string; // e.g. "Saturday"
  /** mean booked / capacity across this weekday's classes THIS week (0..1) */
  thisWeekFill: number;
  /** mean booked / capacity for the same weekday over the prior weeks (0..1) */
  priorMeanFill: number;
  /** how many prior comparable weeks contributed to priorMeanFill */
  weeksObserved: number;
}

/**
 * Conservative demand comparator. Silent unless there is real history AND a
 * meaningful gap. Phrased as a soft observation, never a verdict — no
 * "underperforming", no "demand is low".
 */
export function classDemandVsPattern(input: DemandInput): BusinessSignalItem | null {
  const label = (input.weekdayLabel || '').trim();
  if (!label) return null;
  if (!Number.isFinite(input.thisWeekFill) || !Number.isFinite(input.priorMeanFill)) return null;
  if ((input.weeksObserved ?? 0) < MIN_DEMAND_WEEKS) return null;

  const delta = input.thisWeekFill - input.priorMeanFill;
  if (Math.abs(delta) < DEMAND_DELTA) return null;

  const pct = Math.round(input.priorMeanFill * 100);
  const text =
    delta > 0
      ? `${label} classes have been busier than your recent pattern — around ${pct}% of capacity booked lately.`
      : `${label} classes have had fewer bookings than your recent ${label} average — around ${pct}% of capacity booked lately.`;
  assertBriefSafe(text, 'business-signals:demand');
  return { tag: 'observation', kind: 'class_demand', text };
}

// ── weekday bucketing helper (used by the aggregator + tested directly) ────

export interface WeekdayFillBucket {
  weekday: number; // 0=Sun..6=Sat
  thisWeekFill: number;
  priorMeanFill: number;
  weeksObserved: number;
}

interface DatedClass {
  startAt: string;
  capacity: number | null;
  booked: number;
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayLabelOf(weekday: number): string {
  return WEEKDAY_LABELS[((weekday % 7) + 7) % 7] ?? '';
}

/** Monday-anchored ISO week key for a 'YYYY-MM-DD' date. */
export function isoWeekKey(dateStr: string): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(t)) return dateStr;
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(t - dow * 864e5).toISOString().slice(0, 10);
}

/**
 * Group class occurrences into per-weekday fill-rate: this week vs the mean of
 * the same weekday across the prior (complete) weeks in the window. Only
 * weekdays that actually run classes both this week and in history are
 * returned. Pure — the aggregator feeds it already-joined rows.
 */
export function bucketWeekdayFill(args: {
  classes: readonly DatedClass[];
  todayLocalDate: string;
  historyWeeks: number;
}): WeekdayFillBucket[] {
  const thisWeek = isoWeekKey(args.todayLocalDate);
  const byWeekWeekday = new Map<string, { fill: number[]; }>();

  for (const c of args.classes) {
    const cap = c.capacity ?? 0;
    if (!(cap > 0)) continue;
    const day = c.startAt.slice(0, 10);
    const wk = isoWeekKey(day);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const key = `${wk}|${weekday}`;
    const bucket = byWeekWeekday.get(key) ?? { fill: [] };
    bucket.fill.push(Math.max(0, Math.min(c.booked, cap)) / cap);
    byWeekWeekday.set(key, bucket);
  }

  const out: WeekdayFillBucket[] = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const thisKey = `${thisWeek}|${weekday}`;
    const thisBucket = byWeekWeekday.get(thisKey);
    if (!thisBucket || thisBucket.fill.length === 0) continue;

    const priorMeans: number[] = [];
    for (let i = 1; i <= args.historyWeeks; i += 1) {
      const wk = isoWeekKey(addDays(thisWeek, -7 * i));
      const b = byWeekWeekday.get(`${wk}|${weekday}`);
      if (b && b.fill.length > 0) {
        priorMeans.push(b.fill.reduce((s, x) => s + x, 0) / b.fill.length);
      }
    }
    if (priorMeans.length === 0) continue;

    out.push({
      weekday,
      thisWeekFill: thisBucket.fill.reduce((s, x) => s + x, 0) / thisBucket.fill.length,
      priorMeanFill: priorMeans.reduce((s, x) => s + x, 0) / priorMeans.length,
      weeksObserved: priorMeans.length,
    });
  }
  return out;
}

export function addDays(dateStr: string, delta: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(t)) return dateStr;
  return new Date(t + delta * 864e5).toISOString().slice(0, 10);
}

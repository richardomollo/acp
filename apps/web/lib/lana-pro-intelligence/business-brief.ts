// LANA PRO — Phase 6 (Step 8): the LanaBusinessBrief domain model + PURE builder.
//
// "Where does my business need attention and what can I do?" — the business-side
// expression of Lana Intelligence. Derived per request from EXISTING operational
// data by `business-aggregator.ts` (which never queries client-progress /
// health / private-coaching tables). NOT persisted.
//
// Same semantics as LanaClientBrief:
//   FACT · OBSERVATION · SUGGESTED ACTION, every string copy-safe, conservative
//   thresholds, no scores / gauges / dashboards.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

import { assertBriefSafe } from '../lana-pro-delivery/copy-safety.ts';
import {
  setupGaps,
  classCapacitySignals,
  upcomingLoadFact,
  classDemandVsPattern,
  normaliseBusinessShape,
  classesRelevant,
  type BusinessShape,
  type BusinessSignalItem,
  type UpcomingClass,
} from './business-signals.ts';
import {
  actionForGap,
  businessAction,
  viewClassAction,
  isRealLanaProRoute,
  type BusinessAction,
} from './business-actions.ts';

// ── model ──────────────────────────────────────────────────────────────

export type BusinessBriefItemTag = 'fact' | 'observation';

export interface BusinessBriefItem {
  tag: BusinessBriefItemTag;
  kind: string;
  text: string;
  /** optional supporting one-liner shown under the main line */
  detail?: string;
  /** the single action this item maps to (already a real Lana Pro route) */
  action?: BusinessAction;
}

export type BusinessBriefState =
  | 'setup' // essentially nothing configured yet
  | 'low_data' // configured, but not enough operating history for patterns
  | 'operational'; // real upcoming activity / capacity to reason about

export interface LanaBusinessBrief {
  businessId: string;
  generatedAt: string;
  shape: BusinessShape;

  /** The attention items in RENDER order (capped). The renderer walks this. */
  items: BusinessBriefItem[];
  /** FACT — verifiable operational statements (a filtered view of `items`). */
  facts: BusinessBriefItem[];
  /** OBSERVATION — conservative derived patterns (a filtered view of `items`). */
  observations: BusinessBriefItem[];
  /** SUGGESTED ACTION — real Lana Pro routes, deduped. */
  suggestedActions: BusinessAction[];

  state: BusinessBriefState;
  dataFreshness: { newestEvidenceDate: string | null; stale: boolean };
}

// ── input (assembled by the aggregator) ────────────────────────────────

export interface BusinessBriefInput {
  businessId: string;
  businessType: string | null;
  nowIso: string;
  todayLocalDate: string;

  setup: {
    hasService: boolean;
    hasSchedule: boolean;
    hasTeam: boolean;
    teamRelevant: boolean;
    hasFacilityAccess: boolean;
  };

  /** classes within the upcoming window, with real qualifying booking counts */
  upcomingClasses: UpcomingClass[];
  upcomingAppointmentCount: number;
  windowDays: number;

  /** history-gated demand comparator input, or null when there isn't enough */
  demand: {
    weekdayLabel: string;
    thisWeekFill: number;
    priorMeanFill: number;
    weeksObserved: number;
  } | null;

  /** newest operational date any evidence rests on */
  newestEvidenceDate: string | null;
}

const HOME_MAX_ITEMS = 4;
const STALE_DAYS = 28;

export function buildBusinessBrief(input: BusinessBriefInput): LanaBusinessBrief {
  const shape = normaliseBusinessShape(input.businessType);

  const facts: BusinessBriefItem[] = [];
  const observations: BusinessBriefItem[] = [];
  const actionQueue: BusinessAction[] = [];

  // ── 1. setup gaps (deterministic; valuable with zero history) ──
  const gaps = setupGaps({
    shape,
    hasService: input.setup.hasService,
    hasSchedule: input.setup.hasSchedule,
    hasTeam: input.setup.hasTeam,
    teamRelevant: input.setup.teamRelevant,
    hasFacilityAccess: input.setup.hasFacilityAccess,
  });
  const gapItems: BusinessBriefItem[] = gaps.map((g) => {
    const action = actionForGap(g.id);
    return { tag: 'observation', kind: `setup:${g.id}`, text: g.text, detail: g.detail, action };
  });

  // ── 2. class capacity (real booking counts, never spots_left) ──
  // Classes are not a relevant concept for an appointment-led spa (§13) — even
  // if stray class rows exist, a spa owner should never see class-capacity or
  // class-demand lines.
  const classSignalsApply = classesRelevant(shape);
  const capacitySignals = classSignalsApply
    ? classCapacitySignals(input.upcomingClasses, { max: 2 })
    : [];
  const capacityItems: BusinessBriefItem[] = capacitySignals.map((s) => {
    const match = input.upcomingClasses.find(
      (c) => c.startAt.slice(0, 10) === s.evidenceDate && s.text.includes(c.name),
    );
    return {
      tag: s.tag,
      kind: s.kind,
      text: s.text,
      action: match ? viewClassAction(match.id) : businessAction('review_schedule'),
    };
  });

  // ── 3. upcoming operational load (a plain fact) ──
  const load = upcomingLoadFact({
    classCount: classSignalsApply ? input.upcomingClasses.length : 0,
    appointmentCount: input.upcomingAppointmentCount,
    windowDays: input.windowDays,
  });
  const loadItem: BusinessBriefItem | null = load
    ? { tag: load.tag, kind: load.kind, text: load.text, action: businessAction('view_bookings') }
    : null;

  // ── 4. demand vs recent pattern (history-gated — usually null) ──
  const demandSignal: BusinessSignalItem | null =
    classSignalsApply && input.demand ? classDemandVsPattern(input.demand) : null;
  const demandItem: BusinessBriefItem | null = demandSignal
    ? {
        tag: demandSignal.tag,
        kind: demandSignal.kind,
        text: demandSignal.text,
        action: businessAction('review_schedule'),
      }
    : null;

  // ── state ──
  const hasUpcoming =
    (classSignalsApply && input.upcomingClasses.length > 0) || input.upcomingAppointmentCount > 0;
  const nothingConfigured = !input.setup.hasService && !input.setup.hasSchedule;
  let state: BusinessBriefState;
  if (nothingConfigured) state = 'setup';
  else if (hasUpcoming || demandItem || capacityItems.length > 0) state = 'operational';
  else state = 'low_data';

  // ── compose (order depends on state) ──
  const ordered: BusinessBriefItem[] = [];
  if (state === 'operational') {
    if (demandItem) ordered.push(demandItem);
    ordered.push(...capacityItems);
    if (loadItem) ordered.push(loadItem);
    ordered.push(...gapItems);
  } else {
    // setup / low_data — gaps lead, the load fact (if any) follows
    ordered.push(...gapItems);
    if (loadItem) ordered.push(loadItem);
  }

  const items: BusinessBriefItem[] = ordered.slice(0, HOME_MAX_ITEMS);
  for (const it of items) {
    assertBriefSafe(it.text, 'business-brief:item');
    if (it.detail) assertBriefSafe(it.detail, 'business-brief:detail');
    (it.tag === 'fact' ? facts : observations).push(it);
    if (it.action) actionQueue.push(it.action);
  }

  // dedupe actions by id, keep first (priority order above)
  const seen = new Set<string>();
  const suggestedActions = actionQueue
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .filter((a) => isRealLanaProRoute(a.href));

  const newest = input.newestEvidenceDate;
  const stale =
    newest != null &&
    Number.isFinite(Date.parse(`${newest}T00:00:00Z`)) &&
    (Date.parse(`${input.todayLocalDate}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) / 864e5 >
      STALE_DAYS;

  return {
    businessId: input.businessId,
    generatedAt: input.nowIso,
    shape,
    items,
    facts,
    observations,
    suggestedActions,
    state,
    dataFreshness: { newestEvidenceDate: newest, stale },
  };
}

// ── helpers for the renderer + whole-bundle safety assertion in tests ────

export function businessBriefStrings(brief: LanaBusinessBrief): string[] {
  return [
    ...brief.items.flatMap((i) => [i.text, i.detail ?? '']),
    ...brief.suggestedActions.map((a) => a.label),
  ].filter(Boolean);
}

/** How many attention items the brief will render on Home. */
export function businessBriefCount(brief: LanaBusinessBrief): number {
  return brief.items.length;
}

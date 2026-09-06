// LANA PRO — Phase 6 (Step 1): the LanaClientBrief domain model + PURE builder.
//
// A trustworthy aggregation layer. NOT a database row — assembled per request
// by the consent-aware server aggregator (`aggregator.ts`) which decides what
// data may even be fetched. This module only shapes already-permitted evidence.
//
// Reuse, not duplication:
//   • `buildProfessionalSessionBrief` (session-brief.ts) does the consent-branch
//     + copy-safe phrasing for previous session, open actions, goal, weight
//     trend, activity count, nutrition, check-in frequency. We call it and
//     RE-CLASSIFY its observations into FACT vs OBSERVATION.
//   • `signals.ts` adds the NET-NEW deterministic signals.
//   • `actions.ts` maps the situation onto real Lana Pro routes.
//   • `copy-safety.ts` guards every rendered string.
//
// Every rendered string is one of: FACT · OBSERVATION · SUGGESTED ACTION.
// Inference is never represented as fact.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

import {
  buildProfessionalSessionBrief,
  type SessionBriefInput,
  type BriefObservation,
  type BriefProvenance,
} from '../lana-pro-delivery/session-brief.ts';
import { assertBriefSafe } from '../lana-pro-delivery/copy-safety.ts';
import { clientResponseLabel, planIntentLabel } from './labels.ts';
import type { ProfessionalFlavour } from '../lana-pro-services/service-taxonomy.ts';
import {
  relationshipWeeks,
  relationshipLengthFact,
  newClientFact,
  sessionsCompletedFact,
  nextSessionFact,
  followUpDueFact,
  experienceFact,
  preferenceFacts,
  secondaryGoalsFact,
  assignedWorkoutAdherence,
  activityVsRecentPattern,
  measurementRecency,
  talkingPointsFor,
  daysBetween,
  type SignalItem,
} from './signals.ts';
import {
  deriveSuggestedActions,
  primaryAction,
  type SuggestedAction,
  type ActionId,
} from './actions.ts';

// ── model ──────────────────────────────────────────────────────────────

export type BriefItemTag = 'fact' | 'observation';

export interface BriefItem {
  tag: BriefItemTag;
  kind: string;
  text: string;
  /** internal only — never rendered */
  provenance: BriefProvenance;
}

export type ClientBriefState =
  | 'no_relationship' // not on this professional's roster in this workspace
  | 'new_client' // active, connected recently, no behavioural evidence yet
  | 'no_shared_progress' // active, but share_progress = false
  | 'no_activity_data' // active + sharing, but nothing observed yet
  | 'evidence'; // active + sharing + at least one observation

export type ProfessionalKind = 'personal_trainer' | 'gym_trainer';

export interface LanaClientBrief {
  clientId: string;
  professionalRef: { kind: ProfessionalKind; id: string };
  generatedAt: string;

  clientContext: {
    name: string;
    goalLabel: string | null;
    relationship: 'active' | 'pending' | 'inactive' | 'none';
    sharesProgress: boolean;
    nextSession: { atIso: string; serviceName: string } | null;
    relationshipWeeks: number | null;
  };

  /** FACT — verifiable, present-tense, from permitted evidence. */
  knownFacts: BriefItem[];
  /** OBSERVATION — a derived pattern, explicitly not a fact. */
  observations: BriefItem[];
  /** SUGGESTED ACTION — workflow links that already exist in Lana Pro. */
  suggestedActions: SuggestedAction[];
  /** "Worth discussing" — soft prompts, never prescriptive. */
  talkingPoints: string[];

  state: ClientBriefState;
  /** never 'high' — this is decision support, not certainty. */
  confidence: 'low' | 'medium';
  dataFreshness: { newestEvidenceDate: string | null; stale: boolean };
}

// ── input (assembled by the aggregator; consent already resolved) ────────

export interface ClientBriefInput {
  clientId: string;
  clientName: string;
  professionalRef: { kind: ProfessionalKind; id: string };
  professionalFlavour: ProfessionalFlavour | null;
  todayLocalDate: string;
  nowIso: string;

  relationship: {
    status: 'active' | 'pending' | 'inactive' | 'none';
    createdAt: string | null;
  };
  /** the aggregator's resolved consent decision */
  sharesProgress: boolean;

  // ── always available (professional-owned / the booking relationship) ──
  nextBooking: { atIso: string; serviceName: string; source: 'appointment' | 'venue'; bookingId: string } | null;
  previousSession:
    | {
        focus: string | null;
        completedAtDate: string | null;
        /** professional's own recorded outcome (Step 6) — evidence, optional */
        clientResponse?: string | null;
        planIntent?: string | null;
      }
    | null;
  completedSessionsCount: number;
  openActionTitles: string[];
  followUpDueOn: string | null;
  hasUpcomingBooking: boolean;

  // ── consent-gated (aggregator passes these ONLY when sharesProgress) ──
  goal?: { label: string | null; secondary: string[] } | null;
  experienceLevel?: string | null;
  preferredActivities?: string[] | null;
  preferredTrainingDays?: string[] | null;
  assignedWorkoutAdherence?: { completed: number; assigned: number; windowDays: number } | null;
  activityPattern?: { thisWeek: number; recentWeeklyMean: number; weeksObserved: number } | null;
  recentWeightsKg?: number[];
  daysSinceLastMeasurement?: number | null;
  checkInCount?: { count: number; windowDays: number } | null;
  nutrition?: { daysWithAnyLog: number; windowDays: number; breakfastDays?: number } | null;
}

// ── builder ────────────────────────────────────────────────────────────

const FACT_KINDS = new Set(['previous_session', 'open_action', 'goal']);
const PREP_WINDOW_DAYS = 2;
const STALE_DAYS = 21;

export function buildClientBrief(input: ClientBriefInput, surface: 'home' | 'detail' = 'detail'): LanaClientBrief {
  const first = (input.clientName || '').trim().split(/\s+/)[0] || 'your client';
  const consented = input.relationship.status === 'active' && input.sharesProgress === true;
  const progressWithheld = input.relationship.status === 'active' && !consented;

  const goalLabel = consented ? (input.goal?.label?.trim() || null) : null;
  const relWeeks = relationshipWeeks(input.relationship.createdAt, input.todayLocalDate);
  const nextSession = input.nextBooking
    ? { atIso: input.nextBooking.atIso, serviceName: input.nextBooking.serviceName }
    : null;

  const clientContext: LanaClientBrief['clientContext'] = {
    name: input.clientName,
    goalLabel,
    relationship: input.relationship.status,
    sharesProgress: consented,
    nextSession,
    relationshipWeeks: relWeeks,
  };

  // ── not on the roster → nothing to say ──
  if (input.relationship.status !== 'active') {
    return {
      clientId: input.clientId,
      professionalRef: input.professionalRef,
      generatedAt: input.nowIso,
      clientContext,
      knownFacts: [],
      observations: [],
      suggestedActions: deriveSuggestedActions({
        clientId: input.clientId,
        nextSession: null,
        followUpDue: false,
        hasUpcomingBooking: input.hasUpcomingBooking,
        hasCompletedSessions: input.completedSessionsCount > 0,
        relationship: input.relationship.status,
        surface,
      }),
      talkingPoints: [],
      state: 'no_relationship',
      confidence: 'low',
      dataFreshness: { newestEvidenceDate: null, stale: false },
    };
  }

  // ── reuse session-brief for the overlapping evidence (consent-branched
  //    inside the builder itself) ──
  const sbInput: SessionBriefInput = {
    clientFirstName: input.clientName,
    serviceName: input.nextBooking?.serviceName || 'Session',
    professionalFlavour: input.professionalFlavour,
    consent: { relationshipStatus: input.relationship.status, shareProgress: input.sharesProgress },
    previousSession: input.previousSession,
    openActions: input.openActionTitles.map((title) => ({ title })),
  };
  if (consented) {
    if (input.goal?.label) sbInput.goal = { label: input.goal.label };
    if (Array.isArray(input.recentWeightsKg) && input.recentWeightsKg.length >= 3) {
      sbInput.recentWeightsKg = input.recentWeightsKg;
    }
    if (input.checkInCount && input.checkInCount.count > 0) sbInput.checkInCount = input.checkInCount;
    if (input.professionalFlavour === 'nutrition' && input.nutrition) sbInput.nutrition = input.nutrition;
    // NOTE: activity is carried by the richer `activityVsRecentPattern`
    // observation from signals.ts (needs multi-week history), so we do NOT
    // also pass `activityCountThisWeek` here — avoids a weak duplicate line.
  }

  const sb = buildProfessionalSessionBrief(sbInput, { maxObservations: 12 });

  const knownFacts: BriefItem[] = [];
  const observations: BriefItem[] = [];
  const dates: string[] = [];

  // 1. re-classify session-brief observations
  for (const o of sb.observations) {
    const item: BriefItem = { tag: FACT_KINDS.has(o.kind) ? 'fact' : 'observation', kind: o.kind, text: o.text, provenance: o.provenance };
    (item.tag === 'fact' ? knownFacts : observations).push(item);
  }
  if (input.previousSession?.completedAtDate) dates.push(input.previousSession.completedAtDate);

  // 1b. last-session OUTCOME facts (Step 6 — the professional's own recorded
  //     observation + chosen direction; evidence, not inference).
  const prevResponse = clientResponseLabel(input.previousSession?.clientResponse);
  const prevIntent = planIntentLabel(input.previousSession?.planIntent);
  if (prevResponse) {
    const t = `You recorded the last session as ${prevResponse.toLowerCase()}.`;
    assertBriefSafe(t, 'client-brief:client_response');
    knownFacts.push({ tag: 'fact', kind: 'previous_session', text: t, provenance: { source: 'previous_session', detail: 'client_response' } });
  }
  if (prevIntent) {
    const t = `Your plan after the last session was to ${prevIntent.toLowerCase()}.`;
    assertBriefSafe(t, 'client-brief:plan_intent');
    knownFacts.push({ tag: 'fact', kind: 'previous_session', text: t, provenance: { source: 'previous_session', detail: 'plan_intent' } });
  }

  // 2. net-new relationship FACTS (professional-owned — always allowed)
  pushSignal(knownFacts, dates, nextSessionFact(nextSession, input.todayLocalDate));
  pushSignal(knownFacts, dates, followUpDueFact(input.followUpDueOn, input.todayLocalDate));
  const newClient = newClientFact(input.relationship.createdAt, input.todayLocalDate);
  pushSignal(knownFacts, dates, newClient);
  pushSignal(knownFacts, dates, sessionsCompletedFact(input.completedSessionsCount));
  if (!newClient) pushSignal(knownFacts, dates, relationshipLengthFact(input.relationship.createdAt, input.todayLocalDate));

  // 3. net-new profile FACTS (consent-gated)
  if (consented) {
    pushSignal(knownFacts, dates, experienceFact(input.experienceLevel));
    for (const f of preferenceFacts({
      preferredActivities: input.preferredActivities,
      preferredTrainingDays: input.preferredTrainingDays,
    })) {
      pushSignal(knownFacts, dates, f);
    }
    pushSignal(knownFacts, dates, secondaryGoalsFact(input.goal?.secondary, input.goal?.label ?? null));
  }

  // 4. net-new behavioural OBSERVATIONS (consent-gated)
  let activityBelowPattern = false;
  let hasAdherence = false;
  let measurementStale = false;
  if (consented) {
    const adh = assignedWorkoutAdherence({
      completed: input.assignedWorkoutAdherence?.completed ?? 0,
      assigned: input.assignedWorkoutAdherence?.assigned ?? 0,
      windowDays: input.assignedWorkoutAdherence?.windowDays ?? 0,
      clientName: input.clientName,
    });
    if (adh) {
      hasAdherence = true;
      pushSignal(observations, dates, adh);
      dates.push(input.todayLocalDate);
    }
    if (input.activityPattern) {
      const ap = activityVsRecentPattern(input.activityPattern);
      if (ap) {
        activityBelowPattern = ap.text.includes('lower');
        pushSignal(observations, dates, ap);
        dates.push(input.todayLocalDate);
      }
    }
    const mr = measurementRecency({
      daysSinceLastMeasurement: input.daysSinceLastMeasurement,
      todayLocalDate: input.todayLocalDate,
    });
    if (mr) {
      measurementStale = mr.kind === 'measurement_recency' && mr.text.includes('over three weeks');
      pushSignal(observations, dates, mr);
    }
  }

  // ── talking points ──
  const nutritionInconsistent =
    consented &&
    input.professionalFlavour === 'nutrition' &&
    !!input.nutrition &&
    input.nutrition.daysWithAnyLog < Math.ceil(input.nutrition.windowDays / 2);
  const talkingPoints = talkingPointsFor({
    previousFocus: input.previousSession?.focus,
    lastSessionDifficult: input.previousSession?.clientResponse === 'difficult',
    hasAdherence,
    activityBelowPattern,
    measurementStale,
    nutritionInconsistent,
    isNewClient: !!newClient && observations.length === 0,
  });
  if (talkingPoints.length === 0 && sb.suggestedFocus) {
    assertBriefSafe(sb.suggestedFocus, 'client-brief:suggested_focus');
    talkingPoints.push(sb.suggestedFocus);
  }

  // ── suggested actions ──
  const daysToNext = input.nextBooking ? bookingDaysAway(input.nextBooking.atIso, input.todayLocalDate) : null;
  const nextWithinPrep = daysToNext != null && daysToNext >= 0 && daysToNext <= PREP_WINDOW_DAYS;
  const suggestedActions = deriveSuggestedActions({
    clientId: input.clientId,
    nextSession:
      input.nextBooking && nextWithinPrep
        ? { source: input.nextBooking.source, bookingId: input.nextBooking.bookingId, withinPrepWindow: true }
        : null,
    followUpDue: !!input.followUpDueOn && input.followUpDueOn <= input.todayLocalDate,
    hasUpcomingBooking: input.hasUpcomingBooking,
    hasCompletedSessions: input.completedSessionsCount > 0,
    relationship: input.relationship.status,
    surface,
  });

  // ── state ──
  let state: ClientBriefState;
  if (progressWithheld) state = 'no_shared_progress';
  else if (newClient && observations.length === 0) state = 'new_client';
  else if (observations.length === 0) state = 'no_activity_data';
  else state = 'evidence';

  // ── freshness ──
  const newestEvidenceDate = dates.length ? dates.slice().sort().at(-1)! : null;
  const stale =
    newestEvidenceDate != null &&
    (daysBetween(newestEvidenceDate, input.todayLocalDate) ?? 0) > STALE_DAYS;

  const confidence: 'low' | 'medium' =
    observations.length >= 2 && !stale ? 'medium' : 'low';

  return {
    clientId: input.clientId,
    professionalRef: input.professionalRef,
    generatedAt: input.nowIso,
    clientContext,
    knownFacts: knownFacts.slice(0, surface === 'home' ? 3 : 6),
    observations: observations.slice(0, surface === 'home' ? 2 : 5),
    suggestedActions,
    talkingPoints,
    state,
    confidence,
    dataFreshness: { newestEvidenceDate, stale },
  };
}

/** The one line Home shows under "Recent pattern". */
export function topObservation(brief: LanaClientBrief): string | null {
  return brief.observations[0]?.text ?? null;
}
/** The one line Home shows under "Lana suggests". */
export function topTalkingPoint(brief: LanaClientBrief): string | null {
  return brief.talkingPoints[0] ?? null;
}
export { primaryAction };
export type { SuggestedAction, ActionId };

/** Every rendered string in a brief — for a whole-bundle safety assert in tests. */
export function briefStrings(brief: LanaClientBrief): string[] {
  return [
    ...brief.knownFacts.map((f) => f.text),
    ...brief.observations.map((o) => o.text),
    ...brief.talkingPoints,
    ...brief.suggestedActions.map((a) => a.label),
    ...brief.suggestedActions.map((a) => a.rationale ?? '').filter(Boolean),
  ];
}

// ── helpers ────────────────────────────────────────────────────────────

function pushSignal(target: BriefItem[], dates: string[], sig: SignalItem | null) {
  if (!sig) return;
  target.push({ tag: sig.tag, kind: sig.kind, text: sig.text, provenance: sig.provenance });
  if (sig.evidenceDate) dates.push(sig.evidenceDate);
}

function bookingDaysAway(atIso: string, todayLocalDate: string): number | null {
  const at = Date.parse(atIso.length <= 10 ? `${atIso}T00:00:00Z` : `${atIso}Z`);
  const today = Date.parse(`${todayLocalDate}T00:00:00Z`);
  if (!Number.isFinite(at) || !Number.isFinite(today)) return null;
  return Math.round((at - today) / 864e5);
}
